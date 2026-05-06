"use client";

// SimilarityPanel (v3, #37 power analysis - similarity highlighting).
//
// Lazily computes string-based similarity (TF-IDF + cosine) when the user
// clicks "show similar traces". The first click for a given file builds an
// index over every trace; subsequent clicks reuse the cached index from
// src/lib/similarity.ts. Lazy because computing the index for a few thousand
// traces takes a noticeable beat - we don't want every file load to pay it.
//
// Lives in the right decision rail, gated by experienced mode AND the
// trace set being large enough to bother (>1 trace).
//
// Restyled for issue #53 to use Quiet Notebook tokens.

import { useEffect, useRef, useState } from "react";
import { findSimilar } from "@/lib/similarity";
import type { Trace } from "@/lib/trace/types";

type Result = { traceId: string; score: number };

type State =
  | { kind: "idle" }
  | { kind: "computing" }
  | { kind: "results"; results: Result[] }
  | { kind: "error"; message: string };

type Props = {
  traces: Trace[];
  currentTraceId: string;
  fingerprint: string;
  onJumpToTrace: (traceId: string) => void;
};

export function SimilarityPanel({
  traces,
  currentTraceId,
  fingerprint,
  onJumpToTrace,
}: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  // Request-id pattern: every compute increments this; the deferred work
  // checks against it before applying results, so a stale compute (from a
  // previous trace) cannot overwrite the new trace's panel.
  const requestRef = useRef(0);

  // Reset when navigating to a different trace; old "similar to A" results
  // are not relevant now that the user is on B. Bumping requestRef also
  // invalidates any in-flight setTimeout that might still fire.
  useEffect(() => {
    requestRef.current++;
    setState({ kind: "idle" });
  }, [currentTraceId]);

  function compute() {
    const myReq = ++requestRef.current;
    setState({ kind: "computing" });
    // Defer to next tick so the "Computing..." state actually paints
    // before we block on TF-IDF. For small files this is invisible; for
    // thousands of traces it gives feedback that something is happening.
    setTimeout(() => {
      if (requestRef.current !== myReq) return;
      try {
        const results = findSimilar(fingerprint, traces, currentTraceId, 5);
        if (requestRef.current !== myReq) return;
        setState({ kind: "results", results });
      } catch (err) {
        if (requestRef.current !== myReq) return;
        setState({
          kind: "error",
          message:
            err instanceof Error
              ? err.message
              : "Could not compute similarity. Try again or move to a different trace.",
        });
      }
    }, 0);
  }

  return (
    <div className="lv-similar">
      <div className="lv-rail__label">similarity</div>
      {state.kind === "idle" || state.kind === "computing" ? (
        <button
          type="button"
          onClick={compute}
          disabled={state.kind === "computing"}
          className="lv-nav lv-similar__cta"
        >
          {state.kind === "computing" ? "computing..." : "show similar traces"}
        </button>
      ) : state.kind === "error" ? (
        <div className="lv-similar__errorWrap">
          <p role="alert" className="lv-similar__error">
            {state.message}
          </p>
          <button
            type="button"
            onClick={compute}
            className="lv-nav lv-similar__cta"
          >
            try again
          </button>
        </div>
      ) : state.results.length === 0 ? (
        <p className="lv-similar__empty">
          No similar traces found. Either the current trace is unique or the
          others share too little vocabulary with it.
        </p>
      ) : (
        <ul className="lv-similar__list">
          {state.results.map((r) => (
            <li key={r.traceId}>
              <SimilarItem
                result={r}
                trace={traces.find((t) => t.id === r.traceId)}
                onJump={() => onJumpToTrace(r.traceId)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SimilarItem({
  result,
  trace,
  onJump,
}: {
  result: Result;
  trace: Trace | undefined;
  onJump: () => void;
}) {
  const preview = trace ? firstUserMessagePreview(trace) : "";
  return (
    <button type="button" onClick={onJump} className="lv-similar__row">
      <span
        className="lv-similar-row__bar"
        aria-hidden="true"
        title={`Similarity score: ${result.score.toFixed(2)}`}
      >
        <span style={{ width: `${Math.min(100, result.score * 100)}%` }} />
      </span>
      <span className="lv-similar-row__title">
        {preview || result.traceId}
      </span>
      <span className="lv-similar-row__id">{result.traceId}</span>
    </button>
  );
}

function firstUserMessagePreview(trace: Trace): string {
  for (const m of trace.input) {
    if (m.role === "user" && m.content.trim()) {
      return m.content.trim().slice(0, 60);
    }
  }
  for (const m of trace.input) {
    if (m.content.trim()) return m.content.trim().slice(0, 60);
  }
  return "";
}
