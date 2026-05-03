"use client";

import { useEffect, useRef, type RefObject } from "react";

// Traps Tab/Shift+Tab focus inside the ref'd container while `active` is true.
// Auto-focuses the first focusable element on activation (or `initialFocus` if
// supplied) and restores focus to the previously active element when
// deactivated. Listener lives on `document` so focus that escapes the trap
// (DevTools, third-party widgets) can be snapped back in.
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  initialFocus?: RefObject<HTMLElement | null>,
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;
    const node: T = container;

    triggerRef.current = (document.activeElement as HTMLElement) ?? null;

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(focusableSelector));

    // Caller-supplied override wins; otherwise the first focusable. Used by
    // destructive ConfirmDialog to land focus on Cancel rather than the
    // destructive primary.
    const preferred = initialFocus?.current ?? null;
    (preferred ?? focusables()[0])?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = current ? node.contains(current) : false;
      if (!inside) {
        // Focus escaped (e.g., DevTools, third-party widget). Snap it back
        // in - shift-tab lands on the last focusable, plain tab on the first.
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      const trigger = triggerRef.current;
      // Trigger may have been removed from the DOM during the dialog's
      // lifetime (e.g., conditional rendering elsewhere). Guard so we
      // don't focus an orphan; focus drops to <body> as a last resort.
      if (
        trigger &&
        typeof trigger.focus === "function" &&
        document.contains(trigger)
      ) {
        trigger.focus();
      }
    };
  }, [active, initialFocus]);

  return containerRef;
}
