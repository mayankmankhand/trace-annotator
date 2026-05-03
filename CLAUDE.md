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

### v1 scope (shipped)
1. Bootstrap Next.js skeleton
2. Trace input loader with guided wizard (JSONL / JSON / CSV auto-detect)
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

### v2.0 scope (shipped, see plans/PLAN-v2-launch.md)
- Wizard robustness (envelope unwrap, nested messages, manual mapping fallback, large-file warning)
- Save and persistence model (IndexedDB primary, manual JSONL/CSV export). See [docs/save-model.md](docs/save-model.md).
- Coaching teaching arc (5 first-run cards + milestone cards). See [docs/coaching-arc.md](docs/coaching-arc.md).
- Template-driven failure-mode tag seeding (Chatbot / RAG / Summarizer / Generic)
- Undo history with Cmd/Ctrl+Z + per-label audit log
- Trace context display (metadata strip, richer resume warning)
- Tag management (rename, merge, delete - flat tags only in v2.0)
- Trace navigation, filter, random sampling
- Skip control + hotkey remapping
- Visual polish (Inter font, logo, favicon)
- AGENT-SETUP.md for AI-assisted install

### v2.1 scope (shipped, see PR #50 against issue #49)

A post-launch review bundle. Full change list in [docs/ux-research-note.md](docs/ux-research-note.md) §8.

- Right-panel role clarification (decision surface vs tools surface) - issue #49
- Hotkey rebind validation (rejects digits 1-4, Enter, arrows, and key collisions)
- Coaching arc dynamic hotkey interpolation; small-file conditional copy; tips-progress chip on traces 6-15
- Modal a11y (focus trap + Esc handling on SettingsModal and TagManagementPanel)
- Native browser dialog replacement (styled ConfirmDialog / PromptDialog primitives)
- State freshness for rapid keyboard labeling (useStateRef, max-wait flush, visibilitychange + beforeunload)
- ToolCallRenderer chat bubble cap removed (max-h on bubbles only, JSON pre still capped)
- Tag hierarchy reconsidered (no implementation; flat tags retained for now)

### v3 scope (deferred, do not re-litigate for v2.x)
- Power-user analysis: similarity highlighting + side-effect verification (#37)
- Adapter pattern (adapter.ts) for power users (#16)
- Braintrust export (#17)
- SQLite storage backend (#32)
- External platform integrations (#33)
- Multi-format rendering (image, audio, video) (#34)
- Batch labeling (#36) - deferred after wedge concern (premature taxonomy lock-in); revisit once open coding is internalized
- Time-based progress estimation (#42)
- LLM judge training pipeline (#44)
- Alternate distribution shapes (CLI, notebook widget) (#45)

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

## Design Decisions

Locked-in v1 visual and interaction choices. Apply consistently across new components. Full rationale in [docs/ux-research-note.md](docs/ux-research-note.md). Do not re-litigate these without amending the research note first.

| Area | Decision |
|---|---|
| Layout | 75/25 split. Trace content fills the left 75% in a single centered column. The right 25% panel is the per-trace decision surface only: Pass / Fail / Skip / Previous / Next / Label-next. No left list sidebar. Session-level tools live in the top bar so they don't compete with verdict actions. |
| Top bar | Always visible. Left: logo + "Load new file". Center: "Trace X of Y" counter and "X of Y labeled" subline. Right: tools row carrying ? tips (when not active), Find (popover), Tags (count), Undo (count), Settings, save status, and Export. Find opens a popover combining filter, jump-to-#, and random sample. |
| Bottom bar | Always visible. Carries quick-apply tag chips (top 4 most-recent) and keyboard hints (`P` Pass, `F` Fail, arrows Navigate, `Enter` Next, `N` Label next, `1-4` Tag). |
| Density | Medium. Trace body fills ~70-80% of viewport height. No internal scrolling for typical chat turns. Metadata and "Show JSON" collapsed by default. |
| Theme | Light only in v1. Background `bg-gray-50`, surfaces `bg-white`. No dark mode. |
| Primary text | `text-gray-900`. Secondary `text-gray-600`. Muted `text-gray-400`. |
| Accent color | Blue (`bg-blue-600` / `text-blue-700` / borders `border-blue-300`) for primary actions and the "Label next" CTA. |
| Pass / Fail | Pass uses green (`bg-green-600` active, `bg-green-100`/`text-green-800` badge). Fail uses red (`bg-red-600` active, `bg-red-100`/`text-red-800` badge). |
| Edited indicator | Orange (`bg-orange-100` / `text-orange-700`) chip in trace header. |
| Tags | Violet (`bg-violet-100` / `text-violet-800` chips, `bg-violet-600` active). Quick-apply chips show `[1]`-`[4]` keyboard hint inline. |
| Chat bubbles | User right-aligned in blue (`bg-blue-600 text-white`). Assistant left-aligned in light gray (`bg-gray-100 border-gray-200`). System centered, italic, collapsible. Tool calls full-width monospace card. Matches iMessage / WhatsApp / ChatGPT convention. |
| Coaching tips | Blue card (`bg-blue-50 border-blue-200`) on traces 1-5. Dismissible per session and globally. Re-trigger via "? tips" in top bar. |

**Deferred to v2 (do not add in v1):**
- Dark mode
- Color-accessibility cue alongside pass/fail color (icon or shape redundancy)
- Multi-turn chat pagination ("show first 5 turns" + load more)
- Mobile / small-screen layout

## Skills

Review capabilities live in `.claude/skills/` as SKILL.md files. They auto-create slash commands and are discoverable by subagents. Shared reference files in `.claude/skills/shared/`. Use `/review` for unified auto-detected review or individual `/review-code`, `/review-ux`, etc. for focused reviews.
