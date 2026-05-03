"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";

// Shared modal shell: dimmed overlay, rounded white card, focus trap, Esc to
// close. Mirrors SettingsModal / TagManagementPanel visual tokens so dialogs
// feel like the same family. `initialFocusRef` lets callers override which
// element receives focus on open (e.g., destructive ConfirmDialog focuses
// Cancel instead of the destructive primary).
function ModalShell({
  open,
  onClose,
  ariaLabel,
  initialFocusRef,
  children,
}: {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const containerRef = useFocusTrap<HTMLDivElement>(open, initialFocusRef);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="w-full max-w-md rounded-lg bg-white shadow-xl border"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// Confirm an action that may be destructive (red primary) or routine (blue).
// Body accepts arbitrary nodes so callers can spell out impact (e.g. "will
// remove `wrong-date` from 14 traces"). Destructive dialogs auto-focus
// Cancel rather than the destructive primary so a stray Enter doesn't
// commit a delete.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      ariaLabel={title}
      initialFocusRef={destructive ? cancelRef : undefined}
    >
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close dialog"
          className="text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          &times;
        </button>
      </div>
      <div className="px-5 py-4 text-sm text-gray-700">{body}</div>
      <div className="px-5 py-3 border-t flex justify-end gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`text-xs px-3 py-1 rounded text-white ${
            destructive
              ? "bg-red-600 hover:bg-red-700"
              : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

// Single-input prompt. Validation runs on submit; errors render inline so the
// user can correct without losing context. `type="number"` enforces native
// numeric input plus optional min/max bounds.
export function PromptDialog({
  open,
  title,
  label,
  defaultValue = "",
  type = "text",
  min,
  max,
  validate,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  label: string;
  defaultValue?: string;
  type?: "text" | "number";
  min?: number;
  max?: number;
  validate?: (value: string) => string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const inputId = useId();
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  // Reset input state whenever the dialog reopens so stale values do not leak
  // between invocations.
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }, [open, defaultValue]);

  function handleConfirm() {
    const localError = validate ? validate(value) : null;
    if (localError) {
      setError(localError);
      return;
    }
    onConfirm(value);
  }

  return (
    <ModalShell open={open} onClose={onCancel} ariaLabel={title}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleConfirm();
        }}
      >
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            &times;
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-gray-700">
          <label htmlFor={inputId} className="block text-sm text-gray-700 mb-1.5">
            {label}
          </label>
          <input
            id={inputId}
            type={type}
            min={min}
            max={max}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          />
          {error && (
            <p className="mt-2 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs px-3 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
