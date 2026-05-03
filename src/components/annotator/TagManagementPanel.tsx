"use client";

import { useEffect, useState } from "react";
import type { Annotations } from "./TraceView";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { ConfirmDialog } from "@/components/ui/Dialog";

// Rename, merge, and remove tags across the entire labeled set. Operates on
// a snapshot of all annotations; the parent applies the transform globally.
// Per the v2 plan: flat tags only (no hierarchy), so the UI is intentionally
// simple - a list of distinct tags with rename/delete affordances.

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
  // Tag pending deletion. The styled ConfirmDialog replaces the previous
  // browser confirm() so the impact ("on N traces") is visible inline and
  // the dialog inherits the same focus-trap as the rest of the modal.
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // Trap focus inside the dialog while it's open. Restores focus to the
  // trigger element on close. Without this, Tab would carry the user into
  // the obscured background.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  // Close on Escape - matches the visual modal pattern used by SettingsModal
  // and the ConfirmDialog primitive.
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
      // Merge happens implicitly: if `next` already exists, both old and
      // new collapse into the same canonical tag.
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
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-lg bg-white shadow-xl border max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Manage tags</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tag management"
            className="text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            &times;
          </button>
        </div>

        <div className="px-5 py-3 text-xs text-gray-600">
          Rename a tag to fix a typo, or rename two tags to the same name to
          merge them. Deleting a tag removes it from every trace that has it
          (the labels themselves stay).
        </div>

        <div className="flex-1 overflow-auto px-5 pb-5">
          {tags.length === 0 ? (
            <p className="text-sm text-gray-500 italic">
              No tags yet. Add some from the trace view first.
            </p>
          ) : (
            <ul className="divide-y">
              {tags.map((tag) => {
                const count = counts.get(tag) ?? 0;
                const isEditing = editing === tag;
                return (
                  <li
                    key={tag}
                    className="py-2 flex items-center gap-3"
                  >
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
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={commitEdit}
                          className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 inline-flex items-center gap-2">
                          <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                            {tag}
                          </span>
                          <span className="text-xs text-gray-500">
                            on {count} {count === 1 ? "trace" : "traces"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => startEdit(tag)}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(tag)}
                          className="text-xs text-red-600 hover:text-red-800 hover:underline"
                        >
                          Delete
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
        open={pendingDelete !== null}
        title="Delete tag?"
        body={
          pendingDelete &&
          (() => {
            const c = counts.get(pendingDelete) ?? 0;
            return (
              <p>
                This will remove{" "}
                <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 mx-0.5">
                  {pendingDelete}
                </span>{" "}
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
