# Project Instructions for Claude

<!-- This file is YOURS. Add your project-specific info below. -->
<!-- Toolkit rules live in .claude/rules/toolkit.md (managed by the toolkit, auto-discovered by Claude). -->
<!-- See README.md > "How It Works" for details on how these files connect. -->

## About This Project

**Trace Annotator** is an opinionated, open-source local web app that helps new product managers do open coding and error analysis on LLM traces. The wedge: it is the labeling tool that teaches the method as you use it.

**What it does:** Loads a JSONL (or JSON) file of LLM traces, renders each trace natively (chat bubble, email, etc.), and lets the reviewer pass/fail and tag failure modes using only the keyboard. Labels are written back as JSONL.

**Who it's for:** New PMs starting evals. Not experienced practitioners.

**Tech stack:** Next.js with React, App Router, TypeScript, and Tailwind (the conventional Next.js stack; not separately debated). JSONL file storage by default. SQLite is a v1.5 opt-in.

**Distribution model:** Guided wizard for v1 (no code editing required). The original "adapter pattern, not fork-and-customize" framing has been narrowed: a wizard maps the user's file fields to the internal trace shape; an `adapter.ts` escape hatch is deferred to v1.5 (issue #16). Users clone the repo and pull updates freely; the repo stays pristine.

**Public repo, BYO data.** No real trace data is ever committed. Synthetic fixtures only. Real data paths are gitignored by default.

### v1 scope (in)
1. Bootstrap Next.js skeleton
2. Trace input loader with guided wizard (JSONL / JSON / CSV auto-detect; adapter.ts deferred to v1.5 per issue #16)
3. Native rendering for chat / email / generic outputs (with JSON-on-demand)
4. Single-trace view with progressive disclosure
5. Pass/fail labeling and keyboard hot keys
6. Failure mode tags (free text + dropdown of previously used)
7. Status indicator and persistent progress bar
8. Reversibility (back/forward + edit prior labels)
9. JSONL label storage and export
10. UI/UX research and design pass
11. Synthetic fixture data (user-provided)
12. Onboarding / first-run inline coaching

### v2 scope (deferred, do not re-litigate)
- Similarity highlighting (req 10 in original `text` doc)
- Side-effect verification (req 9)
- Batch labeling (req 11)
- SQLite storage option

### Explicitly rejected
- Requirement 5.4 ("no hard and fast rules"). For a beginner-targeted tool, hard and fast rules are a feature, not a limitation. We pick defaults and ship them.

## Who I Am

I'm a PM who is new to LLM evals, open coding, and error analysis. I'm building this tool as a way to learn the method while shipping something useful. I lean on Claude for explanations and opinions, not just code execution.

- Explain things simply. Use plain English, avoid jargon when you can.
- Teach the *why* so I can solve similar problems independently next time.
- I'm learning, flag things I might not know rather than assuming.

## My Preferences

- **Toolkit rules:** See [.claude/rules/toolkit.md](.claude/rules/toolkit.md) for the full collaboration rules, slash command list, and git workflow. Those are the canonical rules; this file adds project-specific overlays.
- **No em dashes or en dashes.** Anywhere. Use regular hyphens or rewrite the sentence.
- **Report first, fix later.** Never auto-fix issues you find during review. Wait for explicit approval before editing.
- **Ask if unsure.** I would rather answer a clarifying question than have you guess.
- **Beginner-friendly framing.** When you explain something, prefer concrete examples over abstract definitions.

## Design Principles

These come from established HCI practice and underpin every v1 feature. Preserve them when reviewing PRs and planning v2 work.

1. **Visibility of status.** The reviewer always knows where they are and how much remains. Never hide the progress bar or counter.
2. **Recognition over recall.** Surface known failure modes through tags and dropdowns. Never force the reviewer to remember them.
3. **Native rendering.** Show outputs in the form the end user sees. JSON only on demand.
4. **User control.** Keyboard-driven, minimal context switching, reversible decisions.
5. **Minimalism with progressive disclosure.** Hide nonessential detail by default. Allow drill-down.

### Anti-patterns to actively reject
- Reviewing long, multi-turn traces in raw spreadsheet rows
- Generating UI from "give me a labeling UI" prompts without HCI grounding
- Preventing reviewers from going back to revise prior labels
- Showing every field by default
- Forcing reviewers to keep multiple windows open and switch between them
- Skipping the progress bar

### Expected outcomes (the bar we measure against)
- Throughput: ~200 traces/hour (vs ~20 in raw spreadsheets)
- Accuracy: reviewers stay focused, can revise prior decisions
- Consistency: shared taxonomies reduce reviewer drift
- Motivation: visible progress materially increases session length

## Skills

Review capabilities live in `.claude/skills/` as SKILL.md files. They auto-create slash commands and are discoverable by subagents. Shared reference files in `.claude/skills/shared/`. Use `/review` for unified auto-detected review or individual `/review-code`, `/review-ux`, etc. for focused reviews.
