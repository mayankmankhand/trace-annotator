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

### v3.0 scope (in progress, see plans/PLAN-v3.md)

The "tool grows with the user" release. Same wedge as v1/v2 (teach the method as you use it for new PMs); v3 adds an explicit "I'm experienced" mode toggle in Settings that unlocks power features for serious practitioners. Beginners see the v1/v2 experience untouched.

- Mode toggle foundation - Settings toggle, localStorage `ta:mode:v1`, no discovery cues
- Time-based progress estimation (#42) - always-on, derives from existing audit log
- Batch labeling (#36) - experienced mode only; multi-select traces, bulk apply tags/verdicts
- Adapter pattern - JSON DSL only (#16) - experienced mode only; declarative transform config in Settings
- Power-user analysis (#37) - experienced mode only; tool-call correctness review (Option A) plus string-based similarity highlighting

### v3.1 scope (deferred)
- Adapter pattern - repo-clone `adapter.ts` path (#16, companion to v3.0 JSON DSL)
- SQLite storage backend (#32) - revisit only if v3.0 IndexedDB hits scale limits

### v4 scope (roadmap)

The "second pair of eyes" release. v1-v3 assume a single PM labeling alone; v4 opens the tool up to collaboration. This is a meaningfully bigger shift (multiple users, shared state, agreement metrics) that does not fit the single-reviewer framing of earlier versions, so it gets its own roadmap chapter.

- Multi-annotator support for contested labels (#62) - second reviewer can weigh in on a labeled trace, side-by-side comparison, disagreement surfacing, inter-annotator agreement at session/dataset level

### Cut from v3 (closed during v3 planning)
- Braintrust export (#17) - graduation path; contradicts "stay and grow" v3 framing
- External platform integrations (#33) - same rationale as #17
- Multi-format rendering (#34) - image/audio/video out of v3 scope
- LLM judge training pipeline (#44) - meaningfully different product (LLMOps, not labeling)
- Alternate distribution shapes (CLI + notebook widget) (#45) - audience drift toward ML engineers

### Explicitly rejected
- Requirement 5.4 ("no hard and fast rules"). For a beginner-targeted tool, hard and fast rules are a feature, not a limitation. We pick defaults and ship them. **v3 amendment:** rules apply in novice mode only; experienced mode (Settings toggle) unlocks flexibility for users who explicitly opt in.

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

**v3 amendment.** The principles above are the novice-mode default. When the user has flipped the "I'm experienced" toggle in Settings, defaults bend: power features (batch labeling, custom adapters, tool-call review, similarity highlighting) appear, and the user takes responsibility for the trade-off. The novice experience must remain untouched - if a v3+ feature would change novice behavior in a non-trivial way, gate it behind the mode toggle.

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

Locked-in visual and interaction choices for the "Quiet Notebook" system (v3.1 issue #53; v3.2 amendments issue #55). Apply consistently across new components. Full rationale in [docs/ux-research-note.md](docs/ux-research-note.md) §10 and §11. Do not re-litigate these without amending the research note first.

| Area | Decision |
|---|---|
| Layout | 3-pane default (220px queue rail + flexible trace + 380px sticky decision rail). 46px top bar, 38px bottom bar. The queue is session navigation; the rail is the per-trace decision surface (Verdict, Tags, Note, Coaching/Similar); session-level tools collapse into a top-bar `⋯` overflow menu. 2-pane (no queue) is a narrow-viewport fallback. |
| Queue rail | 220px left column. Per-row floor: status dot + title (wraps if long) + short id. Hover or active row reveals 1-2 truncated applied-tag chips; source and timestamp in tooltip. Inline session-scoped filter input at the top of the rail. Coexists with global `Ctrl K` Find (different jobs). Collapses to a 40px icon strip at 1024-1280px; hides behind a `≡` button below 1024px. Multi-select for batch labeling lives here (hover checkbox + shift-click range), with a contextual action bar appearing when items are selected. |
| Top bar | Left: file/template chip. Center: progress bar + tabular `idx / total` + labeled count + percentage. Right: passive save-status indicator and a single `⋯` overflow menu containing Tags, Export, Settings, Undo, Redo. (Find / next-unlabeled absorbed by `Ctrl K` and the queue rail.) |
| Bottom bar | Prev / Next only. Counter, undo/redo controls, save status, and labeled count moved into the top bar or absorbed by the queue. |
| Density | Dense by default (v3.2; was Medium in v3.1). Trace body fills the pane; no internal scrolling for typical chat turns. Metadata and raw JSON collapsed by default. |
| Theme | Light only. `--paper #faf8f4`, `--ink #1a1814`. No dark mode. |
| Color tokens | All accents share chroma + lightness; only hue varies. `--accent` is muted teal-blue (oklch 0.55 0.09 220). `--pass` muted green (oklch 0.55 0.09 150). `--fail` muted red (oklch 0.55 0.13 30). `--warn` warm yellow (oklch 0.65 0.10 75). |
| Typography | IBM Plex Sans for chrome (buttons, labels). Newsreader (serif) for trace prose, headlines, summary text. IBM Plex Mono for keys, IDs, metadata, scores. |
| Pass / Fail / Skip | Tri-state `.verdict-btn[data-active=pass\|fail\|skip]`. Pass = green-soft fill, Fail = red-soft fill, Skip = paper-3 fill, all with hairline borders. |
| Edited indicator | Warm-yellow chip (oklch 0.94 0.05 75 background) in the trace header. |
| Tags | Single text input that doubles as the suggestion-cloud filter. The cloud shows the top 9 by recency/count, each with a `1`-`9` hotkey badge. Applied tags render as accent-soft chips with an "x" remove affordance. |
| Hotkeys | `P/F/S` Pass/Fail/Skip, `T` focus tag input, `U` jump-to-next-unlabeled, `1`-`9` apply visible suggestion, arrows Prev/Next, `Ctrl K` Find, `Ctrl Z` Undo, `Ctrl Shift Z` Redo, `Esc` exit batch / dismiss overlay. Mac shows the same Ctrl labels (the chord works as Cmd on Mac). Letter keys are user-rebindable in Settings. |
| Chat bubbles | Role pill metadata above the message body. Trace prose renders in Newsreader; system / tool prose renders in mono. 22px gap between turns. Long system prompts collapse behind a disclosure summary. |
| Coaching tips | Warm-yellow `.coach-card` rendered inside `.lv-rail__section`, never blocking the trace. Independent setting from experienced mode (`ta:coaching-enabled:v1`). Default on. Re-trigger via `?` or "? tips" in the top bar. |
| Modals | Settings and Tag management open as right-edge sheets (max 720px wide), not popups over labeling work. ConfirmDialog uses a centered shell for destructive flows that already happen inside an overlay (e.g. tag merge / delete). Bulk-verdict overwrite is the one mid-labeling exception and is gated behind a ConfirmDialog because the blast radius needs explicit acknowledgement. |

**Deferred:**
- Dark mode (variant C explicitly out of scope)
- Color-accessibility cue alongside pass/fail color (icon or shape redundancy)
- Multi-turn chat pagination ("show first 5 turns" + load more)
- Mobile / small-screen layout
- Full Tailwind removal (utilities still coexist where the wizard internals used them)

## Skills

Review capabilities live in `.claude/skills/` as SKILL.md files. They auto-create slash commands and are discoverable by subagents. Shared reference files in `.claude/skills/shared/`. Use `/review` for unified auto-detected review or individual `/review-code`, `/review-ux`, etc. for focused reviews.
