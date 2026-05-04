"use client";

// ToolCallReviewPanel (v3, #37 power analysis - tool-call correctness review).
//
// Lists every tool call extracted from the current trace and lets the
// reviewer mark each as "right call", "wrong call", or "skip". The roll-up
// is informational only: the trace's overall verdict is independent (a
// reviewer can mark every tool call right and still set the trace to fail
// for other reasons, or vice versa). This was the explicit design decision
// from /explore Phase 2 - hard rollup would create contradictory states.
//
// Lives in the right decision panel, gated by experienced mode AND the
// trace having at least one tool call. Hidden gracefully otherwise so
// novice mode and tool-call-free traces look identical to v2.1.

import type {
  ToolCall,
  ToolCallReviews,
  ToolCallVerdict,
} from "@/lib/trace/tool-calls";

type Props = {
  toolCalls: ToolCall[];
  reviews: ToolCallReviews | undefined;
  onReview: (index: number, verdict: ToolCallVerdict | null) => void;
};

const VERDICT_LABEL: Record<ToolCallVerdict, string> = {
  right: "Right",
  wrong: "Wrong",
  skip: "Skip",
};

export function ToolCallReviewPanel({ toolCalls, reviews, onReview }: Props) {
  if (toolCalls.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
        Tool calls ({toolCalls.length})
      </h3>
      <ul className="space-y-2">
        {toolCalls.map((tc) => {
          const verdict = reviews?.[tc.index] ?? null;
          return (
            <li
              key={tc.index}
              className="rounded border border-violet-200 bg-violet-50 px-2 py-2"
            >
              <div className="text-[11px] font-mono font-semibold text-violet-900 truncate">
                {tc.name}()
              </div>
              <ToolCallArgsPreview args={tc.args} />
              {/*
                radiogroup is the right semantic - exactly one (or none) of
                the three buttons is active. aria-live polite announces the
                state change to screen readers without interrupting.
                Padding bumped to px-2 py-1 for hit-target friendliness; the
                whole panel can grow vertically.
              */}
              <div
                className="mt-2 flex gap-1"
                role="radiogroup"
                aria-label={`Verdict for ${tc.name}`}
              >
                {(Object.keys(VERDICT_LABEL) as ToolCallVerdict[]).map((v) => {
                  const active = verdict === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      onClick={() => onReview(tc.index, active ? null : v)}
                      aria-checked={active}
                      className={`flex-1 px-2 py-1 text-[11px] font-medium rounded border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                        active
                          ? v === "right"
                            ? "bg-green-600 border-green-600 text-white"
                            : v === "wrong"
                              ? "bg-red-600 border-red-600 text-white"
                              : // "skip" deliberately uses gray (not amber)
                                // so it doesn't visually collide with the
                                // trace-level skip pill, which already owns
                                // amber. Reads as "not yet decided" rather
                                // than "marked for later review."
                                "bg-gray-500 border-gray-500 text-white"
                          : "bg-white border-violet-200 text-violet-800 hover:bg-violet-100"
                      }`}
                    >
                      {VERDICT_LABEL[v]}
                    </button>
                  );
                })}
              </div>
              <span
                aria-live="polite"
                aria-atomic="true"
                className="sr-only"
              >
                {verdict
                  ? `Marked ${VERDICT_LABEL[verdict]} for ${tc.name}`
                  : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Renders a one-line args summary in the panel. Full args are visible in the
// rendered tool-call card in the main trace area, so we only need a hint
// here. Keeps the panel compact even on traces with many tool calls.
function ToolCallArgsPreview({ args }: { args: unknown }) {
  let summary: string;
  try {
    const json = JSON.stringify(args);
    summary = json.length > 80 ? json.slice(0, 77) + "..." : json;
  } catch {
    summary = "(unserializable args)";
  }
  return (
    <div className="text-[10px] font-mono text-gray-600 truncate">
      {summary}
    </div>
  );
}
