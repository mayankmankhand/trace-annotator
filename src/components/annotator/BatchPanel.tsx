"use client";

// BatchPanel - bulk-apply controls for v3 batch labeling (#36).
// Restyled for issue #53 to use Quiet Notebook tokens; visual language
// matches the rest of the rail rather than v2's saturated blue/violet
// palette.
//
// Three bulk actions:
//   - Verdict: apply Pass or Fail to every selected trace.
//   - Tag: append a tag to each selected trace.
//   - Clear: drops the selection without modifying labels.
//
// Bulk verdict mutations live in the parent (TraceView) so it can
// co-update annotations, undo stack, audit log, and gate destructive
// overwrites behind a ConfirmDialog.

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
    <div className="lv-batch" role="region" aria-label="Bulk action panel">
      <div className="lv-batch__head">
        <div className="lv-rail__label">
          bulk action
          <span className="lv-rail__labelMeta">{selectedCount} selected</span>
        </div>
        <button type="button" onClick={onClear} className="lv-rail__inlineLink">
          clear selection
        </button>
      </div>
      <p className="lv-batch__scope">
        Applies to all {selectedCount} selected traces, including off-screen.
      </p>
      <div className="lv-verdict lv-batch__verdict">
        <button
          type="button"
          className="verdict-btn"
          data-active="pass"
          onClick={() => onApplyVerdict("pass")}
          aria-label={`Pass all ${selectedCount} selected`}
        >
          Pass all
        </button>
        <button
          type="button"
          className="verdict-btn"
          data-active="fail"
          onClick={() => onApplyVerdict("fail")}
          aria-label={`Fail all ${selectedCount} selected`}
        >
          Fail all
        </button>
      </div>
      <form onSubmit={submitTag} className="lv-batch__tagForm">
        <div className="lv-tag-input lv-batch__tagInput">
          <input
            type="text"
            list="batch-tag-suggestions"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="Add tag to all..."
            aria-label="Tag to apply to all selected traces"
          />
        </div>
        <datalist id="batch-tag-suggestions">
          {allTags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={tagInput.trim() === ""}
          className="lv-nav lv-nav--primary"
        >
          apply
        </button>
      </form>
    </div>
  );
}
