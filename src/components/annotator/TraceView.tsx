"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Trace } from "@/lib/trace/types";
import type { LabelRow } from "@/lib/labels/types";
import { serialize, mimeType, fileName } from "@/lib/labels/serialize";
import {
  extractToolCalls,
  type ToolCallVerdict,
} from "@/lib/trace/tool-calls";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";
import { TagPanel } from "./TagPanel";
import { TagManagementPanel } from "./TagManagementPanel";
import { ToolCallReviewPanel } from "./ToolCallReviewPanel";
import { SimilarityPanel } from "./SimilarityPanel";
import { Logo } from "@/components/Logo";
import { useStateRef } from "@/hooks/useStateRef";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import {
  CoachingTip,
  MilestoneTip,
  TipsProgressChip,
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
  loadHotkeys,
  loadMode,
  loadRecentAuditEntries,
  saveAdapter,
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
  // user can mark a trace skipped before deciding pass/fail. Rendered as
  // a badge in the trace header and filterable from the Find panel.
  skipped: boolean;
  // Per-tool-call correctness verdicts (v3, #37 power analysis - tool-call
  // review). Keyed by the tool call's stable index (its position in the
  // trace's combined input+output message stream). Optional for backward
  // compat with v1/v2 labels and only meaningful in experienced mode.
  toolCallReviews?: Record<number, "right" | "wrong" | "skip">;
};
export type Annotations = Record<string, Annotation>;

