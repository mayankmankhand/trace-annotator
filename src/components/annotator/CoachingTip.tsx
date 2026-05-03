"use client";

import type { Hotkeys } from "@/lib/storage";

// Cards 1-5 mirror docs/coaching-arc.md (Step 4 spec). Bodies that reference
// hotkeys are interpolated at render time so the coaching stays in lockstep
// with whatever bindings the user has configured. Card 5's trace-25 promise
// is dropped on files smaller than 25 traces so we don't make a promise we
// won't keep. Don't edit the static text here without updating the spec doc.
const TIP_TITLES = [
  "Welcome - you're doing open coding",
  "Tags vs notes",
  "Every label is reversible",
  "Why no taxonomy upfront",
  "Around trace 20-30 your taxonomy appears",
] as const;

const TIPS_COUNT = TIP_TITLES.length;

// Render a hotkey in plain English suitable for prose. Letter keys are
// upper-cased; named keys (Enter, arrows) get a friendly form.
function formatHotkeyForCopy(key: string): string {
  if (key === "Enter") return "Enter";
  if (key === "ArrowLeft") return "the left arrow";
  if (key === "ArrowRight") return "the right arrow";
  if (key === "ArrowUp") return "the up arrow";
  if (key === "ArrowDown") return "the down arrow";
  return key.toUpperCase();
}

function buildTipBody(
  index: number,
  hotkeys: Hotkeys,
  total: number,
): string {
  const passLabel = hotkeys.pass.toUpperCase();
  const failLabel = hotkeys.fail.toUpperCase();
  const nextLabel = formatHotkeyForCopy(hotkeys.next);
  switch (index) {
    case 0:
      return `You're reviewing LLM outputs without a fixed checklist, noticing patterns as you go. The basic loop: read, decide pass or fail, hit ${passLabel} or ${failLabel}, then ${nextLabel} for the next. Pass means the output is good enough to ship. Fail means it's wrong, harmful, off-task, or low-quality.`;
    case 1:
      return "When a fail has a specific shape - 'wrong-date', 'too-verbose', 'made-stuff-up' - add a tag. Tags are how patterns become visible. After 20 traces, your tag list IS your failure-mode taxonomy. A note is for things specific to one trace and won't show up in your final analysis. When in doubt, tag.";
    case 2:
      return "Don't agonize on early traces. Hit the left arrow any time to go back and change a verdict or tag. Nothing is final until you export. The first 5 traces feel uncertain on purpose - real patterns appear around trace 20-30.";
    case 3:
      return "Wondering where the dropdown of failure types is? It's missing on purpose. Other tools force you to pick from a fixed list, which biases what you notice. We let you write your own tags so the categories that emerge are real, not borrowed. You'll have a list that fits your app.";
    case 4: {
      // Only promise the trace-25 milestone when the file is large enough
      // to actually reach it. Otherwise the promise is broken silently.
      const tail =
        total >= 25
          ? " We'll show another tip at trace 25 to help consolidate."
          : "";
      return `Right now your tags feel scattered. That's normal. Around trace 20-30, the list starts to repeat - that's the moment your failure-mode taxonomy emerges. Trust the method.${tail}`;
    }
    default:
      return "";
  }
}

// Milestone cards beyond trace 5. Shown once per fingerprint (not session)
// so the user gets them on the file they're labeling, even if they take
// breaks between sessions.
type MilestoneCard = {
  atIndex: number; // 0-indexed trace number
  title: string;
  body: string;
};

const MILESTONES: MilestoneCard[] = [
  {
    atIndex: 24, // trace 25 in user-facing 1-indexed copy
    title: "Trace 25 - your taxonomy is forming",
    body: "Take a quick look at your tag list (in the right panel and the bottom strip). Which 3-5 tags repeat the most? Those are your first-pass taxonomy. Consider going back to revise older traces with these.",
  },
  {
    atIndex: 49,
    title: "Trace 50 - past discovery",
    body: "You've crossed the threshold of doing real eval work. The next 50 traces are about confirming the patterns, not finding them. Consider exporting your labels and looking at tag frequency before continuing.",
  },
  {
    atIndex: 99,
    title: "Trace 100 - time to step back",
    body: "Export your labels. Look at the most common tags. Decide which failure modes matter for the work that comes next. Labeling more without analysis at this point has diminishing returns.",
  },
];

