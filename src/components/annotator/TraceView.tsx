"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Trace } from "@/lib/trace/types";
import type { LabelRow } from "@/lib/labels/types";
import { serialize, mimeType, fileName } from "@/lib/labels/serialize";
import {
  extractToolCalls,
  type ToolCallVerdict,
} from "@/lib/trace/tool-calls";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";
import { TagManagementPanel } from "./TagManagementPanel";
import { ToolCallReviewPanel } from "./ToolCallReviewPanel";
import { SimilarityPanel } from "./SimilarityPanel";
import { useStateRef } from "@/hooks/useStateRef";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  CoachingTip,
  MilestoneTip,
  TipsProgressChip,
  computeTaxonomyStats,
  dismissCoachingPermanent,
  dismissCoachingSession,
  dismissMilestone,
  dismissTipsChipSession,
  getMilestoneForIndex,
  isCoachingActive,
  isTipsChipDismissed,
  resetCoaching,
} from "./CoachingTip";
import {
  appendAuditEntriesBatch,
  appendAuditEntry,
  clearAdapter,
  loadAdapter,
  loadCoachingEnabled,
  loadHotkeys,
  loadMode,
  loadRecentAuditEntries,
  saveAdapter,
  saveCoachingEnabled,
  saveHotkeys,
  saveLabels,
  saveMode,
  saveSessionState,
  type AuditEntry,
  type AdapterRecord,
  type Hotkeys,
  type Mode,
  DEFAULT_HOTKEYS,
} from "@/lib/storage";
import {
  ADAPTER_EXAMPLE,
  parseAdapterDSL,
} from "@/lib/trace/adapter-dsl";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { BatchPanel } from "./BatchPanel";
import {
  estimateSecondsRemaining,
  formatRemaining,
} from "@/lib/time-estimate";

export type Verdict = "pass" | "fail";
export type Annotation = {
  verdict: Verdict | null;
  note: string;
  tags: string[];
  labeledAt: string;
  isEdited: boolean;
  // skipped is a "needs review later" marker. Independent of verdict so a
  // user can mark a trace skipped before deciding pass/fail.
  skipped: boolean;
  // Per-tool-call correctness verdicts (v3, #37 power analysis - tool-call
  // review). Keyed by the tool call's stable index.
  toolCallReviews?: Record<number, "right" | "wrong" | "skip">;
};
export type Annotations = Record<string, Annotation>;

export type Filter =
  | { kind: "all" }
  | { kind: "verdict"; v: Verdict | "unlabeled" | "skipped" }
  | { kind: "tag"; tag: string }
  | { kind: "sample"; indices: Set<number> };

const EMPTY_ANNOTATION: Annotation = {
  verdict: null,
  note: "",
  tags: [],
  labeledAt: "",
  isEdited: false,
  skipped: false,
};

// Quiet Notebook hotkey count: top 9 visible suggestions get 1-9 badges.
const HOTKEY_MAX = 9;

function hasToolCallReviews(a: Annotation): boolean {
  return !!a.toolCallReviews && Object.keys(a.toolCallReviews).length > 0;
}

function toRows(annotations: Annotations): LabelRow[] {
  return Object.entries(annotations)
    .filter(
      ([, a]) =>
        a.verdict !== null ||
        a.tags.length > 0 ||
        a.note.trim() !== "" ||
        hasToolCallReviews(a),
    )
    .map(([id, a]) => annotationToRow(id, a));
}

function annotationToRow(trace_id: string, a: Annotation): LabelRow {
  const row: LabelRow = {
    trace_id,
    verdict: a.verdict,
    tags: a.tags,
    note: a.note,
    labeled_at: a.labeledAt || new Date().toISOString(),
  };
  if (hasToolCallReviews(a)) row.tool_call_reviews = a.toolCallReviews;
  return row;
}

function isEmptyAnnotation(a: Annotation): boolean {
  return (
    a.verdict === null &&
    a.tags.length === 0 &&
    a.note.trim() === "" &&
    !hasToolCallReviews(a)
  );
}

function getOrEmpty(annotations: Annotations, id: string): Annotation {
  return annotations[id] ?? EMPTY_ANNOTATION;
}

function templateLabelForTrace(trace: Trace): string {
  const md = (trace.metadata ?? {}) as Record<string, unknown>;
  if (typeof md.kind === "string") return md.kind;
  // Best-effort detection from data shape so the chip is not blank for
  // most files. The renderer already does the structural mapping; we just
  // give the chip a friendly label.
  if (Array.isArray(md.chunks) || typeof md.retrieved_context === "string") {
    return "RAG";
  }
  if (typeof md.source_doc === "string" || typeof md.summary === "string") {
    return "Summarizer";
  }
  if ((trace.input.length + trace.output.length) > 0) return "Chat";
  return "Generic";
}

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string };

type Props = {
  traces: Trace[];
  filename: string;
  fingerprint: string;
  onReset: () => void;
  initialAnnotations?: Annotations;
  initialIndex?: number;
  storageUnavailable?: boolean;
};

