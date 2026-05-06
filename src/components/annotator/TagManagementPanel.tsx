"use client";

import { useEffect, useState } from "react";
import type { Annotations } from "./TraceView";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { ConfirmDialog } from "@/components/ui/Dialog";

// TagManagementPanel (issue #53). Now opens as a full-bleed overlay so it
// never sits on top of a trace - matches the friction-test rule that
// taxonomy editing should not be a popup over labeling work.

type Props = {
  annotations: Annotations;
  open: boolean;
  onClose: () => void;
  onRename: (oldTag: string, newTag: string) => void;
  onDelete: (tag: string) => void;
};

function tagCounts(annotations: Annotations): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of Object.values(annotations)) {
    for (const t of a.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

export function TagManagementPanel({
  annotations,
  open,
  onClose,
  onRename,
  onDelete,
}: Props) {
  const counts = tagCounts(annotations);
  const tags = Array.from(counts.keys()).sort();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pendingMerge, setPendingMerge] = useState<{
    from: string;
    to: string;
  } | null>(null);
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

  function startEdit(tag: string) {
    setEditing(tag);
    setDraft(tag);
  }
  function commitEdit() {
    if (!editing) return;
    const next = draft.trim();
    if (next && next !== editing) {
      if (counts.has(next)) {
        setPendingMerge({ from: editing, to: next });
        return;
      }
      onRename(editing, next);
    }
    setEditing(null);
    setDraft("");
  }
  function cancelEdit() {
    setEditing(null);
    setDraft("");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Manage tags"
      className="lv-overlay"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="lv-overlay__sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lv-overlay__head">
          <h2 className="lv-overlay__title">Manage tags</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tag management"
            className="lv-overlay__close"
          >
            &times;
          </button>
        </div>
        <div className="lv-overlay__body scroll-y">
          <p className="lv-overlay__hint">
            Rename a tag to fix a typo, or rename two tags to the same name to
            merge them. Deleting a tag removes it from every trace that has it
            (the labels themselves stay).
          </p>
          {tags.length === 0 ? (
            <p className="lv-tagmgr__empty">
              No tags yet. Add some from the labeling view first.
            </p>
          ) : (
            <ul className="lv-tagmgr">
              {tags.map((tag) => {
                const count = counts.get(tag) ?? 0;
                const isEditing = editing === tag;
                return (
                  <li key={tag} className="lv-tagmgr__row">
                    {isEditing ? (
                      <>
                        <input
                          autoFocus
                          type="text"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitEdit();
                            if (e.key === "Escape") cancelEdit();
                          }}
                          className="lv-tagmgr__input"
                        />
                        <button
                          type="button"
                          onClick={commitEdit}
                          className="lv-nav lv-nav--primary"
                        >
                          save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="lv-overlay__resetLink"
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="lv-tagmgr__tag">
                          <span className="ta-chip ta-chip--applied">{tag}</span>
                          <span className="lv-tagmgr__count">
                            on {count} {count === 1 ? "trace" : "traces"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(tag)}
                          className="lv-overlay__resetLink"
                        >
                          rename
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(tag)}
                          className="lv-overlay__resetLink lv-overlay__resetLink--destructive"
                        >
                          delete
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingMerge !== null}
        title="Merge tags?"
        body={
          pendingMerge &&
          (() => {
            const fromCount = counts.get(pendingMerge.from) ?? 0;
            const toCount = counts.get(pendingMerge.to) ?? 0;
            return (
              <p>
                <span className="ta-chip ta-chip--applied">
                  {pendingMerge.to}
                </span>{" "}
                already exists on {toCount}{" "}
                {toCount === 1 ? "trace" : "traces"}. This rename will merge{" "}
                <span className="ta-chip ta-chip--applied">
                  {pendingMerge.from}
                </span>{" "}
                ({fromCount} {fromCount === 1 ? "trace" : "traces"}) into it.
                The original tag will be removed.
              </p>
            );
          })()
        }
        confirmLabel="Merge"
        onConfirm={() => {
          if (pendingMerge) {
            onRename(pendingMerge.from, pendingMerge.to);
            setEditing(null);
            setDraft("");
          }
          setPendingMerge(null);
        }}
        onCancel={() => setPendingMerge(null)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete tag?"
        body={
          pendingDelete &&
          (() => {
            const c = counts.get(pendingDelete) ?? 0;
            return (
              <p>
                This will remove{" "}
                <span className="ta-chip ta-chip--applied">{pendingDelete}</span>{" "}
                from {c} {c === 1 ? "trace" : "traces"}. The labels themselves
                stay.
              </p>
            );
          })()
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