// Key version bumped from v1 to force-reset stale "permanently dismissed" flags
// from earlier dev sessions. v1 users reported coaching never appearing - root
// cause was a stuck localStorage flag they did not remember setting.
const LS_KEY = "ta:coaching:done:v2";
const SS_KEY = "ta:coaching:session-dismissed:v2";
// Per-fingerprint flags for milestone cards so the same milestone doesn't
// re-fire on every file load.
const MILESTONE_KEY_PREFIX = "ta:coaching:milestone:";
// Session-level dismissal of the "X tips done" footer chip shown on
// traces 6-15 (see TipsProgressChip).
const TIPS_CHIP_SS_KEY = "ta:coaching:tips-chip-dismissed:v1";

function milestoneKey(fingerprint: string, atIndex: number): string {
  return `${MILESTONE_KEY_PREFIX}${fingerprint}:${atIndex}`;
}

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
  // Tips-chip dismissal is also cleared so a "show tips again" click brings
  // the full coaching surface back. Milestone flags stay - those are
  // per-file and shouldn't re-pop.
  sessionStorage.removeItem(TIPS_CHIP_SS_KEY);
}

export function isTipsChipDismissed(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(TIPS_CHIP_SS_KEY) === "true";
}

export function dismissTipsChipSession() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(TIPS_CHIP_SS_KEY, "true");
}

export function getMilestoneForIndex(
  fingerprint: string,
  index: number,
): MilestoneCard | null {
  if (typeof window === "undefined") return null;
  const m = MILESTONES.find((m) => m.atIndex === index);
  if (!m) return null;
  if (localStorage.getItem(milestoneKey(fingerprint, m.atIndex)) === "shown") {
    return null;
  }
  return m;
}

export function dismissMilestone(fingerprint: string, atIndex: number): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(milestoneKey(fingerprint, atIndex), "shown");
  } catch {
    // No-op - milestone shown once is a UX nicety, not data.
  }
}

type Props = {
  traceIndex: number;
  total: number;
  hotkeys: Hotkeys;
  onSessionDismiss: () => void;
  onPermanentDismiss: () => void;
};

export function CoachingTip({
  traceIndex,
  total,
  hotkeys,
  onSessionDismiss,
  onPermanentDismiss,
}: Props) {
  if (traceIndex >= TIPS_COUNT) return null;
  const title = TIP_TITLES[traceIndex];
  const body = buildTipBody(traceIndex, hotkeys, total);
  const stepLabel = `Tip ${traceIndex + 1} of ${TIPS_COUNT}`;

  return (
    <div
      role="note"
      aria-label={`Coaching tip: ${title}`}
      className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-blue-900">{title}</p>
          <p className="text-blue-800 mt-0.5 leading-relaxed">{body}</p>
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

// Milestone card UI. Lightweight version of CoachingTip - no "step N of M"
// counter (these are one-off), just title, body, and a single dismiss.
export function MilestoneTip({
  card,
  onDismiss,
}: {
  card: MilestoneCard;
  onDismiss: () => void;
}) {
  return (
    <div
      role="note"
      aria-label={`Coaching milestone: ${card.title}`}
      className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-blue-900">{card.title}</p>
          <p className="text-blue-800 mt-0.5 leading-relaxed">{card.body}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss milestone tip"
          className="flex-shrink-0 text-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded text-lg leading-none mt-0.5"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// Small "X tips done - keep going" footer chip rendered between Card 5
// (last initial tip) and the trace-25 milestone. Without it, the coaching
// goes silent for ~20 traces, which works against the "tool teaches as you
// label" wedge. Visible on traces 6-15 (1-indexed), session-dismissible,
// and only shown when the file is large enough that the user has actually
// finished all 5 cards (TIPS_COUNT) before reaching this range.
export function TipsProgressChip({
  traceIndex,
  total,
  onDismiss,
}: {
  traceIndex: number;
  total: number;
  onDismiss: () => void;
}) {
  if (traceIndex < TIPS_COUNT) return null;
  if (traceIndex >= 15) return null;
  if (total < TIPS_COUNT) return null;
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs text-blue-700"
    >
      <span className="font-medium">{TIPS_COUNT} tips done</span>
      <span className="text-blue-500">- keep going</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss tips progress chip"
        className="text-blue-400 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        &times;
      </button>
    </span>
  );
}