export function TraceView({
  traces,
  filename,
  fingerprint,
  onReset,
  initialAnnotations = {},
  initialIndex = 0,
  storageUnavailable = false,
}: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [annotations, setAnnotations, annotationsRef] =
    useStateRef<Annotations>(initialAnnotations);

  // Coaching state. coachingEnabled is the user's persistent preference;
  // coachingActive is the per-session signal that combines it with the
  // session/permanent dismiss flags. Setting toggles update both so a
  // mid-session "turn coaching off" hides the cards immediately.
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const [coachingActive, setCoachingActive] = useState(false);
  const [tipsChipDismissed, setTipsChipDismissed] = useState(false);
  useEffect(() => {
    setCoachingEnabled(loadCoachingEnabled());
    setCoachingActive(isCoachingActive());
    setTipsChipDismissed(isTipsChipDismissed());
  }, []);

  const [saveStatus, setSaveStatus] = useState<SaveStatus>(
    storageUnavailable
      ? {
          kind: "error",
          message:
            "Browser storage is unavailable. Your labels won't persist across reloads. Export often to keep your work.",
        }
      : { kind: "idle" },
  );
  const [milestone, setMilestone] = useState<ReturnType<
    typeof getMilestoneForIndex
  > | null>(null);

  type UndoChange = {
    trace_id: string;
    before: Annotation;
    after: Annotation;
  };
  type UndoEntry = {
    changes: UndoChange[];
    batchId?: string;
  };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);
  const [tagPanelOpen, setTagPanelOpen] = useState(false);

  const [filter, setFilter] = useState<Filter>({ kind: "all" });

  const [hotkeys, setHotkeys] = useState<Hotkeys>(DEFAULT_HOTKEYS);
  useEffect(() => {
    setHotkeys(loadHotkeys());
  }, []);
  const [mode, setMode] = useState<Mode>("novice");
  useEffect(() => {
    setMode(loadMode());
  }, []);
  const [auditRecent, setAuditRecent] = useState<AuditEntry[]>([]);
  const [auditWriteCount, setAuditWriteCount] = useState(0);
  const bumpAuditWrites = useCallback(() => {
    setAuditWriteCount((c) => c + 1);
  }, []);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingBulkVerdict, setPendingBulkVerdict] = useState<{
    verdict: Verdict;
    overwrites: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);

  const [allTags, setAllTags] = useState<string[]>(() => {
    const tagSet = new Set<string>();
    for (const a of Object.values(initialAnnotations)) {
      for (const t of a.tags) tagSet.add(t);
    }
    return Array.from(tagSet);
  });

  // Tag input lives in the rail. Ref so the T hotkey can focus it; query
  // state is shared by the cloud filter + Enter-creates-new path.
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [tagQuery, setTagQuery] = useState("");
  const [showAllTags, setShowAllTags] = useState(false);

  const total = traces.length;
  const trace = traces[index];
  const annotation = getOrEmpty(annotations, trace.id);
  const labeledCount = Object.values(annotations).filter((a) => a.verdict !== null).length;
  const passCount = Object.values(annotations).filter((a) => a.verdict === "pass").length;
  const failCount = Object.values(annotations).filter((a) => a.verdict === "fail").length;
  const skippedCount = Object.values(annotations).filter((a) => a.skipped).length;
  const unlabeledCount = total - labeledCount;
  const toolCalls = useMemo(() => extractToolCalls(trace), [trace]);
  const toolCallReviewedCount = annotation.toolCallReviews
    ? Object.keys(annotation.toolCallReviews).length
    : 0;

  // Aggregate tag counts (used for the rail's suggestion ordering and for
  // milestone-card stats). Recomputed on every render but the dataset is
  // bounded by the file size so this is cheap.
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of Object.values(annotations)) {
      for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }, [annotations]);

  // Sort tags for the suggestion cloud: most-used first, then alphabetical
  // for ties. Unused tags (count 0) live at the bottom but stay visible
  // because the user might be re-applying after a delete. Memoized off
  // tagCounts and allTags so the same order is stable across renders.
  const sortedTags = useMemo(() => {
    return [...allTags].sort((a, b) => {
      const ca = tagCounts.get(a) ?? 0;
      const cb = tagCounts.get(b) ?? 0;
      if (ca !== cb) return cb - ca;
      return a.localeCompare(b);
    });
  }, [allTags, tagCounts]);

  // Filter the cloud by the current tag input.
  const matchingTags = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    const applied = new Set(annotation.tags);
    return sortedTags.filter((t) => !applied.has(t) && (!q || t.toLowerCase().includes(q)));
  }, [sortedTags, tagQuery, annotation.tags]);

  const visibleTagSuggestions = (showAllTags || tagQuery)
    ? matchingTags
    : matchingTags.slice(0, HOTKEY_MAX);
  const hiddenSuggestionCount = Math.max(
    0,
    matchingTags.length - visibleTagSuggestions.length,
  );

  useEffect(() => {
    let cancelled = false;
    loadRecentAuditEntries(fingerprint, 25)
      .then((entries) => {
        if (!cancelled) setAuditRecent(entries);
      })
      .catch(() => {
        // Storage unavailable; the existing storageUnavailable banner
        // already tells the user. The estimator subline simply hides.
      });
    return () => {
      cancelled = true;
    };
  }, [fingerprint, auditWriteCount]);
  const remainingSeconds = estimateSecondsRemaining(
    auditRecent,
    total,
    labeledCount,
  );

  const matchesFilter = useCallback(
    (idx: number, anns: Annotations): boolean => {
      switch (filter.kind) {
        case "all":
          return true;
        case "verdict": {
          const a = anns[traces[idx].id];
          if (filter.v === "unlabeled") return !a || (a.verdict === null && !a.skipped);
          if (filter.v === "skipped") return !!a && a.skipped;
          return a?.verdict === filter.v;
        }
        case "tag": {
          const a = anns[traces[idx].id];
          return !!a && a.tags.includes(filter.tag);
        }
        case "sample":
          return filter.indices.has(idx);
      }
    },
    [filter, traces],
  );

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const dir = delta < 0 ? -1 : 1;
        for (let next = i + dir; next >= 0 && next < total; next += dir) {
          if (matchesFilter(next, annotationsRef.current)) return next;
        }
        return i;
      });
    },
    [total, matchesFilter, annotationsRef],
  );

  function jumpTo(traceNumberOneIndexed: number) {
    const idx = Math.max(0, Math.min(total - 1, traceNumberOneIndexed - 1));
    setIndex(idx);
  }

  function sampleRandom(count: number) {
    if (count <= 0 || count >= total) {
      setFilter({ kind: "all" });
      return;
    }
    const picked = new Set<number>();
    while (picked.size < count) {
      picked.add(Math.floor(Math.random() * total));
    }
    setFilter({ kind: "sample", indices: picked });
    const sortedFirst = Math.min(...Array.from(picked));
    setIndex(sortedFirst);
  }

  const jumpToNextUnlabeled = useCallback(
    (currentIndex: number, currentAnnotations: Annotations) => {
      const isMatch = (i: number) =>
        matchesFilter(i, currentAnnotations) &&
        !currentAnnotations[traces[i].id]?.verdict;
      for (let i = currentIndex + 1; i < total; i++) {
        if (isMatch(i)) {
          setIndex(i);
          return;
        }
      }
      for (let i = 0; i < currentIndex; i++) {
        if (isMatch(i)) {
          setIndex(i);
          return;
        }
      }
    },
    [traces, total, matchesFilter],
  );

  const pushUndo = useCallback(
    (trace_id: string, before: Annotation, after: Annotation) => {
      const stack = undoStackRef.current;
      stack.push({ changes: [{ trace_id, before, after }] });
      if (stack.length > 100) stack.shift();
      setUndoCount(stack.length);
      // Any new user action invalidates the redo stack - matches every
      // editor's undo/redo semantics.
      redoStackRef.current = [];
      setRedoCount(0);
      appendAuditEntry({
        fingerprint,
        trace_id,
        at: new Date().toISOString(),
        before: isEmptyAnnotation(before) ? null : annotationToRow(trace_id, before),
        after: isEmptyAnnotation(after) ? null : annotationToRow(trace_id, after),
      }).catch(() => {});
      bumpAuditWrites();
    },
    [fingerprint, bumpAuditWrites],
  );

  const applyVerdict = useCallback(
    (v: Verdict) => {
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      const isEdited = cur.isEdited || (cur.verdict !== null && cur.verdict !== v);
      const next: Annotation = {
        ...cur,
        verdict: v,
        isEdited,
        skipped: false,
        labeledAt: cur.labeledAt || new Date().toISOString(),
      };
      setAnnotations({ ...prev, [trace.id]: next });
      pushUndo(trace.id, cur, next);
    },
    [trace.id, pushUndo, setAnnotations, annotationsRef],
  );

  const toggleSelected = useCallback((traceId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAllMatching = useCallback(() => {
    const ids = new Set<string>();
    const anns = annotationsRef.current;
    for (let i = 0; i < total; i++) {
      if (matchesFilter(i, anns)) ids.add(traces[i].id);
    }
    setSelectedIds(ids);
  }, [total, traces, matchesFilter, annotationsRef]);

  const matchingCount = (() => {
    let count = 0;
    for (let i = 0; i < total; i++) {
      if (matchesFilter(i, annotations)) count++;
    }
    return count;
  })();

  function generateBatchId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return `batch-${crypto.randomUUID()}`;
    }
    return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  const performBatchVerdict = useCallback(
    (v: Verdict) => {
      if (selectedIds.size === 0) return;
      const prev = annotationsRef.current;
      const batchId = generateBatchId();
      const at = new Date().toISOString();
      const next = { ...prev };
      const changes: UndoChange[] = [];
      const auditEntries: AuditEntry[] = [];
      for (const id of selectedIds) {
        const cur = getOrEmpty(prev, id);
        const isEdited =
          cur.isEdited || (cur.verdict !== null && cur.verdict !== v);
        const after: Annotation = {
          ...cur,
          verdict: v,
          isEdited,
          skipped: false,
          labeledAt: cur.labeledAt || at,
        };
        next[id] = after;
        changes.push({ trace_id: id, before: cur, after });
        auditEntries.push({
          fingerprint,
          trace_id: id,
          at,
          before: isEmptyAnnotation(cur) ? null : annotationToRow(id, cur),
          after: annotationToRow(id, after),
          batchId,
        });
      }
      if (changes.length === 0) return;
      setAnnotations(next);
      const stack = undoStackRef.current;
      stack.push({ changes, batchId });
      if (stack.length > 100) stack.shift();
      setUndoCount(stack.length);
      redoStackRef.current = [];
      setRedoCount(0);
      appendAuditEntriesBatch(auditEntries).catch(() => {});
      bumpAuditWrites();
    },
    [fingerprint, selectedIds, setAnnotations, annotationsRef, bumpAuditWrites],
  );

  const applyBatchVerdict = useCallback(
    (v: Verdict) => {
      if (selectedIds.size === 0) return;
      const prev = annotationsRef.current;
      let overwrites = 0;
      for (const id of selectedIds) {
        const cur = prev[id];
        if (cur && cur.verdict !== null && cur.verdict !== v) overwrites++;
      }
      if (overwrites > 0) {
        setPendingBulkVerdict({ verdict: v, overwrites });
        return;
      }
      performBatchVerdict(v);
    },
    [selectedIds, annotationsRef, performBatchVerdict],
  );

  const applyToolCallReview = useCallback(
    (toolCallIndex: number, verdict: ToolCallVerdict | null) => {
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      const nextReviews: Record<number, ToolCallVerdict> = {
        ...(cur.toolCallReviews ?? {}),
      };
      if (verdict === null) {
        delete nextReviews[toolCallIndex];
      } else {
        nextReviews[toolCallIndex] = verdict;
      }
      const next: Annotation = {
        ...cur,
        labeledAt: cur.labeledAt || new Date().toISOString(),
        toolCallReviews:
          Object.keys(nextReviews).length > 0 ? nextReviews : undefined,
      };
      setAnnotations({ ...prev, [trace.id]: next });
      pushUndo(trace.id, cur, next);
    },
    [trace.id, pushUndo, setAnnotations, annotationsRef],
  );

  const toggleSkip = useCallback(() => {
    const prev = annotationsRef.current;
    const cur = getOrEmpty(prev, trace.id);
    const next: Annotation = {
      ...cur,
      skipped: !cur.skipped,
      labeledAt: cur.labeledAt || new Date().toISOString(),
    };
    setAnnotations({ ...prev, [trace.id]: next });
    pushUndo(trace.id, cur, next);
  }, [trace.id, pushUndo, setAnnotations, annotationsRef]);

  // Apply an undo entry's `before` snapshot, returning the next annotations
  // map. Used by both undo (pop the stack) and redo (replay an inverse).
  const applyUndoEntry = useCallback(
    (entry: UndoEntry, direction: "undo" | "redo") => {
      setAnnotations((prev) => {
        const next = { ...prev };
        for (const c of entry.changes) {
          const target = direction === "undo" ? c.before : c.after;
          if (
            target.verdict === null &&
            target.tags.length === 0 &&
            target.note === ""
          ) {
            delete next[c.trace_id];
          } else {
            next[c.trace_id] = target;
          }
        }
        return next;
      });
      const firstChange = entry.changes[0];
      if (firstChange) {
        const targetIdx = traces.findIndex(
          (t) => t.id === firstChange.trace_id,
        );
        if (targetIdx >= 0 && targetIdx !== index) setIndex(targetIdx);
      }
    },
    [index, traces, setAnnotations],
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    const last = stack.pop();
    if (!last) return;
    setUndoCount(stack.length);
    redoStackRef.current.push(last);
    setRedoCount(redoStackRef.current.length);
    applyUndoEntry(last, "undo");
  }, [applyUndoEntry]);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    const last = stack.pop();
    if (!last) return;
    setRedoCount(stack.length);
    undoStackRef.current.push(last);
    setUndoCount(undoStackRef.current.length);
    applyUndoEntry(last, "redo");
  }, [applyUndoEntry]);

  const addTagToSession = useCallback((tag: string) => {
    setAllTags((prev) => {
      const without = prev.filter((t) => t !== tag);
      return [tag, ...without];
    });
  }, []);

  const renameTagGlobally = useCallback((oldTag: string, newTag: string) => {
    setAnnotations((prev) => {
      const next: Annotations = {};
      for (const [id, a] of Object.entries(prev)) {
        if (!a.tags.includes(oldTag)) {
          next[id] = a;
          continue;
        }
        const renamed = a.tags.map((t) => (t === oldTag ? newTag : t));
        const deduped = Array.from(new Set(renamed));
        next[id] = { ...a, tags: deduped };
      }
      return next;
    });
    setAllTags((prev) => {
      const renamed = prev.map((t) => (t === oldTag ? newTag : t));
      return Array.from(new Set(renamed));
    });
  }, [setAnnotations]);

  const deleteTagGlobally = useCallback((tag: string) => {
    setAnnotations((prev) => {
      const next: Annotations = {};
      for (const [id, a] of Object.entries(prev)) {
        if (!a.tags.includes(tag)) {
          next[id] = a;
          continue;
        }
        next[id] = { ...a, tags: a.tags.filter((t) => t !== tag) };
      }
      return next;
    });
    setAllTags((prev) => prev.filter((t) => t !== tag));
  }, [setAnnotations]);

  const applyBatchTag = useCallback(
    (tag: string) => {
      const cleanTag = tag.trim();
      if (selectedIds.size === 0 || cleanTag === "") return;
      const prev = annotationsRef.current;
      const batchId = generateBatchId();
      const at = new Date().toISOString();
      const next = { ...prev };
      const changes: UndoChange[] = [];
      const auditEntries: AuditEntry[] = [];
      for (const id of selectedIds) {
        const cur = getOrEmpty(prev, id);
        if (cur.tags.includes(cleanTag)) continue;
        const after: Annotation = {
          ...cur,
          tags: [...cur.tags, cleanTag],
          labeledAt: cur.labeledAt || at,
        };
        next[id] = after;
        changes.push({ trace_id: id, before: cur, after });
        auditEntries.push({
          fingerprint,
          trace_id: id,
          at,
          before: isEmptyAnnotation(cur) ? null : annotationToRow(id, cur),
          after: annotationToRow(id, after),
          batchId,
        });
      }
      if (changes.length === 0) return;
      setAnnotations(next);
      addTagToSession(cleanTag);
      const stack = undoStackRef.current;
      stack.push({ changes, batchId });
      if (stack.length > 100) stack.shift();
      setUndoCount(stack.length);
      redoStackRef.current = [];
      setRedoCount(0);
      appendAuditEntriesBatch(auditEntries).catch(() => {});
      bumpAuditWrites();
    },
    [
      fingerprint,
      selectedIds,
      addTagToSession,
      setAnnotations,
      annotationsRef,
      bumpAuditWrites,
    ],
  );

  // applyTagToCurrent - the single-trace add tag path. Replaces the v3
  // applyQuickTag path; the consolidated rail now has only one tag entry
  // surface (input + cloud).
  const applyTagToCurrent = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      if (!tag) return;
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      if (cur.tags.includes(tag)) {
        addTagToSession(tag);
        return;
      }
      const next: Annotation = {
        ...cur,
        tags: [...cur.tags, tag],
        labeledAt: cur.labeledAt || new Date().toISOString(),
      };
      setAnnotations({ ...prev, [trace.id]: next });
      addTagToSession(tag);
      pushUndo(trace.id, cur, next);
      setTagQuery("");
    },
    [trace.id, addTagToSession, pushUndo, setAnnotations, annotationsRef],
  );

  const removeTagFromCurrent = useCallback(
    (tag: string) => {
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      if (!cur.tags.includes(tag)) return;
      const next: Annotation = {
        ...cur,
        tags: cur.tags.filter((t) => t !== tag),
      };
      setAnnotations({ ...prev, [trace.id]: next });
      pushUndo(trace.id, cur, next);
    },
    [trace.id, setAnnotations, pushUndo, annotationsRef],
  );

  const setNote = useCallback(
    (note: string) => {
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      if (cur.note === note) return;
      const next: Annotation = {
        ...cur,
        note,
        labeledAt: cur.labeledAt || new Date().toISOString(),
      };
      setAnnotations({ ...prev, [trace.id]: next });
    },
    [trace.id, setAnnotations, annotationsRef],
  );

  // Note edits don't push individual undo entries (they fire on every
  // keystroke - that would flood the stack). On blur we record one undo
  // entry covering the whole edit.
  const noteSnapshotRef = useRef<Annotation | null>(null);
  const onNoteFocus = useCallback(() => {
    noteSnapshotRef.current = annotationsRef.current[trace.id] ?? null;
  }, [trace.id, annotationsRef]);
  const onNoteBlur = useCallback(() => {
    const snap = noteSnapshotRef.current;
    noteSnapshotRef.current = null;
    if (!snap) return;
    const cur = annotationsRef.current[trace.id] ?? null;
    if (!cur) return;
    if (snap.note === cur.note) return;
    pushUndo(trace.id, snap, cur);
  }, [trace.id, pushUndo, annotationsRef]);

  // Keyboard handler. Supports the Quiet Notebook hotkey map:
  //   P/F/S, T, U, 1-9, arrows, Ctrl+K, Ctrl+Z / Ctrl+Shift+Z, Esc.
  // Hotkeys for verdict/skip/labelNext/focusTag come from the user's
  // Settings config so rebinds keep working.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Cmd/Ctrl+K - Find. Allowed even inside an input field so the user
      // can pivot off the trace into search.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setFindOpen(true);
        return;
      }

      // Cmd/Ctrl+Z (undo) / Cmd/Ctrl+Shift+Z (redo).
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }

      // Esc closes overlays and clears selection. Always handled even if
      // focus is on an input so the user can bail out from anywhere.
      if (e.key === "Escape") {
        if (settingsOpen || tagPanelOpen || findOpen) {
          setSettingsOpen(false);
          setTagPanelOpen(false);
          setFindOpen(false);
          return;
        }
        if (selectedIds.size > 0) {
          clearSelection();
          return;
        }
        return;
      }

      // The rest of the hotkeys are suppressed while typing.
      if (inInput) return;

      // ? = toggle coaching tips. Only meaningful when the master setting
      // is on; with coachingEnabled=false the keystroke is a no-op.
      if (e.key === "?") {
        e.preventDefault();
        if (!coachingEnabled) return;
        if (coachingActive) {
          dismissCoachingSession();
          setCoachingActive(false);
        } else {
          resetCoaching();
          setCoachingActive(true);
          setTipsChipDismissed(false);
        }
        return;
      }

      const k = e.key;
      const matches = (configured: string) =>
        k === configured ||
        (configured.length === 1 && k.toLowerCase() === configured.toLowerCase());

      if (matches(hotkeys.pass)) {
        applyVerdict("pass");
      } else if (matches(hotkeys.fail)) {
        applyVerdict("fail");
      } else if (k === "ArrowRight" || matches(hotkeys.next)) {
        if (!e.shiftKey) go(1);
      } else if (k === "ArrowLeft" || matches(hotkeys.prev)) {
        go(-1);
      } else if (matches(hotkeys.labelNext)) {
        jumpToNextUnlabeled(index, annotationsRef.current);
      } else if (matches(hotkeys.skip)) {
        toggleSkip();
      } else if (matches(hotkeys.focusTag)) {
        e.preventDefault();
        tagInputRef.current?.focus();
      } else if (k >= "1" && k <= "9") {
        const i = Number(k) - 1;
        const visible = visibleTagSuggestions[i];
        if (visible) applyTagToCurrent(visible);
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    go,
    applyVerdict,
    applyTagToCurrent,
    jumpToNextUnlabeled,
    index,
    visibleTagSuggestions,
    undo,
    redo,
    toggleSkip,
    hotkeys,
    annotationsRef,
    coachingActive,
    coachingEnabled,
    settingsOpen,
    tagPanelOpen,
    findOpen,
    selectedIds.size,
    clearSelection,
  ]);

  useEffect(() => {
    setMilestone(getMilestoneForIndex(fingerprint, index));
  }, [fingerprint, index]);

  // Reset the suggestion-cloud "show all" toggle when the user moves to a
  // different trace or when the input is cleared.
  useEffect(() => {
    setShowAllTags(false);
  }, [index, tagQuery]);

  // Autosave labels via the IndexedDB primitive.
  const saveLabelsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstPendingAtRef = useRef<number | null>(null);
  const SAVE_DEBOUNCE_MS = 500;
  const SAVE_MAX_WAIT_MS = 3000;
  useEffect(() => {
    const rows = toRows(annotations);
    if (saveLabelsTimerRef.current) clearTimeout(saveLabelsTimerRef.current);
    setSaveStatus({ kind: "saving" });
    if (firstPendingAtRef.current === null) {
      firstPendingAtRef.current = Date.now();
    }
    const pendingFor = Date.now() - firstPendingAtRef.current;
    const delay = pendingFor >= SAVE_MAX_WAIT_MS ? 0 : SAVE_DEBOUNCE_MS;
    saveLabelsTimerRef.current = setTimeout(() => {
      saveLabels(fingerprint, rows)
        .then(() => {
          firstPendingAtRef.current = null;
          const at = new Date().toLocaleTimeString();
          setSaveStatus({ kind: "saved", at });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Save failed";
          setSaveStatus({ kind: "error", message });
        });
    }, delay);
    return () => {
      if (saveLabelsTimerRef.current) clearTimeout(saveLabelsTimerRef.current);
    };
  }, [annotations, fingerprint]);

  // Best-effort flush on tab close / visibility hidden.
  useEffect(() => {
    function flushNow() {
      if (saveLabelsTimerRef.current) {
        clearTimeout(saveLabelsTimerRef.current);
        saveLabelsTimerRef.current = null;
      }
      const rows = toRows(annotationsRef.current);
      saveLabels(fingerprint, rows).catch(() => {});
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") flushNow();
    }
    window.addEventListener("beforeunload", flushNow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", flushNow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fingerprint, annotationsRef]);

  const saveStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
    saveStateTimerRef.current = setTimeout(() => {
      saveSessionState({
        fingerprint,
        filename,
        traceCount: total,
        lastIndex: index,
        savedAt: new Date().toISOString(),
      }).catch(() => {});
    }, 300);
    return () => {
      if (saveStateTimerRef.current) clearTimeout(saveStateTimerRef.current);
    };
  }, [index, filename, total, fingerprint]);

  function handleExport(format: "jsonl" | "csv") {
    const rows = toRows(annotations);
    if (rows.length === 0) return;
    const content = serialize(rows, format);
    const blob = new Blob([content], { type: mimeType(format) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(format);
    a.click();
    URL.revokeObjectURL(url);
  }

  // Statuses for the rail's "needs review" surface and the bottom bar's
  // labeled count. Computed here rather than in the markup so the JSX
  // stays readable.
  const labeledPct = total === 0 ? 0 : Math.round((labeledCount / total) * 100);

  // Milestone stats (for the rail card). Derived once when a milestone is
  // active so the rail can show "12 unique tags, 4 used once, 1 near dupe".
  const milestoneStats = useMemo(() => {
    if (!milestone) return undefined;
    return computeTaxonomyStats(allTags, tagCounts);
  }, [milestone, allTags, tagCounts]);

  return (
    <div className="labeling-view" data-layout="two">
      <TopBar
        filename={filename}
        templateLabel={templateLabelForTrace(trace)}
        idx={index}
        total={total}
        labeledCount={labeledCount}
        passCount={passCount}
        failCount={failCount}
        skippedCount={skippedCount}
        labeledPct={labeledPct}
        unlabeledCount={unlabeledCount}
        coachingEnabled={coachingEnabled}
        coachingActive={coachingActive}
        tipsChipDismissed={tipsChipDismissed}
        remainingSeconds={remainingSeconds}
        allTagsCount={allTags.length}
        findOpen={findOpen}
        filter={filter}
        allTags={allTags}
        onJumpUnlabeled={() => jumpToNextUnlabeled(index, annotationsRef.current)}
        onOpenFind={() => setFindOpen(true)}
        onCloseFind={() => setFindOpen(false)}
        onFilterChange={setFilter}
        onJumpTo={jumpTo}
        onSampleRandom={sampleRandom}
        onOpenTags={() => setTagPanelOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onExport={handleExport}
        onReset={onReset}
        onResetCoaching={() => {
          resetCoaching();
          setCoachingActive(true);
          setTipsChipDismissed(false);
        }}
        onDismissTipsChip={() => {
          dismissTipsChipSession();
          setTipsChipDismissed(true);
        }}
        saveStatus={saveStatus}
        modeIsExperienced={mode === "experienced"}
      />

      <div className="lv-body">
        <div className="lv-trace scroll-y">
          <div className="lv-trace__head">
            <div className="lv-trace__headRow">
              <span className="lv-trace__id">{trace.id}</span>
              <h1 className="lv-trace__title">
                {String((trace.metadata as Record<string, unknown> | undefined)?.title ?? "trace")}
              </h1>
              {annotation.isEdited && (
                <span className="ta-chip lv-trace__editedChip">edited</span>
              )}
              {!annotation.verdict && !annotation.skipped && (
                <span className="ta-chip lv-trace__statusChip" data-status="open">
                  unlabeled
                </span>
              )}
              {annotation.skipped && (
                <span className="ta-chip lv-trace__statusChip" data-status="skip">
                  skipped
                </span>
              )}
              {annotation.verdict && (
                <span
                  className="ta-chip lv-trace__statusChip"
                  data-status={annotation.verdict}
                >
                  {annotation.verdict}
                </span>
              )}
              {mode === "experienced" && (
                <label className="lv-trace__selectLabel">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(trace.id)}
                    onChange={() => toggleSelected(trace.id)}
                  />
                  select for batch
                </label>
              )}
            </div>
            <div className="lv-trace__source">{filename}</div>
          </div>
          <div className="lv-trace__body">
            {trace.metadata && Object.keys(trace.metadata).length > 0 && (
              <MetadataStrip metadata={trace.metadata} />
            )}
            <TraceRenderer trace={trace} collapseSystem />
          </div>
          <div className="lv-trace__foot">
            <span>end of trace</span>
          </div>
        </div>

        <aside aria-label="Decision rail" className="lv-rail">
          {mode === "experienced" && selectedIds.size > 0 && (
            <div className="lv-rail__section">
              <BatchPanel
                selectedCount={selectedIds.size}
                allTags={allTags}
                onApplyVerdict={applyBatchVerdict}
                onApplyTag={applyBatchTag}
                onClear={clearSelection}
              />
              {matchingCount > 1 && (
                <button
                  type="button"
                  onClick={selectAllMatching}
                  className="lv-rail__inlineLink"
                >
                  select all matching ({matchingCount})
                </button>
              )}
            </div>
          )}

          <div className="lv-rail__section">
            <div className="lv-rail__label">verdict</div>
            <div className="lv-verdict">
              <button
                type="button"
                className="verdict-btn"
                data-active={annotation.verdict === "pass" ? "pass" : null}
                onClick={() => applyVerdict("pass")}
                aria-pressed={annotation.verdict === "pass"}
              >
                Pass
                <span className="kbd-hint">{hotkeys.pass.toUpperCase()}</span>
              </button>
              <button
                type="button"
                className="verdict-btn"
                data-active={annotation.verdict === "fail" ? "fail" : null}
                onClick={() => applyVerdict("fail")}
                aria-pressed={annotation.verdict === "fail"}
              >
                Fail
                <span className="kbd-hint">{hotkeys.fail.toUpperCase()}</span>
              </button>
              <button
                type="button"
                className="verdict-btn"
                data-active={annotation.skipped ? "skip" : null}
                onClick={toggleSkip}
                aria-pressed={annotation.skipped}
              >
                Skip
                <span className="kbd-hint">{hotkeys.skip.toUpperCase()}</span>
              </button>
            </div>
          </div>

          <div className="lv-rail__section">
            <div className="lv-rail__label">
              failure modes
              <span className="lv-rail__labelMeta">
                {annotation.tags.length} applied
              </span>
            </div>
            {annotation.tags.length > 0 && (
              <div className="lv-applied-tags">
                {annotation.tags.map((t) => (
                  <span key={t} className="ta-chip ta-chip--applied">
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTagFromCurrent(t)}
                      aria-label={`Remove tag: ${t}`}
                      className="ta-chip__x"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="lv-tag-input">
              <input
                ref={tagInputRef}
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="Type or pick a tag..."
                aria-label="Add or filter failure-mode tags"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagQuery.trim()) {
                    e.preventDefault();
                    applyTagToCurrent(tagQuery);
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setTagQuery("");
                    (e.target as HTMLInputElement).blur();
                  }
                }}
              />
              <kbd>{hotkeys.focusTag.toUpperCase()}</kbd>
            </div>
            <div className="lv-tag-cloud">
              {visibleTagSuggestions.map((t, i) => (
                <button
                  key={t}
                  type="button"
                  className="ta-chip lv-tag-cloud__chip"
                  onClick={() => applyTagToCurrent(t)}
                >
                  {i < HOTKEY_MAX && !tagQuery && (
                    <span className="lv-tag-cloud__num">{i + 1}</span>
                  )}
                  {t}
                  <span className="ta-chip__count">
                    {tagCounts.get(t) ?? 0}
                  </span>
                </button>
              ))}
              {hiddenSuggestionCount > 0 && !showAllTags && !tagQuery && (
                <button
                  type="button"
                  className="ta-chip lv-tag-cloud__chip lv-tag-cloud__more"
                  onClick={() => setShowAllTags(true)}
                >
                  + {hiddenSuggestionCount} more
                </button>
              )}
              {showAllTags && !tagQuery && matchingTags.length > HOTKEY_MAX && (
                <button
                  type="button"
                  className="ta-chip lv-tag-cloud__chip lv-tag-cloud__more"
                  onClick={() => setShowAllTags(false)}
                >
                  show less
                </button>
              )}
              {matchingTags.length === 0 && tagQuery !== "" && (
                <span className="lv-tag-cloud__empty">
                  no matches - press Enter to create
                </span>
              )}
              {matchingTags.length === 0 && tagQuery === "" && allTags.length === 0 && (
                <span className="lv-tag-cloud__empty">
                  tags you create will appear here
                </span>
              )}
            </div>
            <div className="lv-tag-input__hint">
              {tagQuery
                ? <>type to filter <span aria-hidden="true">·</span> Enter creates</>
                : <>press <kbd>1</kbd>-<kbd>9</kbd> to apply <span aria-hidden="true">·</span> type to filter</>}
            </div>
          </div>

          <div className="lv-rail__section">
            <div className="lv-rail__label">
              note
              <span className="lv-rail__labelMeta">
                {annotation.note.length} ch
              </span>
            </div>
            <textarea
              className="lv-note"
              value={annotation.note}
              onChange={(e) => setNote(e.target.value)}
              onFocus={onNoteFocus}
              onBlur={onNoteBlur}
              placeholder="What's wrong? Write like a junior reviewer."
              aria-label="Trace note"
            />
          </div>

          {coachingEnabled && coachingActive && index < 5 && (
            <div className="lv-rail__section">
              <CoachingTip
                traceIndex={index}
                total={total}
                hotkeys={hotkeys}
                onSessionDismiss={() => {
                  dismissCoachingSession();
                  setCoachingActive(false);
                }}
                onPermanentDismiss={() => {
                  dismissCoachingPermanent();
                  setCoachingActive(false);
                }}
              />
            </div>
          )}

          {coachingEnabled && milestone && (
            <div className="lv-rail__section">
              <MilestoneTip
                card={milestone}
                stats={milestoneStats}
                onDismiss={() => {
                  dismissMilestone(fingerprint, milestone.atIndex);
                  setMilestone(null);
                }}
              />
            </div>
          )}

          {mode === "experienced" && toolCalls.length > 0 && (
            <div className="lv-rail__section">
              <ToolCallReviewPanel
                toolCalls={toolCalls}
                reviews={annotation.toolCallReviews}
                onReview={applyToolCallReview}
              />
              {toolCallReviewedCount > 0 && (
                <div className="lv-rail__labelMeta lv-rail__inlineMeta">
                  {toolCallReviewedCount} of {toolCalls.length} reviewed
                </div>
              )}
            </div>
          )}

          {mode === "experienced" && total > 1 && (
            <div className="lv-rail__section">
              <SimilarityPanel
                traces={traces}
                currentTraceId={trace.id}
                fingerprint={fingerprint}
                onJumpToTrace={(traceId) => {
                  const idx = traces.findIndex((t) => t.id === traceId);
                  if (idx >= 0) setIndex(idx);
                }}
              />
            </div>
          )}
        </aside>
      </div>

      <BottomBar
        idx={index}
        total={total}
        labeledCount={labeledCount}
        unlabeledCount={unlabeledCount}
        canPrev={index > 0}
        canNext={index < total - 1}
        undoCount={undoCount}
        redoCount={redoCount}
        saveStatus={saveStatus}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onJumpUnlabeled={() => jumpToNextUnlabeled(index, annotationsRef.current)}
        onUndo={undoCount > 0 ? undo : undefined}
        onRedo={redoCount > 0 ? redo : undefined}
        remainingSeconds={remainingSeconds}
      />

      <TagManagementPanel
        annotations={annotations}
        open={tagPanelOpen}
        onClose={() => setTagPanelOpen(false)}
        onRename={renameTagGlobally}
        onDelete={deleteTagGlobally}
      />

      <SettingsModal
        open={settingsOpen}
        hotkeys={hotkeys}
        mode={mode}
        coachingEnabled={coachingEnabled}
        onClose={() => setSettingsOpen(false)}
        onChange={(next) => {
          setHotkeys(next);
          saveHotkeys(next);
        }}
        onModeChange={(next) => {
          setMode(next);
          saveMode(next);
        }}
        onCoachingChange={(next) => {
          setCoachingEnabled(next);
          saveCoachingEnabled(next);
          if (next) {
            // Re-enabling coaching doesn't re-show dismissed cards on
            // its own; the user can hit ? or "show coaching tips again"
            // to bring them back. But we do clear the master flag so the
            // next interaction can opt back in.
            setCoachingActive(isCoachingActive());
          } else {
            setCoachingActive(false);
          }
        }}
      />

      <ConfirmDialog
        open={pendingBulkVerdict !== null}
        title={
          pendingBulkVerdict
            ? `Apply ${pendingBulkVerdict.verdict === "pass" ? "Pass" : "Fail"} to ${selectedIds.size} traces?`
            : ""
        }
        body={
          pendingBulkVerdict ? (
            <div className="space-y-2">
              <p>
                <strong>{pendingBulkVerdict.overwrites}</strong> of these
                traces already have a different verdict. Continuing will
                overwrite their current verdicts and mark them as Edited.
              </p>
              <p className="text-xs text-gray-500">
                Cmd/Ctrl+Z reverts the entire batch in one step.
              </p>
            </div>
          ) : null
        }
        confirmLabel={
          pendingBulkVerdict
            ? `Apply ${pendingBulkVerdict.verdict === "pass" ? "Pass" : "Fail"} to ${selectedIds.size}`
            : "Confirm"
        }
        destructive
        onConfirm={() => {
          if (pendingBulkVerdict) {
            performBatchVerdict(pendingBulkVerdict.verdict);
          }
          setPendingBulkVerdict(null);
        }}
        onCancel={() => setPendingBulkVerdict(null)}
      />
    </div>
  );
}

function TopBar(props: {
  filename: string;
  templateLabel: string;
  idx: number;
  total: number;
  labeledCount: number;
  passCount: number;
  failCount: number;
  skippedCount: number;
  labeledPct: number;
  unlabeledCount: number;
  coachingEnabled: boolean;
  coachingActive: boolean;
  tipsChipDismissed: boolean;
  remainingSeconds: number | null;
  allTagsCount: number;
  findOpen: boolean;
  filter: Filter;
  allTags: string[];
  onJumpUnlabeled: () => void;
  onOpenFind: () => void;
  onCloseFind: () => void;
  onFilterChange: (f: Filter) => void;
  onJumpTo: (n: number) => void;
  onSampleRandom: (n: number) => void;
  onOpenTags: () => void;
  onOpenSettings: () => void;
  onExport: (fmt: "jsonl" | "csv") => void;
  onReset: () => void;
  onResetCoaching: () => void;
  onDismissTipsChip: () => void;
  saveStatus: SaveStatus;
  modeIsExperienced: boolean;
}) {
  const {
    filename,
    templateLabel,
    idx,
    total,
    labeledCount,
    passCount,
    failCount,
    skippedCount,
    labeledPct,
    unlabeledCount,
    coachingEnabled,
    coachingActive,
    tipsChipDismissed,
    remainingSeconds,
    allTagsCount,
    findOpen,
    filter,
    allTags,
    onJumpUnlabeled,
    onOpenFind,
    onCloseFind,
    onFilterChange,
    onJumpTo,
    onSampleRandom,
    onOpenTags,
    onOpenSettings,
    onExport,
    onReset,
    onResetCoaching,
    onDismissTipsChip,
    saveStatus,
    modeIsExperienced,
  } = props;

  return (
    <div className="lv-topbar">
      <div className="lv-topbar__left">
        <button
          type="button"
          onClick={onReset}
          className="ta-iconbtn"
          aria-label="Load a new file"
          title="Load a new file"
        >
          <span className="lv-topbar__file">{filename}</span>
        </button>
        <span className="lv-topbar__sep">/</span>
        <span className="lv-topbar__template">
          template: <span className="lv-topbar__templateName">{templateLabel}</span>
        </span>
        {modeIsExperienced && (
          <span className="ta-chip lv-topbar__modeChip" title="Experienced mode is on">
            experienced
          </span>
        )}
      </div>

      <div className="lv-topbar__center">
        <div className="lv-progress">
          <div className="lv-progress__numbers">
            <span className="lv-progress__cur">{idx + 1}</span>
            <span className="lv-progress__total">/ {total}</span>
          </div>
          <div
            role="progressbar"
            aria-valuenow={labeledCount}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuetext={`${labeledCount} of ${total} traces labeled`}
            aria-label="Annotation progress"
            className="progress-bar lv-progress__bar"
          >
            <div
              className="progress-bar__fill"
              style={{ width: `${total === 0 ? 0 : (passCount / total) * 100}%`, background: "oklch(0.6 0.09 150)" }}
            />
            <div
              className="progress-bar__skip"
              style={{
                left: `${total === 0 ? 0 : (passCount / total) * 100}%`,
                width: `${total === 0 ? 0 : (failCount / total) * 100}%`,
                background: "oklch(0.6 0.13 30)",
              }}
            />
            <div
              className="progress-bar__skip"
              style={{
                left: `${total === 0 ? 0 : ((passCount + failCount) / total) * 100}%`,
                width: `${total === 0 ? 0 : (skippedCount / total) * 100}%`,
                background: "var(--ink-4)",
              }}
            />
          </div>
          <span className="lv-progress__sub">
            {labeledCount} labeled
            {labeledPct > 0 ? ` · ${labeledPct}%` : ""}
          </span>
          {remainingSeconds !== null && remainingSeconds > 0 && (
            <span
              className="lv-progress__sub lv-progress__remaining"
              title="Estimated from your recent labeling pace"
            >
              {formatRemaining(remainingSeconds)}
            </span>
          )}
        </div>
      </div>

      <div className="lv-topbar__right">
        {coachingEnabled && !tipsChipDismissed && (
          <TipsProgressChip
            traceIndex={idx}
            total={total}
            coachingActive={coachingActive}
            onDismiss={onDismissTipsChip}
          />
        )}
        {coachingEnabled && !coachingActive && (
          <button
            type="button"
            onClick={onResetCoaching}
            className="ta-iconbtn ta-iconbtn--ghost"
            aria-label="Show coaching tips (toggle with ?)"
            title="Restart coaching tips (?)"
          >
            ? tips
          </button>
        )}
        <button
          type="button"
          className="ta-iconbtn"
          onClick={onJumpUnlabeled}
          disabled={unlabeledCount === 0}
          aria-label="Jump to next unlabeled"
          title="Jump to next unlabeled"
        >
          next unlabeled <kbd>U</kbd>
        </button>
        <div className="lv-topbar__findwrap">
          <button
            type="button"
            onClick={onOpenFind}
            className="ta-iconbtn"
            aria-label="Find traces"
            aria-expanded={findOpen}
            title="Filter, jump to a trace, or sample"
          >
            find <kbd>Ctrl K</kbd>
          </button>
          {findOpen && (
            <FindPopover
              filter={filter}
              onFilter={onFilterChange}
              allTags={allTags}
              total={total}
              jumpTo={onJumpTo}
              sampleRandom={onSampleRandom}
              onClose={onCloseFind}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onOpenTags}
          disabled={allTagsCount === 0}
          className="ta-iconbtn"
          aria-label="Manage tags"
          title="Manage tags"
        >
          tags ({allTagsCount})
        </button>
        <ExportButton onExport={onExport} disabled={labeledCount === 0} />
        <button
          type="button"
          onClick={onOpenSettings}
          className="ta-iconbtn"
          aria-label="Open settings"
          title="Settings"
        >
          settings
        </button>
        <SaveIndicator status={saveStatus} />
      </div>
    </div>
  );
}

function BottomBar(props: {
  idx: number;
  total: number;
  labeledCount: number;
  unlabeledCount: number;
  canPrev: boolean;
  canNext: boolean;
  undoCount: number;
  redoCount: number;
  saveStatus: SaveStatus;
  onPrev: () => void;
  onNext: () => void;
  onJumpUnlabeled: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  remainingSeconds: number | null;
}) {
  const {
    idx,
    total,
    labeledCount,
    unlabeledCount,
    canPrev,
    canNext,
    undoCount,
    redoCount,
    saveStatus,
    onPrev,
    onNext,
    onJumpUnlabeled,
    onUndo,
    onRedo,
  } = props;
  return (
    <div className="lv-bottombar">
      <div className="lv-bottombar__group">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="lv-nav"
        >
          <kbd>{"←"}</kbd> prev
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="lv-nav lv-nav--primary"
        >
          next <kbd>{"→"}</kbd>
        </button>
        <span className="lv-bottombar__counter">
          {idx + 1} of {total}
        </span>
        {unlabeledCount > 0 && (
          <button
            type="button"
            onClick={onJumpUnlabeled}
            className="lv-nav lv-nav--quiet"
          >
            label next ({unlabeledCount}) <kbd>U</kbd>
          </button>
        )}
      </div>
      <div className="lv-bottombar__group">
        <button
          type="button"
          onClick={onUndo}
          disabled={!onUndo}
          className="lv-nav lv-nav--quiet"
          aria-label="Undo last change"
          title="Undo last change (Ctrl/Cmd+Z)"
        >
          undo
          {undoCount > 0 && <span className="lv-nav__count">({undoCount})</span>}
          <kbd>Ctrl Z</kbd>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!onRedo}
          className="lv-nav lv-nav--quiet"
          aria-label="Redo last undone change"
          title="Redo (Ctrl/Cmd+Shift+Z)"
        >
          redo
          {redoCount > 0 && <span className="lv-nav__count">({redoCount})</span>}
          <kbd>Ctrl Shift Z</kbd>
        </button>
        <SaveIndicatorInline status={saveStatus} />
        <span className="lv-bottombar__counter">
          {labeledCount} / {total} labeled
        </span>
      </div>
    </div>
  );
}

const ACTION_LABELS: Record<keyof Hotkeys, string> = {
  pass: "Pass",
  fail: "Fail",
  next: "Next trace",
  prev: "Previous trace",
  labelNext: "Jump to next unlabeled",
  skip: "Skip / unmark skip",
  focusTag: "Focus tag input",
};

function validateHotkey(
  key: string,
  actionId: keyof Hotkeys,
  allHotkeys: Hotkeys,
): string | null {
  if (key >= "1" && key <= "9") {
    return "1-9 are reserved for tag suggestions";
  }
  if (
    key === "Enter" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
  ) {
    return `${key} is reserved for navigation`;
  }
  for (const [otherId, otherKey] of Object.entries(allHotkeys) as [
    keyof Hotkeys,
    string,
  ][]) {
    if (otherId === actionId) continue;
    if (otherKey.toLowerCase() === key.toLowerCase()) {
      return `Already bound to ${ACTION_LABELS[otherId]}`;
    }
  }
  return null;
}

function SettingsModal({
  open,
  hotkeys,
  mode,
  coachingEnabled,
  onClose,
  onChange,
  onModeChange,
  onCoachingChange,
}: {
  open: boolean;
  hotkeys: Hotkeys;
  mode: Mode;
  coachingEnabled: boolean;
  onClose: () => void;
  onChange: (next: Hotkeys) => void;
  onModeChange: (next: Mode) => void;
  onCoachingChange: (next: boolean) => void;
}) {
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const rows: { id: keyof Hotkeys; label: string }[] = [
    { id: "pass", label: ACTION_LABELS.pass },
    { id: "fail", label: ACTION_LABELS.fail },
    { id: "skip", label: ACTION_LABELS.skip },
    { id: "focusTag", label: ACTION_LABELS.focusTag },
    { id: "labelNext", label: ACTION_LABELS.labelNext },
    { id: "next", label: ACTION_LABELS.next },
    { id: "prev", label: ACTION_LABELS.prev },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="lv-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="lv-overlay__sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lv-overlay__head">
          <h2 className="lv-overlay__title">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="lv-overlay__close"
          >
            &times;
          </button>
        </div>
        <div className="lv-overlay__body scroll-y">
          <SettingsToggleSection
            title="Coaching"
            description="Show first-run tips and milestone cards. Independent of experienced mode - turn on or off whenever."
            checked={coachingEnabled}
            onChange={onCoachingChange}
            checkedLabel="Coaching is on"
            uncheckedLabel="Coaching is off"
          />
          <SettingsToggleSection
            title="Experienced mode"
            description="Reveals batch labeling, custom adapters, tool-call review, and similarity highlighting. The novice experience is unchanged when this is off."
            checked={mode === "experienced"}
            onChange={(v) => onModeChange(v ? "experienced" : "novice")}
            checkedLabel="Experienced mode is on"
            uncheckedLabel="Experienced mode is off"
          />
          <div className="lv-overlay__sectionTitle">Hotkeys</div>
          <p className="lv-overlay__hint">
            Click a row, then press a single letter. Digits 1-9, Enter, and
            the arrow keys are reserved. Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z are
            reserved for undo and redo. Ctrl/Cmd+K is reserved for find.
          </p>
          <ul className="lv-hotkeys">
            {rows.map((row) => (
              <HotkeyRow
                key={row.id}
                label={row.label}
                actionId={row.id}
                allHotkeys={hotkeys}
                value={hotkeys[row.id]}
                onCapture={(next) => onChange({ ...hotkeys, [row.id]: next })}
              />
            ))}
          </ul>
          {mode === "experienced" && <AdapterSection />}
        </div>
        <div className="lv-overlay__foot">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_HOTKEYS)}
            className="lv-overlay__resetLink"
          >
            reset hotkeys
          </button>
          <button
            type="button"
            onClick={onClose}
            className="lv-nav lv-nav--primary"
          >
            done
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsToggleSection({
  title,
  description,
  checked,
  onChange,
  checkedLabel,
  uncheckedLabel,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  checkedLabel: string;
  uncheckedLabel: string;
}) {
  return (
    <div className="lv-overlay__settingsRow">
      <div className="lv-overlay__settingsCopy">
        <div className="lv-overlay__settingsTitle">{title}</div>
        <p className="lv-overlay__settingsDesc">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={checked ? checkedLabel : uncheckedLabel}
        onClick={() => onChange(!checked)}
        className={`lv-toggle${checked ? " lv-toggle--on" : ""}`}
      >
        <span className="lv-toggle__thumb" />
      </button>
    </div>
  );
}

function AdapterSection() {
  const [saved, setSaved] = useState<AdapterRecord | null>(() => loadAdapter());
  const [draft, setDraft] = useState(() => loadAdapter()?.json ?? "");
  const [feedback, setFeedback] = useState<{
    kind: "ok" | "err";
    msg: string;
  } | null>(null);

  function validate() {
    const result = parseAdapterDSL(draft);
    if (result.ok) {
      setFeedback({
        kind: "ok",
        msg: "Looks valid. Click Save to apply on the next file load.",
      });
    } else {
      setFeedback({ kind: "err", msg: result.error });
    }
  }
  function save() {
    const result = parseAdapterDSL(draft);
    if (!result.ok) {
      setFeedback({ kind: "err", msg: result.error });
      return;
    }
    saveAdapter(draft);
    setSaved(loadAdapter());
    setFeedback({
      kind: "ok",
      msg: "Saved. The next file you load will skip the mapping step.",
    });
  }
  function clear() {
    clearAdapter();
    setSaved(null);
    setDraft("");
    setFeedback({
      kind: "ok",
      msg: "Cleared. Future loads use the normal wizard.",
    });
  }

  return (
    <div className="lv-overlay__sectionTitle lv-overlay__adapter">
      <div className="lv-overlay__sectionTitle">Custom adapter (JSON)</div>
      <p className="lv-overlay__hint">
        Paste a JSON object describing how your trace files map to the
        internal shape. Once saved, file loads skip the wizard mapping step.
        Field names support dot notation for nested objects.
      </p>
      <p className="lv-overlay__adapterMeta">
        {saved ? (
          <>
            adapter saved at{" "}
            <span className="lv-overlay__adapterTime">
              {new Date(saved.savedAt).toLocaleString()}
            </span>
          </>
        ) : (
          <>no adapter saved. The wizard runs normally on file load.</>
        )}
      </p>
      <textarea
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setFeedback(null);
        }}
        placeholder={ADAPTER_EXAMPLE}
        rows={8}
        spellCheck={false}
        aria-label="Custom adapter JSON"
        className="lv-overlay__adapterInput"
      />
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`lv-overlay__feedback ${feedback.kind === "ok" ? "lv-overlay__feedback--ok" : "lv-overlay__feedback--err"}`}
        >
          {feedback.msg}
        </p>
      )}
      <div className="lv-overlay__adapterActions">
        <button
          type="button"
          onClick={clear}
          disabled={!saved && draft.trim() === ""}
          className="lv-overlay__resetLink"
        >
          clear
        </button>
        <button
          type="button"
          onClick={validate}
          disabled={draft.trim() === ""}
          className="lv-nav"
        >
          validate
        </button>
        <button
          type="button"
          onClick={save}
          disabled={draft.trim() === ""}
          className="lv-nav lv-nav--primary"
        >
          save
        </button>
      </div>
    </div>
  );
}

