"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Trace } from "@/lib/trace/types";
import type { LabelRow } from "@/lib/labels/types";
import { serialize, mimeType, fileName } from "@/lib/labels/serialize";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";
import { TagPanel } from "./TagPanel";
import { TagManagementPanel } from "./TagManagementPanel";
import { Logo } from "@/components/Logo";
import {
  CoachingTip,
  MilestoneTip,
  dismissCoachingPermanent,
  dismissCoachingSession,
  dismissMilestone,
  getMilestoneForIndex,
  isCoachingActive,
  resetCoaching,
} from "./CoachingTip";
import {
  appendAuditEntry,
  loadHotkeys,
  saveHotkeys,
  saveLabels,
  saveSessionState,
  type Hotkeys,
  DEFAULT_HOTKEYS,
} from "@/lib/storage";

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
};
export type Annotations = Record<string, Annotation>;

const EMPTY_ANNOTATION: Annotation = {
  verdict: null,
  note: "",
  tags: [],
  labeledAt: "",
  isEdited: false,
  skipped: false,
};

function toRows(annotations: Annotations): LabelRow[] {
  return Object.entries(annotations)
    .filter(([, a]) => a.verdict !== null || a.tags.length > 0 || a.note.trim() !== "")
    .map(([id, a]) => annotationToRow(id, a));
}

function annotationToRow(trace_id: string, a: Annotation): LabelRow {
  return {
    trace_id,
    verdict: a.verdict,
    tags: a.tags,
    note: a.note,
    labeled_at: a.labeledAt || new Date().toISOString(),
  };
}

