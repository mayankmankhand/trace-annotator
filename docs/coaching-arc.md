# Coaching teaching arc (v2.0)

## Goal

A new PM, cold to LLM evals, should know the following by **trace 3**:

1. What "Pass" and "Fail" mean in this tool, and the rule for when to use each
2. What a tag is for, and how it differs from a note
3. That every label is reversible

By **trace 5**, they should also understand:

4. Why open coding (no fixed taxonomy upfront) is the method, not a limitation
5. That the goal of the first 20-30 traces is to discover the taxonomy, not apply one

This document is the spec for the cards. Step 6 implements it.

## Why the arc exists

In v1, the coaching cards were written reactively: "what would be useful to say next to a new user?" That produced a sensible-but-incoherent set of 5 cards. We're replacing them with cards that target an explicit teaching goal so we can measure whether the arc actually works.

## The 5 cards

### Card 1 (shown on trace 1) - Welcome and the basic loop

**Teaches:** what this tool does, and the keyboard-first loop (P, F, arrows, Enter).

**Body:**
> You're doing **open coding** - reviewing LLM outputs without a fixed checklist, noticing patterns as you go.
>
> The basic loop: read the trace, decide if it passes or fails, hit **P** or **F**, then **Enter** for the next one. That's it.
>
> Pass means the output is acceptable for its intended use. Fail means it's wrong, harmful, off-task, or low-quality enough that you'd want to fix it before showing a user.

**Success measure:** the user gives a verdict on trace 1 within 30 seconds of seeing the card.

### Card 2 (shown on trace 2) - Tags vs notes

**Teaches:** the difference, and when to use each.

**Body:**
> When a fail has a specific shape - "wrong date", "too verbose", "ignored the question", "made stuff up" - **add a tag**.
>
> Tags are how patterns become visible. After 20 traces, your tag list IS your failure-mode taxonomy.
>
> A **note** is for things specific to one trace ("user's question was ambiguous"). A note doesn't show up in your final analysis. A tag does. **When in doubt, tag.**

**Success measure:** the user adds at least one tag to a failed trace by trace 3.

### Card 3 (shown on trace 3) - Reversibility and the cold-start feeling

**Teaches:** changing your mind is normal and free. The first few traces feel uncertain on purpose.

**Body:**
> Don't agonize on early traces. **Every label is reversible** - hit the left arrow any time to go back and change a verdict or tag. Nothing is final until you export.
>
> The first 5 traces will feel uncertain. That's how it's supposed to feel. Real patterns appear around trace 20-30.

**Success measure:** by trace 3, the user knows they can navigate back. (Test this in the wizard mock: ask "what do you do if you change your mind on trace 1?" - they should mention going back, not "live with it.")

### Card 4 (shown on trace 4) - Why no taxonomy upfront

**Teaches:** open coding is the deliberate method. We don't hand you 12 categories because we don't know which ones matter for *your* app yet.

**Body:**
> If you're wondering "where's the dropdown of failure types?" - it's missing on purpose.
>
> Other tools force you to pick from a fixed list. That biases what you notice. We let you write your own tags so the categories that emerge are real, not borrowed.
>
> You're not behind by not having a list. You're ahead - you'll have a list that fits your app, written from the data.

**Success measure:** by trace 4, the user has typed at least one tag of their own (not just "wrong" - something specific like "missed-follow-up-question").

### Card 5 (shown on trace 5) - The 20-30 trace milestone

**Teaches:** what to expect and why to keep going.

**Body:**
> Around trace 20-30, your tag list starts to repeat. That's the moment your **failure-mode taxonomy** appears.
>
> Until then, it's normal to feel like you're flailing. Trust the method.
>
> When you hit trace 25 we'll show you another tip - a quick exercise to consolidate what you've found.

**Success measure:** the user keeps going past trace 5 (session continues for 10+ more traces).

## Universals across templates

The 5 cards above are shared across all template choices (Chatbot, RAG, Summarizer, Generic). The only thing that differs by template is the **example failure-mode tags** that get pre-suggested (not pre-applied) in the tag panel.

### Template -> seeded example tags

These show up as ghost-text suggestions in the tag input, NOT as pre-applied tags. They're examples to point the user at common failure modes for their app type.

| Template | Seeded example tags |
|---|---|
| **Chatbot** | `wrong-answer`, `ignored-context`, `unsafe-content`, `too-verbose`, `refused-incorrectly` |
| **RAG** | `not-grounded`, `cherry-picked-context`, `missing-citation`, `hallucinated-source`, `confused-by-irrelevant-chunk` |
| **Summarizer** | `omitted-key-fact`, `wrong-tone`, `too-long`, `paraphrased-incorrectly`, `lost-numbers-or-names` |
| **Generic** | `factually-wrong`, `off-task`, `unclear`, `unsafe`, `low-quality` |

These are **examples**, not a forced taxonomy. The teaching arc says "write your own tags" - the seeds are scaffolding, not a checklist. UI must make this clear (e.g., grayed-out chips with "Examples - click to use, or type your own").

## Milestone cards (beyond trace 5)

Shown once each, when the user hits these traces:

- **Trace 25:** "Your tag list is your taxonomy" - prompts the user to look at their tag panel and pick the 3-5 tags that are showing up most. Suggests they treat those as their first-pass taxonomy and go back to revise older traces.
- **Trace 50:** "You're past the discovery phase" - one-line acknowledgment that they've crossed the threshold of doing real eval work, and a soft pointer to consider exporting and analyzing.
- **Trace 100:** "Time to step back" - suggests exporting and looking at tag frequency before continuing.

These are NOT taught here as polished copy - Step 6 implements them with copy iteration.

## Self-walkthrough validation

I walked through traces 1-5 cold using `synthetic-chat-with-tools.json` (a chatbot fixture) and confirmed the following:

| Goal | Met? | Notes |
|---|---|---|
| Knows Pass / Fail by trace 3 | ✓ | Card 1 covers this on trace 1, reinforced by use |
| Knows what a tag is by trace 3 | ✓ | Card 2 on trace 2 |
| Knows labels are reversible by trace 3 | ✓ | Card 3 on trace 3 |
| Knows why no fixed taxonomy by trace 5 | ✓ | Card 4 on trace 4 |
| Trusts the 20-30 trace pattern by trace 5 | ✓ | Card 5 on trace 5 |

Risks identified during walkthrough:

- The wizard's template prompt MUST happen before the first card lands, or the seeded tags don't show. Step 5 owns this dependency.
- Card 4 ("no taxonomy upfront") could feel preachy. Implementation should land it after the user has felt the absence (trace 4, not earlier).
- Milestone cards at trace 25/50/100 risk feeling spammy if they pop while the user is in flow. Step 6 should make them dismissible and never blocking.

## What this spec does NOT decide

- Visual design of the cards beyond the existing blue card style. Step 13 (visual polish) handles that.
- Animation or transition behavior. Defer to implementation.
- A11y behavior for the dismiss controls. Reuse existing CoachingTip a11y patterns.
- Whether milestone cards should be persistent across sessions or one-time-per-file. Implementation decides; default is one-time-per-fingerprint.
