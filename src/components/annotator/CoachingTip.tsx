"use client";

const TIPS = [
  {
    title: "Welcome - you're doing open coding",
    body: "Open coding means reviewing outputs without fixed categories first. Your job is to notice patterns as you go. Press P to pass a trace, F to fail it. Use arrow keys or Enter to navigate.",
  },
  {
    title: "Tag failure modes as you spot them",
    body: "When a trace has a specific flaw - like 'wrong date', 'too verbose', or 'refused to answer' - add a tag. Tags you create become quick-apply buttons (keys 1-4) so you can reuse them in one keystroke.",
  },
  {
    title: "Tags vs. notes - a useful distinction",
    body: "Tags are for patterns you'll see across many traces. Notes are for trace-specific observations. A note won't show up in your failure mode analysis; a tag will. When in doubt, use a tag.",
  },
  {
    title: "Your labels are always reversible",
    body: "Changed your mind? Press the left arrow or click Prev to return to any trace and update its verdict or tags. Nothing is final until you export. That's how good analysis works.",
  },
  {
    title: "You'll see patterns emerge around trace 20-30",
    body: "The first few traces feel uncertain - that's normal. Keep going. Around trace 20-30, your tag list starts to repeat and real clusters appear. Those clusters are your failure mode taxonomy.",
  },
] as const;

const LS_KEY = "ta:coaching:done";
const SS_KEY = "ta:coaching:session-dismissed";

export function isCoachingActive(): boolean {
  if (typeof window === "undefined") return false;
  if (localStorage.getItem(LS_KEY) === "true") return false;
  if (sessionStorage.getItem(SS_KEY) === "true") return false;
  return true;
}

export function dismissCoachingSession() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(SS_KEY, "true");
}

export function dismissCoachingPermanent() {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, "true");
  sessionStorage.setItem(SS_KEY, "true");
}

export function resetCoaching() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
  sessionStorage.removeItem(SS_KEY);
}

type Props = {
  traceIndex: number;
  onSessionDismiss: () => void;
  onPermanentDismiss: () => void;
};

export function CoachingTip({ traceIndex, onSessionDismiss, onPermanentDismiss }: Props) {
  if (traceIndex >= TIPS.length) return null;
  const tip = TIPS[traceIndex];
  const stepLabel = `Tip ${traceIndex + 1} of ${TIPS.length}`;

  return (
    <div
      role="note"
      aria-label={`Coaching tip: ${tip.title}`}
      className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-blue-900">{tip.title}</p>
          <p className="text-blue-800 mt-0.5 leading-relaxed">{tip.body}</p>
        </div>
        <button
          type="button"
          onClick={onSessionDismiss}
          aria-label="Dismiss coaching tips for this session"
          className="flex-shrink-0 text-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded text-lg leading-none mt-0.5"
        >
          &times;
        </button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-blue-500">{stepLabel} - navigate forward to see the next tip</span>
        <button
          type="button"
          onClick={onPermanentDismiss}
          className="text-xs text-blue-500 hover:text-blue-800 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Don&apos;t show again
        </button>
      </div>
    </div>
  );
}