function isEmptyAnnotation(a: Annotation): boolean {
  return a.verdict === null && a.tags.length === 0 && a.note.trim() === "";
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
  const [annotations, setAnnotations] = useState<Annotations>(initialAnnotations);
  const [coachingActive, setCoachingActive] = useState(() => isCoachingActive());
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
  const [milestone, setMilestone] = useState(() =>
    getMilestoneForIndex(fingerprint, initialIndex),
  );

  // Undo stack: append-only log of {trace_id, before, after} entries. The
  // top of the stack is the most recent change. Cmd/Ctrl+Z pops the top
  // and restores `before` for that trace. We cap the stack at 100 to keep
  // memory bounded; for v2.0 use cases (one user labeling hundreds of
  // traces) that's overkill but cheap.
  type UndoEntry = {
    trace_id: string;
    before: Annotation;
    after: Annotation;
  };
  const undoStackRef = useRef<UndoEntry[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  // Used to prevent the undo action itself from re-pushing onto the stack.
  const isUndoingRef = useRef(false);
  // Tag management panel open/closed.
  const [tagPanelOpen, setTagPanelOpen] = useState(false);

  // Filter / sampling state. "all" is the default. Other modes restrict
  // navigation to a subset; the user still sees total counts in the top bar
  // but Next/Prev skip non-matching traces. Random sample is materialized
  // as a fixed index set so the same "sample of N" stays stable while the
  // user works through it.
  type Filter =
    | { kind: "all" }
    | { kind: "verdict"; v: Verdict | "unlabeled" | "skipped" }
    | { kind: "tag"; tag: string }
    | { kind: "sample"; indices: Set<number> };
  const [filter, setFilter] = useState<Filter>({ kind: "all" });

  // jumpInput: controlled value for the "go to trace #" input.
  const [jumpInput, setJumpInput] = useState("");

  // Hotkeys can be remapped via the Settings modal. Loaded once on mount.
  const [hotkeys, setHotkeys] = useState<Hotkeys>(DEFAULT_HOTKEYS);
  useEffect(() => {
    setHotkeys(loadHotkeys());
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        const dir = delta < 0 ? -1 : 1;
        for (let next = i + dir; next >= 0 && next < total; next += dir) {
          if (matchesFilter(next, annotations)) return next;
        }
        return i;
      });
    },
    [total, matchesFilter, annotations],
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
  // changed and appends a row to the persistent audit log. Skips itself
  // when the change is being applied by the undo mechanism (otherwise
  // undo would no-op).
  const pushUndo = useCallback(
    (trace_id: string, before: Annotation, after: Annotation) => {
      if (isUndoingRef.current) return;
      const stack = undoStackRef.current;
      stack.push({ trace_id, before, after });
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
    },
    [fingerprint],
  );

  const applyVerdict = useCallback(
    (v: Verdict) => {
      setAnnotations((prev) => {
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
        pushUndo(trace.id, cur, next);
        return { ...prev, [trace.id]: next };
      });
    },
    [trace.id, pushUndo],
  );

  // Toggle skip (review later). Independent of verdict so the user can mark
  // a trace skipped, then later go back and apply pass/fail.
  const toggleSkip = useCallback(() => {
    setAnnotations((prev) => {
      const cur = getOrEmpty(prev, trace.id);
      const next: Annotation = {
        ...cur,
        skipped: !cur.skipped,
        labeledAt: cur.labeledAt || new Date().toISOString(),
      };
      pushUndo(trace.id, cur, next);
      return { ...prev, [trace.id]: next };
    });
  }, [trace.id, pushUndo]);

  const updateAnnotation = useCallback(
    (a: Annotation) => {
      setAnnotations((prev) => {
        const cur = getOrEmpty(prev, trace.id);
        const next: Annotation = {
          ...a,
          labeledAt: a.labeledAt || new Date().toISOString(),
        };
        pushUndo(trace.id, cur, next);
        return { ...prev, [trace.id]: next };
      });
    },
    [trace.id, pushUndo],
  );

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    const last = stack.pop();
    if (!last) return;
    setUndoCount(stack.length);
    isUndoingRef.current = true;
    setAnnotations((prev) => {
      const next = { ...prev };
      // If the previous state was empty (creation case), drop the entry
      // entirely so toRows doesn't emit a row with verdict=null and empty
      // tags/note - matches the v1 "untouched trace" semantics.
      if (
        last.before.verdict === null &&
        last.before.tags.length === 0 &&
        last.before.note === ""
      ) {
        delete next[last.trace_id];
      } else {
        next[last.trace_id] = last.before;
      }
      return next;
    });
    // Jump to the trace whose change we're reverting so the user sees what
    // happened. Skipped if they're already there.
    const targetIdx = traces.findIndex((t) => t.id === last.trace_id);
    if (targetIdx >= 0 && targetIdx !== index) setIndex(targetIdx);
    // Release the flag on the next tick so subsequent edits are recorded.
    setTimeout(() => {
      isUndoingRef.current = false;
    }, 0);
  }, [index, traces]);

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
  }, []);

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
  }, []);

  const applyQuickTag = useCallback(
    (tag: string) => {
      setAnnotations((prev) => {
        const cur = getOrEmpty(prev, trace.id);
        if (cur.tags.includes(tag)) return prev;
        return { ...prev, [trace.id]: { ...cur, tags: [...cur.tags, tag] } };
      });
      addTagToSession(tag);
    },
    [trace.id, addTagToSession],
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
        setAnnotations((cur) => {
          jumpToNextUnlabeled(index, cur);
          return cur;
        });
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
  const saveLabelsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const rows = toRows(annotations);
    if (saveLabelsTimerRef.current) clearTimeout(saveLabelsTimerRef.current);
    setSaveStatus({ kind: "saving" });
    saveLabelsTimerRef.current = setTimeout(() => {
      saveLabels(fingerprint, rows)
        .then(() => {
          const at = new Date().toLocaleTimeString();
          setSaveStatus({ kind: "saved", at });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof Error ? err.message : "Save failed";
          setSaveStatus({ kind: "error", message });
        });
    }, 500);
    return () => {
      if (saveLabelsTimerRef.current) clearTimeout(saveLabelsTimerRef.current);
    };
  }, [annotations, fingerprint]);

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
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator status={saveStatus} />
          {!coachingActive && (
            <button
              type="button"
              onClick={() => {
                resetCoaching();
                setCoachingActive(true);
              }}
              aria-label="Show coaching tips"
              title="Restart coaching tips"
              className="text-xs text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
            >
              ? tips
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings (hotkeys)"
            className="text-xs text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded px-1"
          >
            Settings
          </button>
          <ExportButton onExport={handleExport} disabled={labeledCount === 0} />
        </div>
      </header>

      <div
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={total}
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
            </div>

            {trace.metadata && Object.keys(trace.metadata).length > 0 && (
              <MetadataStrip metadata={trace.metadata} />
            )}

            {coachingActive && (
              <CoachingTip
                traceIndex={index}
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

            <TagPanel
              annotation={annotation}
              allTags={allTags}
              onUpdate={updateAnnotation}
              onTagCreated={addTagToSession}
            />
          </div>
        </main>

        <aside
          aria-label="Label and navigate"
          className="basis-1/4 min-w-[220px] max-w-[360px] border-l bg-white px-4 py-6 overflow-auto flex flex-col gap-5"
        >
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

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Find
            </h3>
            <div className="space-y-2">
              <FilterPicker
                filter={filter}
                onFilter={setFilter}
                allTags={allTags}
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(jumpInput);
                  if (!Number.isNaN(n) && n >= 1 && n <= total) {
                    jumpTo(n);
                    setJumpInput("");
                  }
                }}
                className="flex gap-2"
              >
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
              <button
                type="button"
                onClick={() => {
                  const raw = prompt(
                    "Pick a random sample of how many traces?",
                    "20",
                  );
                  if (raw === null) return;
                  const n = Number(raw);
                  if (!Number.isNaN(n) && n > 0) sampleRandom(n);
                }}
                className="w-full px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Random sample...
              </button>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Tags
            </h3>
            <button
              type="button"
              onClick={() => setTagPanelOpen(true)}
              disabled={allTags.length === 0}
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Manage tags
              {allTags.length > 0 && (
                <span className="text-xs text-gray-400">({allTags.length})</span>
              )}
            </button>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Undo
            </h3>
            <button
              type="button"
              disabled={undoCount === 0}
              onClick={undo}
              aria-label="Undo last change"
              title="Undo last change (Cmd/Ctrl+Z)"
              className="flex items-center justify-center gap-2 w-full px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Undo
              {undoCount > 0 && (
                <span className="text-xs text-gray-400">({undoCount})</span>
              )}
              <kbd className="ml-auto text-[10px] font-mono text-gray-400">
                &#8984;Z
              </kbd>
            </button>
          </div>

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
                onClick={() => jumpToNextUnlabeled(index, annotations)}
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
        onClose={() => setSettingsOpen(false)}
        onChange={(next) => {
          setHotkeys(next);
          saveHotkeys(next);
        }}
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
function SettingsModal({
  open,
  hotkeys,
  onClose,
  onChange,
}: {
  open: boolean;
  hotkeys: Hotkeys;
  onClose: () => void;
  onChange: (next: Hotkeys) => void;
}) {
  if (!open) return null;
  const rows: { id: keyof Hotkeys; label: string }[] = [
    { id: "pass", label: "Pass" },
    { id: "fail", label: "Fail" },
    { id: "next", label: "Next trace" },
    { id: "prev", label: "Previous trace" },
    { id: "labelNext", label: "Jump to next unlabeled" },
    { id: "skip", label: "Skip / unmark skip" },
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
        className="w-full max-w-md rounded-lg bg-white shadow-xl border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Hotkeys</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            &times;
          </button>
        </div>
        <div className="px-5 py-3 text-xs text-gray-600">
          Click a row, then press the new key. Single letters or arrow keys.
          Cmd/Ctrl+Z is reserved for undo.
        </div>
        <ul className="divide-y px-5 pb-3">
          {rows.map((row) => (
            <HotkeyRow
              key={row.id}
              label={row.label}
              value={hotkeys[row.id]}
              onCapture={(next) =>
                onChange({ ...hotkeys, [row.id]: next })
              }
            />
          ))}
        </ul>
        <div className="px-5 py-3 border-t flex justify-between">
          <button
            type="button"
            onClick={() => onChange(DEFAULT_HOTKEYS)}
            className="text-xs text-gray-600 hover:text-gray-900 underline"
          >
            Reset to defaults
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

function HotkeyRow({
  label,
  value,
  onCapture,
}: {
  label: string;
  value: string;
  onCapture: (next: string) => void;
}) {
  const [capturing, setCapturing] = useState(false);
  return (
    <li className="py-2 flex items-center gap-3">
      <span className="flex-1 text-sm text-gray-800">{label}</span>
      <button
        type="button"
        onClick={() => setCapturing((v) => !v)}
        onKeyDown={(e) => {
          if (!capturing) return;
          if (e.key === "Escape") {
            setCapturing(false);
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
          onCapture(e.key);
          setCapturing(false);
        }}
        className={`min-w-[80px] px-2 py-1 text-xs font-mono rounded border ${
          capturing
            ? "border-blue-400 bg-blue-50 text-blue-700"
            : "border-gray-300 text-gray-800 hover:bg-gray-50"
        }`}
      >
        {capturing ? "press a key..." : value}
      </button>
    </li>
  );
}

type FilterShape =
  | { kind: "all" }
  | { kind: "verdict"; v: Verdict | "unlabeled" | "skipped" }
  | { kind: "tag"; tag: string }
  | { kind: "sample"; indices: Set<number> };

// Compact filter dropdown. Supports the four filter modes used by
// TraceView. Tag filter only appears when at least one tag exists.
function FilterPicker({
  filter,
  onFilter,
  allTags,
}: {
  filter: FilterShape;
  onFilter: (f: FilterShape) => void;
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
      }}
      className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <option value="all">All traces</option>
      <option value="v:unlabeled">Unlabeled only</option>
      <option value="v:pass">Pass only</option>
      <option value="v:fail">Fail only</option>
      <option value="v:skipped">Skipped only</option>
      {filter.kind === "sample" && (
        <option value="sample">Random sample ({filter.indices.size})</option>
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