function HotkeyRow({
  label,
  actionId,
  allHotkeys,
  value,
  onCapture,
}: {
  label: string;
  actionId: keyof Hotkeys;
  allHotkeys: Hotkeys;
  value: string;
  onCapture: (next: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="lv-hotkeys__row">
      <span className="lv-hotkeys__label">{label}</span>
      <div className="lv-hotkeys__input">
        <button
          type="button"
          onClick={() => {
            setCapturing((v) => !v);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (!capturing) return;
            if (e.key === "Escape") {
              setCapturing(false);
              setError(null);
              return;
            }
            e.preventDefault();
            if (
              e.key === "Shift" ||
              e.key === "Alt" ||
              e.key === "Control" ||
              e.key === "Meta"
            ) {
              return;
            }
            const reason = validateHotkey(e.key, actionId, allHotkeys);
            if (reason) {
              setError(reason);
              return;
            }
            setError(null);
            onCapture(e.key);
            setCapturing(false);
          }}
          className={`lv-hotkeys__capture${capturing ? " lv-hotkeys__capture--active" : ""}${error ? " lv-hotkeys__capture--err" : ""}`}
        >
          {capturing ? "press a key..." : value}
        </button>
        {error && (
          <span className="lv-hotkeys__error" role="alert">
            {error}
          </span>
        )}
      </div>
    </li>
  );
}

function FilterPicker({
  filter,
  onFilter,
  allTags,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  allTags: string[];
}) {
  let value = "all";
  if (filter.kind === "verdict") value = `v:${filter.v}`;
  else if (filter.kind === "tag") value = `tag:${filter.tag}`;
  else if (filter.kind === "sample") value = "sample";

  return (
    <select
      value={value}
      aria-label="Filter traces"
      onChange={(e) => {
        const v = e.target.value;
        if (v === "all") onFilter({ kind: "all" });
        else if (v === "v:pass") onFilter({ kind: "verdict", v: "pass" });
        else if (v === "v:fail") onFilter({ kind: "verdict", v: "fail" });
        else if (v === "v:unlabeled") onFilter({ kind: "verdict", v: "unlabeled" });
        else if (v === "v:skipped") onFilter({ kind: "verdict", v: "skipped" });
        else if (v.startsWith("tag:")) onFilter({ kind: "tag", tag: v.slice(4) });
      }}
      className="lv-find__select"
    >
      <option value="all">All traces</option>
      <option value="v:unlabeled">Unlabeled only</option>
      <option value="v:pass">Pass only</option>
      <option value="v:fail">Fail only</option>
      <option value="v:skipped">Skipped only</option>
      {filter.kind === "sample" && (
        <option value="sample" disabled>
          Random sample ({filter.indices.size}) - active
        </option>
      )}
      {allTags.length > 0 && (
        <optgroup label="With tag">
          {allTags.map((t) => (
            <option key={t} value={`tag:${t}`}>
              {t}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

function FindPopover({
  filter,
  onFilter,
  allTags,
  total,
  jumpTo,
  sampleRandom,
  onClose,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  allTags: string[];
  total: number;
  jumpTo: (n: number) => void;
  sampleRandom: (n: number) => void;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [jumpInput, setJumpInput] = useState("");
  const [sampleInput, setSampleInput] = useState("20");
  const [sampleError, setSampleError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onMouseDown(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  function handleJumpSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(jumpInput);
    if (!Number.isNaN(n) && n >= 1 && n <= total) {
      jumpTo(n);
      setJumpInput("");
      onClose();
    }
  }

  function handleSampleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(sampleInput);
    if (Number.isNaN(n) || n <= 0) {
      setSampleError("Enter a positive number");
      return;
    }
    if (n > total) {
      setSampleError(`Only ${total} traces available`);
      return;
    }
    setSampleError(null);
    sampleRandom(n);
    onClose();
  }

  return (
    <div ref={popoverRef} role="dialog" aria-label="Find traces" className="lv-find">
      <FilterPicker filter={filter} onFilter={onFilter} allTags={allTags} />
      <form onSubmit={handleJumpSubmit} className="lv-find__row">
        <input
          type="number"
          min={1}
          max={total}
          value={jumpInput}
          onChange={(e) => setJumpInput(e.target.value)}
          placeholder={`Go to # (1-${total})`}
          aria-label="Go to trace number"
          className="lv-find__num"
        />
        <button type="submit" className="lv-nav lv-nav--primary">
          go
        </button>
      </form>
      <form onSubmit={handleSampleSubmit} className="lv-find__sample">
        <label htmlFor="find-sample-size" className="lv-find__sampleLabel">
          random sample
        </label>
        <p className="lv-find__sampleHint">
          Pick a random subset to focus on - useful for spot-checking a large file.
        </p>
        <div className="lv-find__row">
          <input
            id="find-sample-size"
            type="number"
            min={1}
            max={total}
            value={sampleInput}
            onChange={(e) => {
              setSampleInput(e.target.value);
              if (sampleError) setSampleError(null);
            }}
            aria-label="Sample size"
            className="lv-find__num"
          />
          <button type="submit" className="lv-nav">
            sample
          </button>
        </div>
        {sampleError && (
          <p className="lv-find__error" role="alert">
            {sampleError}
          </p>
        )}
      </form>
      <p className="lv-find__close">
        <kbd>Esc</kbd> to close
      </p>
    </div>
  );
}

function MetadataStrip({ metadata }: { metadata: Record<string, unknown> }) {
  const keys = Object.keys(metadata);
  return (
    <details className="lv-metadata">
      <summary className="lv-metadata__summary">
        show metadata ({keys.length} {keys.length === 1 ? "field" : "fields"})
      </summary>
      <dl className="lv-metadata__grid">
        {keys.map((k) => (
          <div key={k} className="lv-metadata__row">
            <dt>{k}</dt>
            <dd>
              {typeof metadata[k] === "string"
                ? (metadata[k] as string)
                : JSON.stringify(metadata[k])}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status.kind === "idle") return null;
  let label: string;
  let dotData: "saving" | "saved" | "error";
  switch (status.kind) {
    case "saving":
      label = "saving...";
      dotData = "saving";
      break;
    case "saved":
      label = `saved · ${status.at}`;
      dotData = "saved";
      break;
    case "error":
      label = "save error - export now";
      dotData = "error";
      break;
  }
  return (
    <span
      role="status"
      aria-live="polite"
      title={status.kind === "error" ? status.message : undefined}
      className="lv-savestatus"
      data-state={dotData}
    >
      <span className="lv-savestatus__dot" />
      {label}
    </span>
  );
}

function SaveIndicatorInline({ status }: { status: SaveStatus }) {
  // Same data, slightly more compact for the bottom bar.
  return <SaveIndicator status={status} />;
}

function ExportButton({
  onExport,
  disabled,
}: {
  onExport: (fmt: "jsonl" | "csv") => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="lv-export">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="ta-iconbtn"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        export
      </button>
      {open && (
        <div className="lv-export__menu" role="menu">
          {(["jsonl", "csv"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              role="menuitem"
              onClick={() => {
                onExport(fmt);
                setOpen(false);
              }}
              className="lv-export__item"
            >
              download .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

