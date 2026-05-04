"use client";

// SimilarityPanel (v3, #37 power analysis - similarity highlighting).
//
// Lazily computes string-based similarity (TF-IDF + cosine) when the user
// clicks "Show similar traces". The first click for a given file builds an
// index over every trace; subsequent clicks reuse the cached index from
// src/lib/similarity.ts. Lazy because computing the index for a few thousand
// traces takes a noticeable beat - we don't want every file load to pay it.
//
// Lives in the right decision panel, gated by experienced mode AND the
// trace set being large enough to bother (>1 trace).

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
    // Defer to next tick so the "Computing..." state actually paints before
    // we block on TF-IDF. For small files this is invisible; for thousands
    // of traces it gives the user feedback that something is happening.
    setTimeout(() => {
      if (requestRef.current !== myReq) return; // user moved on; abandon
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
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Similarity
      </h3>
      {state.kind === "idle" || state.kind === "computing" ? (
        <button
          type="button"
          onClick={compute}
          disabled={state.kind === "computing"}
          className="w-full px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {state.kind === "computing" ? "Computing..." : "Show similar traces"}
        </button>
      ) : state.kind === "error" ? (
        <div className="space-y-2">
          <p
            role="alert"
            className="text-xs text-red-700 rounded border border-red-200 bg-red-50 px-2 py-1.5"
          >
            {state.message}
          </p>
          <button
            type="button"
            onClick={compute}
            className="w-full px-3 py-1.5 text-xs font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Try again
          </button>
        </div>
      ) : state.results.length === 0 ? (
        <p className="text-xs text-gray-500">
          No similar traces found. Either the current trace is unique or the
          others share too little vocabulary with it.
        </p>
      ) : (
        <ul className="space-y-1">
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

// One row in the similar-traces list. Shows the trace ID, a short preview of
// the user message (so the reviewer can tell what's similar before clicking),
// and the similarity score. Falls back to ID-only if the trace can't be found
// in the current set (e.g. a stale cache entry).
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
    <button
      type="button"
      onClick={onJump}
      className="w-full flex flex-col gap-0.5 px-2 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-gray-800 truncate">
          {result.traceId}
        </span>
        <span className="text-gray-500 tabular-nums shrink-0">
          {result.score.toFixed(2)}
        </span>
      </div>
      {preview && (
        <div className="text-gray-500 truncate text-[11px]">{preview}</div>
      )}
    </button>
  );
}

function firstUserMessagePreview(trace: Trace): string {
  for (const m of trace.input) {
    if (m.role === "user" && m.content.trim()) {
      return m.content.trim().slice(0, 60);
    }
  }
  // Fall back to first non-empty input message of any role
  for (const m of trace.input) {
    if (m.content.trim()) return m.content.trim().slice(0, 60);
  }
  return "";
}