// Filter / sampling state shared by TraceView, FilterPicker, and FindPopover.
// "all" is the default. Other modes restrict navigation to a subset; the
// user still sees total counts in the top bar but Next/Prev skip
// non-matching traces. Random sample is materialized as a fixed index set
// so the same "sample of N" stays stable while the user works through it.
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
  // Set when AppShell's initial IndexedDB load failed (private browsing,
  // quota, etc.). The save indicator pivots to a persistent error so the
  // user knows to export often instead of trusting autosave.
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
  // useStateRef pairs the state with a ref mirror so keydown handlers and the
  // beforeunload save can read the latest annotations without depending on
  // closure freshness. Without the mirror, fast labeling streaks walked
  // against stale state.
  const [annotations, setAnnotations, annotationsRef] =
    useStateRef<Annotations>(initialAnnotations);
  // Coaching + chip state default to false on first render, then load from
  // storage in useEffect. This avoids reading sessionStorage/localStorage in
  // the useState initializer, which would cause a hydration mismatch under
  // SSR (server returns the default, client could otherwise return a
  // different value). The cost is a brief invisible-coaching frame on first
  // paint, which is acceptable - the user is reading the trace anyway.
  const [coachingActive, setCoachingActive] = useState(false);
  // Session-level dismissal of the tips-progress chip (traces 6-15). Tracked
  // separately from the cards so dismissing the chip doesn't suppress the
  // milestone cards at trace 25/50/100.
  const [tipsChipDismissed, setTipsChipDismissed] = useState(false);
  useEffect(() => {
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
  // Milestone state is per-trace-index. We reload it any time the index
  // changes so the user gets the milestone exactly when they hit that trace.
  // Initial value is null and the useEffect below loads the real value on
  // mount, mirroring the SSR-safe pattern used for coaching state.
  const [milestone, setMilestone] = useState<ReturnType<
    typeof getMilestoneForIndex
  > | null>(null);

  // Undo stack: append-only log of changes. The top of the stack is the
  // most recent change. Cmd/Ctrl+Z pops the top and restores `before` for
  // every trace in the entry. We cap the stack at 100 to keep memory bounded.
  //
  // v3 generalization (#36 batch labeling): a single user action can change
  // N traces at once. Each undo entry now carries an array of changes so
  // single-trace edits and batch ops share the same shape and the same undo
  // path. `batchId` is set when the entry came from a batch op, mirroring
  // the AuditEntry field that lets us reconcile the in-memory undo with the
  // persisted audit log.
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
  const [undoCount, setUndoCount] = useState(0);
  // Tag management panel open/closed.
  const [tagPanelOpen, setTagPanelOpen] = useState(false);

  const [filter, setFilter] = useState<Filter>({ kind: "all" });

  // Hotkeys can be remapped via the Settings modal. Loaded once on mount.
  const [hotkeys, setHotkeys] = useState<Hotkeys>(DEFAULT_HOTKEYS);
  useEffect(() => {
    setHotkeys(loadHotkeys());
  }, []);
  // Mode toggle (v3). Default "novice" preserves the v1/v2 experience for
  // beginners. "experienced" unlocks power features. Persisted via storage so
  // the choice survives reloads. Same SSR-safe load pattern as hotkeys: render
  // with the default first, swap to the stored value in useEffect.
  const [mode, setMode] = useState<Mode>("novice");
  useEffect(() => {
    setMode(loadMode());
  }, []);
  // Rolling window of recent audit entries used by the v3 time estimator.
  // Reloaded whenever an audit row is written. Loading from IDB is cheap
  // (last ~25 rows via an indexed cursor) so re-querying on every label
  // change is fine.
  const [auditRecent, setAuditRecent] = useState<AuditEntry[]>([]);
  // Increments on every audit write (single or batch). The audit-window
  // effect keys on this so it refreshes for tool-call reviews, skip
  // toggles, and tag-only changes too - not just verdicts (which were the
  // only thing that bumped the previous `labeledCount` key).
  const [auditWriteCount, setAuditWriteCount] = useState(0);
  const bumpAuditWrites = useCallback(() => {
    setAuditWriteCount((c) => c + 1);
  }, []);
  // Selected trace IDs for v3 batch labeling (#36). Only meaningful in
  // experienced mode; the per-trace Select checkbox is hidden in novice
  // mode so this set stays empty for beginners. Toggle via the checkbox in
  // the trace header; clear via the BatchPanel "Clear" action or by
  // unselecting individually.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Pending bulk verdict, awaiting confirmation. Set when the user clicks
  // "Pass all"/"Fail all" and one or more selected traces already have a
  // different verdict that would be overwritten - we surface the impact
  // count via ConfirmDialog before mutating, since bulk overwrite is a
  // destructive action that's hard to spot once it happens.
  const [pendingBulkVerdict, setPendingBulkVerdict] = useState<{
    verdict: Verdict;
    overwrites: number;
  } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Find popover toggles open from the top-bar tools row. Owned here so we
  // can dismiss it from anywhere (e.g. when the user takes another action).
  const [findOpen, setFindOpen] = useState(false);
  const [allTags, setAllTags] = useState<string[]>(() => {
    const tagSet = new Set<string>();
    for (const a of Object.values(initialAnnotations)) {
      for (const t of a.tags) tagSet.add(t);
    }
    return Array.from(tagSet);
  });
  const total = traces.length;
  const trace = traces[index];
  const annotation = getOrEmpty(annotations, trace.id);
  const labeledCount = Object.values(annotations).filter((a) => a.verdict !== null).length;
  const labelProgressPct = (labeledCount / total) * 100;
  // Tool calls extracted from the current trace. Memoized so we don't re-scan
  // every message on every render. Empty list = trace has no tool calls;
  // the review panel and the header badge both hide gracefully in that case.
  const toolCalls = useMemo(() => extractToolCalls(trace), [trace]);
  const toolCallReviewedCount = annotation.toolCallReviews
    ? Object.keys(annotation.toolCallReviews).length
    : 0;

  // Refresh the audit window on every audit write. Keyed on auditWriteCount
  // (bumped from pushUndo and applyBatch* below) rather than labeledCount,
  // because tool-call-only edits, skip toggles, and tag-only changes all
  // write audit rows but don't bump the verdict count. Errors here are
  // non-fatal: the estimator returns null on insufficient data and the
  // subline simply hides.
  useEffect(() => {
    let cancelled = false;
    loadRecentAuditEntries(fingerprint, 25)
      .then((entries) => {
        if (!cancelled) setAuditRecent(entries);
      })
      .catch(() => {
        // Storage unavailable; the existing storageUnavailable banner already
        // tells the user. The estimator subline stays hidden.
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

  // matchesFilter: pure predicate over (filter, traceIndex, currentAnnotations).
  // Defined here as a hook-stable callback so navigation handlers can rely on it.
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
        // Walk in the requested direction until we find a matching trace.
        // If none found, stay put. Wraps once at the end so the user can
        // "Next" past the last match without flinging out of the file.
        // Read annotations through the ref so rapid keystrokes always see
        // the latest verdicts (closures here can otherwise be one render
        // behind).
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
    // Standard reservoir-style random pick. Set ensures uniqueness.
    const picked = new Set<number>();
    while (picked.size < count) {
      picked.add(Math.floor(Math.random() * total));
    }
    setFilter({ kind: "sample", indices: picked });
    // Jump to the first sampled trace.
    const sortedFirst = Math.min(...Array.from(picked));
    setIndex(sortedFirst);
  }

  const jumpToNextUnlabeled = useCallback(
    (currentIndex: number, currentAnnotations: Annotations) => {
      // Respect the active filter so "Label next" stays inside the
      // user's chosen subset (e.g. inside a sample).
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

  // pushUndo records a before/after snapshot for the trace currently being
  // changed and appends a row to the persistent audit log. Must be called
  // OUTSIDE any setAnnotations updater (React requires updaters to be pure;
  // StrictMode would call them twice and we'd double-write the audit log).
  const pushUndo = useCallback(
    (trace_id: string, before: Annotation, after: Annotation) => {
      const stack = undoStackRef.current;
      stack.push({ changes: [{ trace_id, before, after }] });
      // Cap stack length to bound memory.
      if (stack.length > 100) stack.shift();
      setUndoCount(stack.length);
      // Persist a per-label version log entry. Best-effort - failure here
      // doesn't affect the in-memory undo stack.
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
      // Compute outside the setAnnotations updater so audit/undo side
      // effects fire exactly once even under React StrictMode (which runs
      // updater functions twice). annotationsRef.current is always the
      // latest accepted state thanks to useStateRef.
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      const isEdited = cur.isEdited || (cur.verdict !== null && cur.verdict !== v);
      const next: Annotation = {
        ...cur,
        verdict: v,
        isEdited,
        // Applying a verdict implicitly resolves the "needs review" state.
        skipped: false,
        labeledAt: cur.labeledAt || new Date().toISOString(),
      };
      setAnnotations({ ...prev, [trace.id]: next });
      pushUndo(trace.id, cur, next);
    },
    [trace.id, pushUndo, setAnnotations, annotationsRef],
  );

  // Batch labeling primitives (v3, #36). All three callbacks below are
  // gated by the experienced-mode UI surface; they're safe to call with an
  // empty selection (no-op).
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

  // Select every trace that matches the current filter (or every trace if
  // the filter is "all"). Replaces any prior selection. Exposed so the user
  // has a one-click path from "no selection" to "operating on the whole
  // visible subset" - without this, batch labeling required ticking N
  // checkboxes one trace at a time, which defeats its purpose.
  const selectAllMatching = useCallback(() => {
    const ids = new Set<string>();
    const anns = annotationsRef.current;
    for (let i = 0; i < total; i++) {
      if (matchesFilter(i, anns)) ids.add(traces[i].id);
    }
    setSelectedIds(ids);
  }, [total, traces, matchesFilter, annotationsRef]);

  // Count of traces matching the current filter. Used to label the "Select
  // all matching" affordance ("Select all matching (47)").
  const matchingCount = (() => {
    let count = 0;
    for (let i = 0; i < total; i++) {
      if (matchesFilter(i, annotations)) count++;
    }
    return count;
  })();

  // Generate a unique batch ID. Used to group audit entries written
  // together so the time estimator can exclude them and so a future "show
  // me history of batches" feature can scope its query. Prefers the modern
  // crypto.randomUUID for a real collision-free guarantee; falls back to a
  // timestamped random string on older runtimes.
  function generateBatchId(): string {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return `batch-${crypto.randomUUID()}`;
    }
    return `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // Internal: actually performs the batch verdict mutation. Called either
  // directly (no overwrites detected) or after the user confirms via the
  // ConfirmDialog. Side effects fire outside setAnnotations for StrictMode
  // safety.
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
      appendAuditEntriesBatch(auditEntries).catch(() => {});
      bumpAuditWrites();
    },
    [fingerprint, selectedIds, setAnnotations, annotationsRef, bumpAuditWrites],
  );

  // Public entry: gates the bulk verdict behind a ConfirmDialog when one or
  // more selected traces already have a different verdict. Without the
  // gate, an accidental "Pass all" click silently overwrote N traces of
  // prior work. The dialog quotes the count so the user sees the blast
  // radius before confirming. Cmd/Ctrl+Z still undoes the entire batch in
  // one step if they confirm and regret it.
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

  // Tool-call correctness review (v3, #37). Toggling a verdict to its
  // current value clears it (passing null), which lets users undo a click
  // without an explicit "clear" button. Routes through pushUndo so each
  // change is recorded in the audit log and reversible via Cmd/Ctrl+Z.
  // Side effects fire outside the setAnnotations call to stay StrictMode-safe.
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

  // Toggle skip (review later). Independent of verdict so the user can mark
  // a trace skipped, then later go back and apply pass/fail.
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

  const updateAnnotation = useCallback(
    (a: Annotation) => {
      const prev = annotationsRef.current;
      const cur = getOrEmpty(prev, trace.id);
      const next: Annotation = {
        ...a,
        labeledAt: a.labeledAt || new Date().toISOString(),
      };
      setAnnotations({ ...prev, [trace.id]: next });
      pushUndo(trace.id, cur, next);
    },
    [trace.id, pushUndo, setAnnotations, annotationsRef],
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    const last = stack.pop();
    if (!last) return;
    setUndoCount(stack.length);
    setAnnotations((prev) => {
      const next = { ...prev };
      // Revert every trace in this entry. Single-trace edits have one change;
      // batch ops have many. Same code path either way.
      for (const c of last.changes) {
        // If the previous state was empty (creation case), drop the entry
        // entirely so toRows doesn't emit a row with verdict=null and empty
        // tags/note - matches the v1 "untouched trace" semantics.
        if (
          c.before.verdict === null &&
          c.before.tags.length === 0 &&
          c.before.note === ""
        ) {
          delete next[c.trace_id];
        } else {
          next[c.trace_id] = c.before;
        }
      }
      return next;
    });
    // Jump to the (first) trace whose change we're reverting so the user
    // sees what happened. Skipped if they're already there. For batch
    // undos, jumping to the first change is a reasonable focal point.
    const firstChange = last.changes[0];
    if (firstChange) {
      const targetIdx = traces.findIndex((t) => t.id === firstChange.trace_id);
      if (targetIdx >= 0 && targetIdx !== index) setIndex(targetIdx);
    }
  }, [index, traces, setAnnotations]);

  const addTagToSession = useCallback((tag: string) => {
    setAllTags((prev) => {
      const without = prev.filter((t) => t !== tag);
      return [tag, ...without];
    });
  }, []);

  // Bulk tag operations from the management panel. Both walk every
  // annotation; the per-annotation diff is small enough that we don't
  // need anything fancy. We also update the session-level tag list so
  // the quick-apply chips in the bottom bar reflect the change.
  const renameTagGlobally = useCallback((oldTag: string, newTag: string) => {
    setAnnotations((prev) => {
      const next: Annotations = {};
      for (const [id, a] of Object.entries(prev)) {
        if (!a.tags.includes(oldTag)) {
          next[id] = a;
          continue;
        }
        // Replace oldTag with newTag and dedupe (handles the merge case).
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

  // Apply a tag to every selected trace (v3 batch labeling, #36). Skips any
  // trace that already has the tag so an accidental double-apply is a no-op
  // rather than a corrupting duplicate. Hits the same in-memory annotations,
  // undo stack, and audit log as applyBatchVerdict.
  const applyBatchTag = useCallback(
    (tag: string) => {
      const cleanTag = tag.trim();
      if (selectedIds.size === 0 || cleanTag === "") return;
      // Compute the diff outside setAnnotations (StrictMode purity).
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

  const applyQuickTag = useCallback(
    (tag: string) => {
      setAnnotations((prev) => {
        const cur = getOrEmpty(prev, trace.id);
        if (cur.tags.includes(tag)) return prev;
        return { ...prev, [trace.id]: { ...cur, tags: [...cur.tags, tag] } };
      });
      addTagToSession(tag);
    },
    [trace.id, addTagToSession, setAnnotations],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (inInput) return;

      // Cmd/Ctrl+Z = undo. Caught here (not in the dispatch table) so the
      // browser default is preempted only when modifiers are present.
      if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undo();
        return;
      }

      // ? = toggle coaching tips. The top-bar "? tips" button suggests this
      // affordance, so binding the actual key keeps the label honest. When
      // tips are active, dismiss for the session; when hidden, reset and
      // re-show.
      if (e.key === "?") {
        e.preventDefault();
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

      // Match against the user's hotkey config. Both case variants are
      // accepted; arrow keys / Enter keep their case-sensitive shape.
      const k = e.key;
      const matches = (configured: string) =>
        k === configured ||
        (configured.length === 1 && k.toLowerCase() === configured.toLowerCase());

      if (matches(hotkeys.pass)) {
        applyVerdict("pass");
      } else if (matches(hotkeys.fail)) {
        applyVerdict("fail");
      } else if (matches(hotkeys.next) || k === "ArrowRight") {
        if (!e.shiftKey) go(1);
      } else if (matches(hotkeys.prev)) {
        go(-1);
      } else if (matches(hotkeys.labelNext)) {
        // Read the ref directly so we don't have to abuse a setAnnotations
        // updater purely to access fresh state. The previous "fake updater"
        // pattern double-fired under StrictMode and is a React purity
        // violation.
        jumpToNextUnlabeled(index, annotationsRef.current);
      } else if (matches(hotkeys.skip)) {
        toggleSkip();
      } else if (k >= "1" && k <= "4") {
        const i = Number(k) - 1;
        if (allTags[i]) applyQuickTag(allTags[i]);
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [
    go,
    applyVerdict,
    applyQuickTag,
    jumpToNextUnlabeled,
    index,
    allTags,
    undo,
    toggleSkip,
    hotkeys,
    annotationsRef,
    coachingActive,
  ]);

  // Refresh milestone whenever the user navigates to a new trace. Looks
  // up the (fingerprint, index) pair against localStorage; null if already
  // shown or no milestone at this index.
  useEffect(() => {
    setMilestone(getMilestoneForIndex(fingerprint, index));
  }, [fingerprint, index]);

  // Autosave labels through the IndexedDB primitive. Debounced so rapid
  // labeling doesn't thrash the database. The save indicator pivots through
  // "saving" -> "saved" so the user can see persistence is happening.
  // Max-wait flush: we track when the *first* pending change in the current
  // streak happened (not when the last save finished). If a streak has been
  // pending for SAVE_MAX_WAIT_MS, the next change writes immediately. This
  // protects against losing minutes of continuous labeling if the tab
  // closes mid-streak, while leaving the debounce intact for normal
  // slow-paced labeling (where a single change after an idle period
  // shouldn't bypass the debounce).
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

  // Best-effort flush when the tab is closing or the page is being hidden.
  // The browser does not wait for promises here, so we cancel any pending
  // debounce and fire-and-forget the write. We listen on both
  // `beforeunload` (desktop tab close) and `visibilitychange` -> hidden
  // (mobile background, tab switch on iOS Safari which often skips
  // beforeunload). Without the visibilitychange branch, mobile labeling
  // sessions could lose the last debounced batch.
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

  // Autosave session state (last viewed trace) on a slightly faster cadence
  // than labels - navigation is the most common reason the user expects
  // resume to work.
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
      }).catch(() => {
        // Session state save failure is non-fatal: labels are the data.
        // The error indicator is already triggered by the labels effect if
        // storage is broken.
      });
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

  const topTags = allTags.slice(0, 4);
  const unlabeledCount = total - labeledCount;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <Logo size="sm" />
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded border border-gray-200 px-2 py-1"
          >
            Load new file
          </button>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            Trace{" "}
            <span aria-live="polite">
              {index + 1} of {total}
            </span>
          </p>
          <p
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-gray-500 mt-0.5"
          >
            {labeledCount} of {total} labeled
          </p>
          {remainingSeconds !== null && remainingSeconds > 0 && (
            <p
              aria-live="polite"
              aria-atomic="true"
              aria-label={`Estimated time remaining (from your recent pace): ${formatRemaining(remainingSeconds)}`}
              className="text-[11px] text-gray-400 mt-0.5"
              title="Estimated from your recent labeling pace"
            >
              {total - labeledCount} traces left,{" "}
              {formatRemaining(remainingSeconds)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-end">
          {!tipsChipDismissed && (
            <TipsProgressChip
              traceIndex={index}
              total={total}
              coachingActive={coachingActive}
              onDismiss={() => {
                dismissTipsChipSession();
                setTipsChipDismissed(true);
              }}
            />
          )}
          {!coachingActive && (
            <button
              type="button"
              onClick={() => {
                resetCoaching();
                setCoachingActive(true);
                setTipsChipDismissed(false);
              }}
              aria-label="Show coaching tips (toggle with ?)"
              title="Restart coaching tips (?)"
              className="text-xs text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
            >
              ? tips
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFindOpen((v) => !v)}
              aria-label="Find traces"
              aria-expanded={findOpen}
              title="Filter, jump to a trace, or sample"
              className={`text-xs rounded px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                findOpen
                  ? "text-blue-700"
                  : "text-gray-400 hover:text-gray-700"
              }`}
            >
              Find
            </button>
            {findOpen && (
              <FindPopover
                filter={filter}
                onFilter={setFilter}
                allTags={allTags}
                total={total}
                jumpTo={jumpTo}
                sampleRandom={sampleRandom}
                onClose={() => setFindOpen(false)}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setTagPanelOpen(true)}
            disabled={allTags.length === 0}
            aria-label="Manage tags"
            title="Manage tags"
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Tags
            {allTags.length > 0 && (
              <span className="ml-0.5 text-gray-400">({allTags.length})</span>
            )}
          </button>
          <button
            type="button"
            disabled={undoCount === 0}
            onClick={undo}
            aria-label="Undo last change"
            title="Undo last change (Cmd/Ctrl+Z)"
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Undo
            {undoCount > 0 && (
              <span className="ml-0.5 text-gray-400">({undoCount})</span>
            )}
          </button>
          {mode === "experienced" && (
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="Experienced mode is on. Click to open Settings and toggle off."
              title="Experienced mode is on. Click to open Settings and toggle off."
              className="inline-flex items-center rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-blue-700 hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Experienced
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings (mode and hotkeys)"
            className="text-xs text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Settings
          </button>
          <SaveIndicator status={saveStatus} />
          <ExportButton onExport={handleExport} disabled={labeledCount === 0} />
        </div>
      </header>

      <div
        role="progressbar"
        aria-valuenow={labeledCount}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${labeledCount} of ${total} traces labeled`}
        aria-label="Annotation progress"
        className="h-1 bg-gray-200"
      >
        <div
          className="h-1 bg-blue-500 transition-[width] duration-200"
          style={{ width: `${labelProgressPct}%` }}
        />
      </div>

      <div className="flex-1 flex min-h-0">
        <main className="basis-3/4 flex-1 overflow-auto">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <div className="mb-3 flex items-center flex-wrap gap-2">
              <span className="text-xs font-mono text-gray-400">
                {filename} - trace {index + 1} of {total} - id: {trace.id}
              </span>
              {annotation.verdict && <VerdictBadge verdict={annotation.verdict} />}
              {annotation.isEdited && (
                <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                  Edited
                </span>
              )}
              {!annotation.verdict && !annotation.skipped && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                  Unlabeled
                </span>
              )}
              {annotation.skipped && (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  Skipped - review later
                </span>
              )}
              {annotation.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800"
                >
                  {t}
                </span>
              ))}
              {mode === "experienced" && toolCalls.length > 0 && (
                <span
                  className="inline-flex items-center rounded-full border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium text-gray-700"
                  title="Number of tool calls reviewed in this trace. Informational only - does not force the verdict."
                >
                  tool calls: {toolCallReviewedCount}/{toolCalls.length}
                </span>
              )}
              {mode === "experienced" && (
                <div className="inline-flex items-center gap-3 ml-auto">
                  <label className="inline-flex items-center gap-1 cursor-pointer text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(trace.id)}
                      onChange={() => toggleSelected(trace.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Select this trace for batch action"
                    />
                    <span>Select for batch</span>
                  </label>
                  {matchingCount > 1 && (
                    <button
                      type="button"
                      onClick={selectAllMatching}
                      title="Add every trace matching the current filter to the batch selection"
                      className="text-xs text-blue-700 hover:text-blue-900 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                    >
                      Select all matching ({matchingCount})
                    </button>
                  )}
                </div>
              )}
            </div>

            {trace.metadata && Object.keys(trace.metadata).length > 0 && (
              <MetadataStrip metadata={trace.metadata} />
            )}

            {coachingActive && (
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
            )}

            {milestone && (
              <MilestoneTip
                card={milestone}
                onDismiss={() => {
                  dismissMilestone(fingerprint, milestone.atIndex);
                  setMilestone(null);
                }}
              />
            )}

            <TraceRenderer trace={trace} collapseSystem />
          </div>
        </main>

        <aside
          aria-label="Label and navigate"
          className="basis-1/4 min-w-[220px] max-w-[360px] border-l bg-white px-4 py-6 overflow-auto flex flex-col gap-5"
        >
          {mode === "experienced" && selectedIds.size > 0 && (
            <BatchPanel
              selectedCount={selectedIds.size}
              allTags={allTags}
              onApplyVerdict={applyBatchVerdict}
              onApplyTag={applyBatchTag}
              onClear={clearSelection}
            />
          )}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Label this trace
            </h3>
            <div className="flex flex-col gap-2" role="group" aria-label="Label verdict">
              <VerdictButton
                verdict="pass"
                current={annotation.verdict}
                onClick={() => applyVerdict("pass")}
                hotkey={hotkeys.pass}
              />
              <VerdictButton
                verdict="fail"
                current={annotation.verdict}
                onClick={() => applyVerdict("fail")}
                hotkey={hotkeys.fail}
              />
              <button
                type="button"
                onClick={toggleSkip}
                aria-pressed={annotation.skipped}
                className={`flex w-full items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                  annotation.skipped
                    ? "bg-amber-100 border-amber-300 text-amber-900"
                    : "border-gray-300 text-gray-600 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-800"
                }`}
              >
                <kbd className="text-[10px] font-mono opacity-70">
                  [{hotkeys.skip.toUpperCase()}]
                </kbd>
                {annotation.skipped ? "Unmark skip" : "Skip - review later"}
              </button>
            </div>
          </div>

          <TagPanel
            annotation={annotation}
            allTags={allTags}
            onUpdate={updateAnnotation}
            onTagCreated={addTagToSession}
          />

          {mode === "experienced" && toolCalls.length > 0 && (
            <ToolCallReviewPanel
              toolCalls={toolCalls}
              reviews={annotation.toolCallReviews}
              onReview={applyToolCallReview}
            />
          )}

          {mode === "experienced" && total > 1 && (
            <SimilarityPanel
              traces={traces}
              currentTraceId={trace.id}
              fingerprint={fingerprint}
              onJumpToTrace={(traceId) => {
                const idx = traces.findIndex((t) => t.id === traceId);
                if (idx >= 0) setIndex(idx);
              }}
            />
          )}

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Navigate
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => go(-1)}
                aria-label="Previous trace"
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span aria-hidden="true">&#8592;</span> Previous
              </button>
              <button
                type="button"
                disabled={index === total - 1}
                onClick={() => go(1)}
                aria-label="Next trace"
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Next <span aria-hidden="true">&#8594;</span>
              </button>
              <button
                type="button"
                disabled={unlabeledCount === 0}
                onClick={() =>
                  jumpToNextUnlabeled(index, annotationsRef.current)
                }
                aria-label="Jump to next unlabeled trace"
                title="Jump to next unlabeled [N]"
                className="flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Label next
                {unlabeledCount > 0 && (
                  <span className="ml-1 text-xs text-blue-400">({unlabeledCount})</span>
                )}
              </button>
            </div>
          </div>
        </aside>
      </div>

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
        onClose={() => setSettingsOpen(false)}
        onChange={(next) => {
          setHotkeys(next);
          saveHotkeys(next);
        }}
        onModeChange={(next) => {
          setMode(next);
          saveMode(next);
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
                <strong>{pendingBulkVerdict.overwrites}</strong> of these traces
                already have a different verdict. Continuing will overwrite
                their current verdicts and mark them as Edited.
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

      <nav
        aria-label="Quick tags and keyboard shortcuts"
        className="border-t bg-white sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.06)]"
      >
        {topTags.length > 0 && (
          <div
            aria-label="Quick-apply failure mode tags"
            className="px-4 py-2 flex gap-2 flex-wrap"
          >
            {topTags.map((tag, i) => (
              <button
                key={tag}
                type="button"
                onClick={() => applyQuickTag(tag)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  annotation.tags.includes(tag)
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "border-violet-300 text-violet-700 hover:bg-violet-50"
                }`}
              >
                <kbd className="font-mono opacity-70">[{i + 1}]</kbd>
                {tag}
              </button>
            ))}
          </div>
        )}

        <div
          aria-label="Keyboard shortcuts"
          className="border-t bg-gray-50 px-4 py-1.5 flex items-center justify-center gap-5 text-xs text-gray-400"
        >
          <span><kbd className="font-mono font-semibold text-gray-500">{hotkeys.pass.toUpperCase()}</kbd> Pass</span>
          <span><kbd className="font-mono font-semibold text-gray-500">{hotkeys.fail.toUpperCase()}</kbd> Fail</span>
          <span><kbd className="font-mono font-semibold text-gray-500">{hotkeys.skip.toUpperCase()}</kbd> Skip</span>
          <span><kbd className="font-mono font-semibold text-gray-500">&#8592; &#8594;</kbd> Navigate</span>
          <span><kbd className="font-mono font-semibold text-gray-500">{hotkeys.labelNext.toUpperCase()}</kbd> Label next</span>
          {topTags.length > 0 && (
            <span><kbd className="font-mono font-semibold text-gray-500">1-{Math.min(4, topTags.length)}</kbd> Tag</span>
          )}
          <span><kbd className="font-mono font-semibold text-gray-500">?</kbd> Tips</span>
          {mode === "experienced" && (
            <>
              <span className="text-gray-300" aria-hidden="true">|</span>
              <span title="Tick the Select for batch checkbox in the trace header to start a batch">
                <span className="text-blue-700 font-medium">Select</span> traces for batch
              </span>
              {toolCalls.length > 0 && (
                <span title="Tool-call review panel appears in the right sidebar for traces with tool calls">
                  <span className="text-blue-700 font-medium">Review</span> tool calls
                </span>
              )}
            </>
          )}
        </div>
      </nav>
    </div>
  );
}

function VerdictButton({
  verdict,
  current,
  onClick,
  hotkey,
}: {
  verdict: Verdict;
  current: Verdict | null;
  onClick: () => void;
  hotkey: string;
}) {
  const isActive = current === verdict;
  const isPass = verdict === "pass";
  const key = hotkey.toUpperCase();

  const base =
    "flex w-full items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  const active = isPass
    ? "bg-green-600 border-green-600 text-white"
    : "bg-red-600 border-red-600 text-white";
  const inactive = isPass
    ? "border-green-300 text-green-700 hover:bg-green-50"
    : "border-red-300 text-red-700 hover:bg-red-50";
  const ring = isPass ? "focus-visible:ring-green-500" : "focus-visible:ring-red-500";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`${base} ${isActive ? active : inactive} ${ring}`}
    >
      <kbd className="text-[10px] font-mono opacity-70">[{key}]</kbd>
      {isPass ? "Pass" : "Fail"}
    </button>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const isPass = verdict === "pass";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isPass ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {isPass ? "Pass" : "Fail"}
    </span>
  );
}

// Hotkey remapping modal. Each row captures one keystroke as the new
// binding for that action; pressing Escape cancels. Defaults to v1's
// canonical bindings; "Reset" restores them.
// User-friendly labels for each action, used in collision messages so a
// rejected rebind tells the user *which* other action owns the key.
const ACTION_LABELS: Record<keyof Hotkeys, string> = {
  pass: "Pass",
  fail: "Fail",
  next: "Next trace",
  prev: "Previous trace",
  labelNext: "Jump to next unlabeled",
  skip: "Skip / unmark skip",
};

// Reject reserved keys (digits 1-4 are quick-apply tag chips; Enter and
// arrows are wired into the navigation path) and flag collisions against
// other actions so a user cannot silently override Fail by rebinding Pass
// to the same key. Returns null when the key is acceptable.
function validateHotkey(
  key: string,
  actionId: keyof Hotkeys,
  allHotkeys: Hotkeys,
): string | null {
  if (key >= "1" && key <= "4") {
    return "1-4 are reserved for quick-apply tags";
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
  onClose,
  onChange,
  onModeChange,
}: {
  open: boolean;
  hotkeys: Hotkeys;
  mode: Mode;
  onClose: () => void;
  onChange: (next: Hotkeys) => void;
  onModeChange: (next: Mode) => void;
}) {
  // Trap focus inside the dialog and restore it to the trigger on close so
  // keyboard users cannot tab into the obscured background.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  // Close on Escape - matches the visual modal pattern of TagManagementPanel
  // and the shared Dialog primitives.
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
    { id: "next", label: ACTION_LABELS.next },
    { id: "prev", label: ACTION_LABELS.prev },
    { id: "labelNext", label: ACTION_LABELS.labelNext },
    { id: "skip", label: ACTION_LABELS.skip },
  ];
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-md rounded-lg bg-white shadow-xl border flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ModeSection mode={mode} onModeChange={onModeChange} />
          <div className="px-5 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Hotkeys
          </div>
          <div className="px-5 py-2 text-xs text-gray-600">
            Click a row, then press a single letter. Digits 1-4, Enter, and the
            arrow keys are reserved. Cmd/Ctrl+Z is reserved for undo.
          </div>
          <ul className="divide-y px-5 pb-3">
            {rows.map((row) => (
              <HotkeyRow
                key={row.id}
                label={row.label}
                actionId={row.id}
                allHotkeys={hotkeys}
                value={hotkeys[row.id]}
                onCapture={(next) =>
                  onChange({ ...hotkeys, [row.id]: next })
                }
              />
            ))}
          </ul>
          {mode === "experienced" && <AdapterSection />}
        </div>
        <div className="px-5 py-3 border-t flex justify-between">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_HOTKEYS)}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Reset hotkeys
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// Mode toggle section at the top of the Settings modal. v3.
//
// Renders a single labeled toggle with help text. Beginners see the v1/v2
// experience by default; flipping this on reveals batch labeling, JSON DSL
// adapter, tool-call review, and similarity highlighting in later v3 features.
//
// No discovery cues elsewhere in the app: experienced users find this when
// they go looking. That choice was made during /explore (user explicitly
// rejected coaching-card and earned-milestone discovery patterns).
function ModeSection({
  mode,
  onModeChange,
}: {
  mode: Mode;
  onModeChange: (next: Mode) => void;
}) {
  const isExperienced = mode === "experienced";
  return (
    <div className="px-5 pt-4 pb-3 border-b">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Mode
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <button
          type="button"
          role="switch"
          aria-checked={isExperienced}
          onClick={() => onModeChange(isExperienced ? "novice" : "experienced")}
          className={`mt-0.5 relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            isExperienced ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              isExperienced ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <span className="flex-1">
          <span className="block text-sm font-medium text-gray-900">
            I&apos;m experienced (show power features)
          </span>
          <span className="block text-xs text-gray-600 mt-0.5">
            Adds batch labeling, custom adapters, tool-call review, and
            similarity highlighting. Toggle off any time to return to the
            beginner experience.
          </span>
        </span>
      </label>
    </div>
  );
}

// Custom adapter (JSON DSL) editor section for the Settings modal. v3, #16.
//
// Power users in experienced mode paste a JSON object describing how to map
// raw rows from a non-standard file shape to the internal Trace shape. Once
// saved, every subsequent file load skips the wizard's mapping step and
// applies this config directly. See src/lib/trace/adapter-dsl.ts for the
// supported schema and src/components/wizard/Wizard.tsx for where it's
// applied at load time.
//
// Three actions: Validate (parses without saving, useful for iterating on
// the JSON), Save (validates then persists), and Clear (drops the saved
// adapter so future loads use the normal wizard).
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
    <div className="px-5 pt-4 pb-4 border-t">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
        Custom adapter (JSON)
      </div>
      <p className="text-xs text-gray-600 mb-2">
        Paste a JSON object describing how your trace files map to the
        internal shape. Once saved, file loads skip the wizard mapping step.
        Field names support dot-notation for nested objects (e.g.{" "}
        <code className="font-mono">data.messages</code>).
      </p>
      <p className="text-[11px] text-gray-500 mb-2">
        {saved ? (
          <>
            Adapter saved at{" "}
            <span className="font-mono text-gray-700">
              {new Date(saved.savedAt).toLocaleString()}
            </span>
          </>
        ) : (
          <>No adapter saved. The wizard runs normally on file load.</>
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
        className="w-full font-mono text-[11px] rounded border border-gray-300 px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-1 text-[11px] ${
            feedback.kind === "ok" ? "text-green-700" : "text-red-700"
          }`}
        >
          {feedback.msg}
        </p>
      )}
      <div className="mt-2 flex gap-2 justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={!saved && draft.trim() === ""}
          className="text-xs text-gray-600 hover:text-gray-900 underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={validate}
          disabled={draft.trim() === ""}
          className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Validate
        </button>
        <button
          type="button"
          onClick={save}
          disabled={draft.trim() === ""}
          className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save
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
  // Inline error replaces the silent override behavior. Cleared whenever the
  // user closes capture mode or successfully captures a valid key.
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="py-2 flex items-start gap-3">
      <span className="flex-1 text-sm text-gray-800 mt-1">{label}</span>
      <div className="flex flex-col items-end gap-1 min-w-[80px]">
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
            // Filter out modifier-only events.
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
              // Stay in capturing mode so the user can immediately try a
              // different key without re-clicking.
              setError(reason);
              return;
            }
            setError(null);
            onCapture(e.key);
            setCapturing(false);
          }}
          className={`w-full px-2 py-1 text-xs font-mono rounded border ${
            capturing
              ? "border-blue-400 bg-blue-50 text-blue-700"
              : error
              ? "border-red-400 text-gray-800 hover:bg-gray-50"
              : "border-gray-300 text-gray-800 hover:bg-gray-50"
          }`}
        >
          {capturing ? "press a key..." : value}
        </button>
        {error && (
          <span className="text-[10px] text-red-600 text-right" role="alert">
            {error}
          </span>
        )}
      </div>
    </li>
  );
}

// Compact filter dropdown. Supports the four filter modes used by
// TraceView. Tag filter only appears when at least one tag exists.
function FilterPicker({
  filter,
  onFilter,
  allTags,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  allTags: string[];
}) {
  // Encode the active filter as a single string so the <select> element
  // can drive it. Tag filters use a "tag:<name>" prefix so we can decode
  // back to the structured shape on change.
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
        // "sample" is the active-sample status row and is rendered disabled
        // below; it's never a selectable value, but we no-op defensively.
      }}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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

// Tools-surface popover anchored to the top-bar Find button. Bundles the
// three "find" affordances (filter, jump-to-#, random sample) so the user
// reaches them with one click and a single dismiss path. Click-outside or
// Escape closes the popover. Sample size is now a real inline input with
// validation; the previous browser prompt() flow is gone.
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
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Find traces"
      className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-20 p-3 space-y-3"
    >
      <FilterPicker filter={filter} onFilter={onFilter} allTags={allTags} />
      <form onSubmit={handleJumpSubmit} className="flex gap-2">
        <input
          type="number"
          min={1}
          max={total}
          value={jumpInput}
          onChange={(e) => setJumpInput(e.target.value)}
          placeholder={`Go to # (1-${total})`}
          aria-label="Go to trace number"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
        <button
          type="submit"
          className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
        >
          Go
        </button>
      </form>
      <form onSubmit={handleSampleSubmit}>
        <label
          htmlFor="find-sample-size"
          className="block text-xs text-gray-600 mb-1"
        >
          Random sample
        </label>
        <p className="text-[11px] text-gray-500 mb-1.5">
          Pick a random subset to focus on - useful for spot-checking a large
          file.
        </p>
        <div className="flex gap-2">
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
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          <button
            type="submit"
            className="px-3 py-1 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Sample
          </button>
        </div>
        {sampleError && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {sampleError}
          </p>
        )}
      </form>
      <p className="text-[11px] text-gray-400 text-right">
        <kbd className="font-mono text-gray-400">Esc</kbd> to close
      </p>
    </div>
  );
}

// Collapsed-by-default strip showing trace metadata (extra fields beyond
// id/input/output that the wizard kept via metadataPassthrough). Per
// CLAUDE.md design principles this is hidden until the user clicks to
// expand - "minimalism with progressive disclosure".
function MetadataStrip({ metadata }: { metadata: Record<string, unknown> }) {
  const keys = Object.keys(metadata);
  return (
    <details className="mb-3 -mt-1">
      <summary className="text-xs text-gray-500 hover:text-gray-700 cursor-pointer select-none">
        Show metadata ({keys.length} {keys.length === 1 ? "field" : "fields"})
      </summary>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs">
        {keys.map((k) => (
          <div key={k} className="contents">
            <dt className="font-mono text-gray-500">{k}</dt>
            <dd className="font-mono text-gray-700 truncate">
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
  // Lightweight always-visible indicator. Lives in the top bar so the user
  // knows their work is persisting (or, when broken, knows to export).
  let label: string;
  let cls: string;
  switch (status.kind) {
    case "idle":
      return null;
    case "saving":
      label = "Saving...";
      cls = "text-gray-400";
      break;
    case "saved":
      label = `Saved ${status.at}`;
      cls = "text-gray-500";
      break;
    case "error":
      label = `Save error - export now`;
      cls = "text-red-600";
      break;
  }
  return (
    <span
      role="status"
      aria-live="polite"
      title={status.kind === "error" ? status.message : undefined}
      className={`text-xs ${cls}`}
    >
      {label}
    </span>
  );
}

function ExportButton({
  onExport,
  disabled,
}: {
  onExport: (fmt: "jsonl" | "csv") => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 min-w-[120px]">
          {(["jsonl", "csv"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => {
                onExport(fmt);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Download .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
