"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

// Pairs useState with a ref mirror so callbacks read the latest value without
// resubscribing. Required for keydown handlers that fire faster than React
// re-renders: without the mirror, fast keystrokes walk against stale closures.
export function useStateRef<T>(
  initial: T,
): [T, Dispatch<SetStateAction<T>>, MutableRefObject<T>] {
  const [state, setState] = useState<T>(initial);
  const ref = useRef<T>(initial);

  const setBoth = useCallback<Dispatch<SetStateAction<T>>>((value) => {
    setState((prev) => {
      const next =
        typeof value === "function" ? (value as (p: T) => T)(prev) : value;
      ref.current = next;
      return next;
    });
  }, []);

  return [state, setBoth, ref];
}
