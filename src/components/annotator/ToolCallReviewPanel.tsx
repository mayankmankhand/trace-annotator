"use client";

// ToolCallReviewPanel (v3, #37 power analysis - tool-call correctness review).
//
// Lists every tool call extracted from the current trace and lets the
// reviewer mark each as right/wrong/skip. The roll-up is informational
// only: the trace's overall verdict is independent. Hard rollup would
// create contradictory states; this was the explicit /explore Phase 2
// decision.
//
// Lives in the right decision rail, gated by experienced mode AND the
// trace having at least one tool call.
//
// Restyled for issue #53 to use Quiet Notebook tokens (matches the rest
// of the rail rather than v2's violet palette).

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
  right: "right",
  wrong: "wrong",
  skip: "skip",
};

export function ToolCallReviewPanel({ toolCalls, reviews, onReview }: Props) {
  if (toolCalls.length === 0) return null;

  return (
    <div className="lv-toolreview">
      <div className="lv-rail__label">
        tool calls
        <span className="lv-rail__labelMeta">{toolCalls.length}</span>
      </div>
      <ul className="lv-toolreview__list">
        {toolCalls.map((tc) => {
          const verdict = reviews?.[tc.index] ?? null;
          return (
            <li key={tc.index} className="lv-toolreview__item">
              <div className="lv-toolreview__name">{tc.name}()</div>
              <ToolCallArgsPreview args={tc.args} />
              <div
                className="lv-toolreview__verdicts"
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
                      data-verdict={v}
                      data-active={active ? "true" : undefined}
                      className="lv-toolreview__btn"
                    >
                      {VERDICT_LABEL[v]}
                    </button>
                  );
                })}
              </div>
              <span aria-live="polite" aria-atomic="true" className="sr-only">
                {verdict ? `Marked ${VERDICT_LABEL[verdict]} for ${tc.name}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ToolCallArgsPreview({ args }: { args: unknown }) {
  let summary: string;
  try {
    const json = JSON.stringify(args);
    summary = json.length > 80 ? json.slice(0, 77) + "..." : json;
  } catch {
    summary = "(unserializable args)";
  }
  return <div className="lv-toolreview__args">{summary}</div>;
}
