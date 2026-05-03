"use client";

import { useEffect, useRef, type RefObject } from "react";

// Traps Tab/Shift+Tab focus inside the ref'd container while `active` is true.
// Auto-focuses the first focusable element on activation and restores focus to
// the previously active element when deactivated. Used by modal overlays so
// keyboard-only users cannot tab into the obscured background.
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
): RefObject<T | null> {
  const containerRef = useRef<T | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const container: T | null = containerRef.current;
    if (!container) return;
    // Re-bind under a non-null name so the inner `focusables()` closure
    // doesn't lose narrowing across function boundaries.
    const node: T = container;

    triggerRef.current = (document.activeElement as HTMLElement) ?? null;

    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(focusableSelector));

    focusables()[0]?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const current = document.activeElement as HTMLElement | null;
      const inside = current ? node.contains(current) : false;
      if (e.shiftKey && (!inside || current === first)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || current === last)) {
        e.preventDefault();
        first.focus();
      }
    }

    node.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("keydown", onKeyDown);
      const trigger = triggerRef.current;
      if (trigger && typeof trigger.focus === "function") trigger.focus();
    };
  }, [active]);

  return containerRef;
}
