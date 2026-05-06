# Issue #53 - "Quiet Notebook" UI Modernization

**Overall Progress:** `0%`

## TLDR

Restyle the Trace Annotator end-to-end to match `Visual/Design Handoff.md`. New design tokens, new layout, new tag-surface behavior, new hotkey map, three new trace renderers. Plumbing (storage, wizard logic, undo, similarity, time-estimate, hooks) is untouched. Single release on a feature branch.

## Goal State

**Current State:** v3.0 shipped. Tailwind-styled labeling view with violet/blue/green accents. Tag surface lives in 4 places (input, recent strip, bottom-bar quick-apply, datalist). Hotkeys are P/F + 1-4 + arrows. Renderers: Chat, Email, Generic, ToolCall. Coaching exists but its visibility is implicitly tied to the v3 mode toggle.

**Goal State:** Every visible surface matches the "Quiet notebook" design system from `Visual/Design Handoff.md`. Paper tokens + Newsreader serif for trace prose + IBM Plex Sans/Mono. 2-pane layout with 380px sticky decision rail. Single tag input + 9-chip cloud with `1`-`9` hotkeys. Hotkeys: P/F/S, T, U, 1-9, Ctrl+K, Ctrl+Z. Four renderer paths: Chat, RAG, Agent, Summarizer (plus fallbacks for Email/Generic). Coaching is its own setting, independent of the experienced-mode toggle.

## UI/UX Design

- **Source:** User-provided design handoff (`Visual/Design Handoff.md` + `styles.css`, `labeling-view.css`, `batch-similarity.css`, reference JSX)
- **Look:** Warm off-white "paper" surface (`#faf8f4`), near-black ink, single muted-teal accent. Newsreader serif for trace prose, Plex Sans for chrome, Plex Mono for keys/IDs/scores. 1px hairline borders, no shadows except on cards. Light theme only (variant C dark theme is out of scope - flagged below).
- **Behavior:** 2-pane layout (trace left, 380px sticky decision rail right), 46px top bar, 38px bottom bar. Single tag input that doubles as the suggestion-cloud filter. `1`-`9` hotkeys apply visible suggestions. No modals while labeling - taxonomy and settings open as full-bleed overlays. No toasts for routine saves.

## Critical Decisions

- **Restyle in place, not rebuild** - Keep all logic in `lib/`, `hooks/`, the wizard, IndexedDB schema, undo dispatcher, similarity, time-estimate. Rewrite component markup + class names + styles only. Reference JSX in `Visual/` is a structural sketch, not production code.
- **Single release on a feature branch** - All surfaces ship together to avoid a half-old/half-new state. Branch: `issue-53-quiet-notebook`.
- **Tag surface consolidates 4 → 1** - This is a real behavior change, not just visual. Old quick-apply chips, recent strip, and datalist autocomplete are removed. Single input + 9-chip cloud with hotkey badges replaces all of them.
- **Hotkey map expands** - 1-4 becomes 1-9. New keys: `T` (focus tag input), `U` (jump to next unlabeled), `S` (skip). `P`/`F` keep their meaning. Audit log entries adapt to whichever new keys map to which actions.
- **Three new renderers added, existing kept** - RAG, Agent, Summarizer. Chat, Email, Generic, ToolCall remain as fallbacks. `detect.ts` learns to identify RAG (chunks + answer), Agent (tool_call rows beyond a single ToolCall), Summarizer (source + summary fields).
- **Coaching is independent of experienced mode** - Two distinct settings: "Show coaching" (default on) and "Experienced mode" (default off). They do not co-vary.
- **Email renderer kept as a fallback** - Not in the handoff's renderer table but already shipping. Keep behind `detect.ts`; don't add it to the handoff's first-class renderer list, just don't break it. Restyle to match the new tokens.
- **Tailwind coexists during the migration; full removal deferred** - Add the new CSS files; rewrite labeling-view markup to plain semantic classes. Wizard and load screens migrate in their own step. A "delete Tailwind" pass is left as cleanup once nothing imports it - flagged in Step 9 but not required for the release.

