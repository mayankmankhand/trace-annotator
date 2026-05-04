"use client";

// BatchPanel - bulk-apply controls for v3 batch labeling (#36).
//
// Appears in the right side panel when the user has selected one or more
// traces. Beginners never see this surface; experienced mode unlocks it.
//
// Visual differentiation: bulk Pass / Fail use OUTLINE styling (white bg
// with green/red text and border) so they're plainly distinct from the
// per-trace solid Pass / Fail buttons one section below. Color semantics
// stay (green = pass, red = fail), but the user cannot mistake "Pass all"
// for "Pass this one." Header copy spells out scope ("applies to N
// selected, across the whole file") because selection includes off-screen
// traces.
//
// Three bulk actions:
//   - Verdict: apply Pass or Fail to every selected trace.
//   - Tag: append a tag to each selected trace.
//   - Clear: drops the selection without modifying labels.
//
// The actual mutation lives in the parent (TraceView) so it can co-update
// in-memory annotations, push a grouped undo entry, write audit entries
// with a shared batchId, and (importantly) gate destructive overwrites
// behind a ConfirmDialog when prior verdicts would be overwritten.

import { useState } from "react";
import type { Verdict } from "./TraceView";

type Props = {
  selectedCount: number;
  allTags: string[];
  onApplyVerdict: (v: Verdict) => void;
  onApplyTag: (tag: string) => void;
  onClear: () => void;
};

export function BatchPanel({
  selectedCount,
  allTags,
  onApplyVerdict,
  onApplyTag,
  onClear,
}: Props) {
  const [tagInput, setTagInput] = useState("");

  function submitTag(e?: React.FormEvent) {
    e?.preventDefault();
    const tag = tagInput.trim();
    if (!tag) return;
    onApplyTag(tag);
    setTagInput("");
  }

  return (
    <div
      className="rounded-md border-2 border-blue-400 bg-blue-50 px-3 py-3 shadow-sm"
      role="region"
      aria-label="Bulk action panel"
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-blue-800">
          Bulk action ({selectedCount} selected)
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] text-blue-700 hover:text-blue-900 underline"
        >
          Clear
        </button>
      </div>
      <p className="text-[10px] text-blue-700 mb-2">
        Applies to all {selectedCount} selected traces, including off-screen.
      </p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => onApplyVerdict("pass")}
          className="flex-1 px-2 py-1.5 text-xs font-medium rounded border-2 border-green-600 bg-white text-green-700 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500"
        >
          Pass all
        </button>
        <button
          type="button"
          onClick={() => onApplyVerdict("fail")}
          className="flex-1 px-2 py-1.5 text-xs font-medium rounded border-2 border-red-600 bg-white text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          Fail all
        </button>
      </div>
      <form onSubmit={submitTag} className="flex gap-2">
        <input
          type="text"
          list="batch-tag-suggestions"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Add tag to all..."
          className="flex-1 min-w-0 rounded border border-blue-200 bg-white px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Tag to apply to all selected traces"
        />
        <datalist id="batch-tag-suggestions">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={tagInput.trim() === ""}
          className="px-2 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Apply
        </button>
      </form>
    </div>
  );
}
