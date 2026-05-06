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

// Shared modal shell, restyled for the Quiet Notebook system (issue #53).
// Used for destructive flows that already live inside a full-bleed
// overlay (tag merge / delete from Tag management). Per the friction-test
// rule, modals do NOT appear during labeling; in-rail flows use inline
// confirmation instead.
//
// `initialFocusRef` lets callers override which element receives focus on
// open (e.g., destructive ConfirmDialog focuses Cancel rather than the
// destructive primary).
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
      className="ta-dialog"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        className="ta-dialog__sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

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
      <div className="ta-dialog__head">
        <h2 className="ta-dialog__title">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close dialog"
          className="lv-overlay__close"
        >
          &times;
        </button>
      </div>
      <div className="ta-dialog__body">{body}</div>
      <div className="ta-dialog__foot">
        <button
          ref={cancelRef}
          type="button"
          onClick={onCancel}
          className="lv-nav"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={`lv-nav lv-nav--primary${destructive ? " lv-nav--destructive" : ""}`}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

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
        <div className="ta-dialog__head">
          <h2 className="ta-dialog__title">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="lv-overlay__close"
          >
            &times;
          </button>
        </div>
        <div className="ta-dialog__body">
          <label htmlFor={inputId} className="ta-dialog__inputLabel">
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
            className="wz-field__input"
          />
          {error && (
            <p className="ta-dialog__error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="ta-dialog__foot">
          <button type="button" onClick={onCancel} className="lv-nav">
            {cancelLabel}
          </button>
          <button type="submit" className="lv-nav lv-nav--primary">
            {confirmLabel}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