**Open items to confirm during execution (do not block planning):**
- Variant C (dark theme) is in `labeling-view.css` but out of v1 scope per CLAUDE.md design decisions. Plan keeps it out. Confirm during execution.
- The handoff's "Three-pane queue" (`data-layout="three"`) overlaps the v3 batch-labeling UI. Decide during Step 4 whether to use this layout for batch mode or keep the existing `BatchPanel`.

## Tasks

- [ ] 🟥 **Step 1: Foundation - tokens, fonts, base CSS** `[sequential]` → delivers: design tokens loaded globally, fonts available, baseline reset usable by every later step
  - [ ] 🟥 Create feature branch `issue-53-quiet-notebook`
  - [ ] 🟥 Add Newsreader + IBM Plex Sans + IBM Plex Mono via Google Fonts in `src/app/layout.tsx`
  - [ ] 🟥 Copy `Visual/styles.css` into `src/app/styles/quiet-notebook.css` (verbatim, per handoff §1)
  - [ ] 🟥 Copy `Visual/labeling-view.css` into `src/app/styles/labeling-view.css`
  - [ ] 🟥 Copy `Visual/batch-similarity.css` into `src/app/styles/batch-similarity.css`
  - [ ] 🟥 Import the three CSS files from `globals.css` (after Tailwind, so semantic classes win)
  - [ ] 🟥 Strip variant C dark-theme block from `labeling-view.css` per CLAUDE.md "light only in v1"

- [ ] 🟥 **Step 2: Labeling view shell** `[sequential]` → depends on: Step 1
  - [ ] 🟥 Rewrite `TraceView.tsx` outer JSX to the `.labeling-view` grid (top bar, body grid `1fr 380px`, bottom bar)
  - [ ] 🟥 Build `.lv-topbar` with file/template chip, `.lv-progress` (bar + tabular numbers), jump-to-next-unlabeled, find, manage tags, export, settings
  - [ ] 🟥 Build `.lv-bottombar` with Prev/Next, counter, undo/redo hints, `.lv-savestatus`, labeled count
  - [ ] 🟥 Build `.lv-trace` container with `__head` (id + title + source pinned) and `__foot` ("end of trace" marker)
  - [ ] 🟥 Build `.lv-rail` container with `__section` slots for Verdict / Tags / Note / Coaching/Similar
  - [ ] 🟥 Remove old Tailwind chrome from this file; preserve all state, hooks, dispatchers, props

- [ ] 🟥 **Step 3: Decision rail content - verdict + note** `[sequential]` → depends on: Step 2
  - [ ] 🟥 Replace verdict button group with `.verdict-btn[data-active="pass|fail|skip"]` tri-state
  - [ ] 🟥 Replace note textarea with `.lv-note` (serif, 80px min-height, focus ring)
  - [ ] 🟥 Wire `kbd-hint` badges inline on each verdict button

- [ ] 🟥 **Step 4: Tag surface consolidation** `[parallel]` → delivers: single source-of-truth tag panel matching handoff §3
  - [ ] 🟥 Rewrite `TagPanel.tsx` to a single `.lv-tag-input` + `.lv-tag-cloud`
  - [ ] 🟥 Input behavior: type to filter cloud; Enter creates a brand-new tag
  - [ ] 🟥 Cloud shows top 9 by recency/count, each with `.lv-tag-cloud__num` `1`-`9` badge
  - [ ] 🟥 `+ N more` chip expands the full taxonomy; filtering replaces truncation
  - [ ] 🟥 Remove the recent-strip, the bottom-bar quick-apply chips, the datalist autocomplete
  - [ ] 🟥 Update `TagManagementPanel.tsx` to render in the full-bleed overlay style (no popup over the trace)

