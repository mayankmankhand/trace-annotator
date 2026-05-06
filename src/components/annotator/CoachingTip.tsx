"use client";

import { loadCoachingEnabled, type Hotkeys } from "@/lib/storage";

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
    body: "Take a quick look at your tag list. Which 3-5 tags repeat the most? Those are your first-pass taxonomy. Consider going back to revise older traces with these.",
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

// Coaching is active when the global setting is on AND the user has not
// dismissed it for this session or permanently. The setting is independent
// of the experienced-mode toggle so a power user can keep tips on, and a
// beginner who doesn't want them can hide them. Default-on for first-run.
export function isCoachingActive(): boolean {
  if (typeof window === "undefined") return false;
  if (!loadCoachingEnabled()) return false;
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

// Coaching tip card. Lives inside the decision rail so it never blocks the
// trace pane. Uses the warm-yellow `coach-card` tokens from the Quiet
// Notebook design system (see src/app/styles/quiet-notebook.css).
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
  const stepLabel = `tip ${traceIndex + 1} of ${TIPS_COUNT}`;

  return (
    <div role="note" aria-label={`Coaching tip: ${title}`} className="coach-card">
      <div className="coach-card__title">{stepLabel}</div>
      <div className="coach-card__heading">{title}</div>
      <div className="coach-card__body">{body}</div>
      <div className="coach-card__actions">
        <button
          type="button"
          onClick={onSessionDismiss}
          className="coach-card__dismiss"
          aria-label="Dismiss coaching tips for this session"
        >
          dismiss for now
        </button>
        <button
          type="button"
          onClick={onPermanentDismiss}
          className="coach-card__dismiss"
          aria-label="Don't show coaching tips again"
        >
          don&apos;t show again
        </button>
      </div>
    </div>
  );
}

// Milestone card UI. Lightweight version of CoachingTip with the same
// warm-yellow palette but stat blocks instead of step counter.
export function MilestoneTip({
  card,
  stats,
  onDismiss,
}: {
  card: MilestoneCard;
  stats?: {
    uniqueTags: number;
    usedOnce: number;
    nearDuplicates: number;
  };
  onDismiss: () => void;
}) {
  return (
    <div
      role="note"
      aria-label={`Coaching milestone: ${card.title}`}
      className="milestone-card"
    >
      <div className="coach-card__title">milestone</div>
      <div className="coach-card__heading">{card.title}</div>
      {stats && (
        <div className="milestone-card__stats">
          <div>
            <div className="milestone-card__num">{stats.uniqueTags}</div>
            <div className="milestone-card__lbl">unique tags</div>
          </div>
          <div>
            <div className="milestone-card__num">{stats.usedOnce}</div>
            <div className="milestone-card__lbl">used once</div>
          </div>
          <div>
            <div className="milestone-card__num">{stats.nearDuplicates}</div>
            <div className="milestone-card__lbl">near dupes</div>
          </div>
        </div>
      )}
      <div className="coach-card__body">{card.body}</div>
      <div className="coach-card__actions">
        <button
          type="button"
          onClick={onDismiss}
          className="coach-card__dismiss"
          aria-label="Dismiss milestone tip"
        >
          got it
        </button>
      </div>
    </div>
  );
}

// Compact "still here" indicator rendered between Card 5 (last initial tip)
// and the trace-25 milestone. Without it, coaching goes silent for ~20
// traces, which works against the "tool teaches as you label" wedge.
// Visible on traces 6-15 (1-indexed), session-dismissible. Self-gates on
// file size and trace position; the parent gates on coachingActive.
export function TipsProgressChip({
  traceIndex,
  total,
  coachingActive,
  onDismiss,
}: {
  traceIndex: number;
  total: number;
  coachingActive: boolean;
  onDismiss: () => void;
}) {
  if (!coachingActive) return null;
  if (traceIndex < TIPS_COUNT) return null;
  if (traceIndex >= 15) return null;
  if (total < TIPS_COUNT) return null;
  return (
    <span role="status" className="ta-chip lv-tips-chip">
      <span className="lv-tips-chip__label">coaching</span>
      <span className="lv-tips-chip__sub">keep going</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss coaching progress chip"
        className="lv-tips-chip__x"
      >
        &times;
      </button>
    </span>
  );
}

// Compute milestone-card stats from the user's current annotations. Surfaces
// the three numbers the design handoff spec calls out (unique, used-once,
// near-duplicates). Called from TraceView when a milestone is shown.
//
// "near-duplicates" here is a cheap edit-distance pass over the lowercased
// tag list - tags that share a 3-letter prefix and differ by <=2 characters
// count as one near-duplicate pair. Good enough to flag the typical
// "wrong-date" / "wrong-dates" / "wrong_date" trio without pulling in a
// real similarity library.
export function computeTaxonomyStats(
  allTags: string[],
  perTagCounts: Map<string, number>,
): { uniqueTags: number; usedOnce: number; nearDuplicates: number } {
  const uniqueTags = allTags.length;
  let usedOnce = 0;
  for (const t of allTags) {
    if ((perTagCounts.get(t) ?? 0) === 1) usedOnce++;
  }
  let nearDuplicates = 0;
  const lowered = allTags.map((t) => t.toLowerCase());
  for (let i = 0; i < lowered.length; i++) {
    for (let j = i + 1; j < lowered.length; j++) {
      const a = lowered[i];
      const b = lowered[j];
      if (a.slice(0, 3) !== b.slice(0, 3)) continue;
      if (Math.abs(a.length - b.length) > 2) continue;
      let edits = 0;
      const max = Math.max(a.length, b.length);
      for (let k = 0; k < max; k++) {
        if (a[k] !== b[k]) edits++;
        if (edits > 2) break;
      }
      if (edits <= 2) nearDuplicates++;
    }
  }
  return { uniqueTags, usedOnce, nearDuplicates };
}