- [ ] 🟥 **Step 5: Renderer rewrite + 3 new renderers** `[parallel]` → delivers: Chat/RAG/Agent/Summarizer rendering matching handoff §5
  - [ ] 🟥 Restyle `ChatRenderer.tsx` to use `.role-pill[data-role]` and serif body, 22px gap between turns
  - [ ] 🟥 Restyle `ToolCallRenderer.tsx` to use `.tool-block` (mono, 11.5px, label/code rows)
  - [ ] 🟥 Restyle `EmailRenderer.tsx` and `GenericRenderer.tsx` to use new tokens (no structural change)
  - [ ] 🟥 New `RagRenderer.tsx` - query → `.rag-chunk` list (unused = 65% opacity) → answer; chunks show `match 0.94` and `used` badge
  - [ ] 🟥 New `AgentRenderer.tsx` - chat skeleton + `.tool-block` rows with status dot
  - [ ] 🟥 New `SummarizerRenderer.tsx` - `.summ-grid` 2-column (source left, summary right)
  - [ ] 🟥 Extend `detect.ts` with detection rules for RAG (chunks + answer fields), Agent (≥2 tool_call rows), Summarizer (source_doc + summary fields)
  - [ ] 🟥 Update `TraceRenderer.tsx` switch to dispatch the new renderers; Chat remains the unknown-shape fallback

- [ ] 🟥 **Step 6: Coaching restyle + decouple from experienced mode** `[parallel]` → delivers: coaching independent setting, new card visuals
  - [ ] 🟥 Restyle `CoachingTip.tsx` to use `.coach-card` + `.coach-card__title` + `.coach-card__dismiss` (warm yellow)
  - [ ] 🟥 Add `MilestoneCard` variant for traces 25 / 50 / 100 with taxonomy stats (unique tags, used-once, near-duplicates)
  - [ ] 🟥 Move cards inside `.lv-rail__section` (never block the trace)
  - [ ] 🟥 Split the v3 mode toggle: introduce `coachingEnabled` setting (default true) separate from `experiencedMode`
  - [ ] 🟥 Update `lib/config/types.ts` and any consumers to read the two flags independently

- [ ] 🟥 **Step 7: Wizard + load/resume screens restyle** `[parallel]` → delivers: wizard surfaces using new tokens
  - [ ] 🟥 Restyle `Wizard.tsx`, `DropZone.tsx`, `MappingStep.tsx`, `PreviewStep.tsx`, `TemplateStep.tsx` to plain semantic classes + new tokens (no logic changes)
  - [ ] 🟥 Restyle the resume-offer panel and "Loading session..." view in `AppShell.tsx`
  - [ ] 🟥 Restyle `Logo.tsx` to fit the new chrome density

- [ ] 🟥 **Step 8: Hotkey expansion + behavior wiring** `[sequential]` → depends on: Steps 2, 3, 4, 5
  - [ ] 🟥 Update keyboard handler to: P/F/S, T (focus `.lv-tag-input`), U (jump to next unlabeled), 1-9 (apply visible suggestion), arrows, Ctrl+K (find), Ctrl+Z / Ctrl+Shift+Z (undo/redo), Esc (exit batch / dismiss overlay)
  - [ ] 🟥 Update audit log to record the new key->action mappings
  - [ ] 🟥 Verify Mac Ctrl == Cmd via accelerator-key semantics; do not ship a second label set
  - [ ] 🟥 Update any onboarding/coaching copy that references the old hotkeys

- [ ] 🟥 **Step 9: Cross-surface QA + cleanup** `[sequential]` → depends on: Steps 2-8
  - [ ] 🟥 Run `npm run build` and `npm run lint` clean
  - [ ] 🟥 Start dev server; load each fixture (chat, RAG, agent, summarizer) and label end-to-end with keyboard only
  - [ ] 🟥 Verify all 4 friction-test rejections (no breadcrumbs, no nested settings drawers, no toast-on-save, no modals while labeling)
  - [ ] 🟥 Verify coaching toggles independently of experienced mode
  - [ ] 🟥 Verify long-trace rule: 30-turn trace doesn't bury the rail
  - [ ] 🟥 Sweep for orphaned Tailwind classes in restyled files (delete; flag any that still need work)
  - [ ] 🟥 Update `CLAUDE.md` design-decisions table and `docs/ux-research-note.md` to reflect the new system
  - [ ] 🟥 Open PR against main with handoff diff summary

## Outcomes

<!-- Filled in after execution. -->
