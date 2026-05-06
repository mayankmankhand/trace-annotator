# UX Research Note: Labeling Tool Design Pass

**Issue:** #10  
**Date:** 2026-05-03  
**Status:** Phase A research locked, Phase B applied. Section 4.1 amended after user review. v2.1 added an amendment to §4.1 (right-panel role clarification) plus a full v2.1 changelog in §8 (see issue #49).

---

## 1. What We Studied

Three platforms used by teams running LLM evals in production: Braintrust, Arize Phoenix, and LangSmith. We compared layout, density, theme, and how each tool surfaces keyboard hints and guidance to the reviewer.

The goal is to make one set of locked-in design decisions for Trace Annotator so future components are consistent without re-litigating each choice.

---

## 2. Observations Per Tool

### Braintrust

**Layout:** Two-column. Left sidebar lists experiments/datasets. Right panel shows the selected run as a table with expandable rows. When you open a row, you get a side-by-side split: input on the left, output on the right.

**Density:** Moderate. Table rows are compact but not cramped. Single expanded row fills most of the viewport.

**Theme:** Light by default. Neutral grays and whites with blue accents. Pass/fail uses green/red badges.

**Keyboard hints:** Minimal. Most interaction is mouse-driven. Some keyboard shortcuts exist but are not prominently advertised. No inline hint display.

**What works:** The side-by-side input/output view is excellent for single-turn traces. Quick to scan. Badge-based pass/fail is readable at a glance.

**What does not work for us:** Keyboard hints are buried. The tool assumes experienced users. Beginner PMs will not discover shortcuts without a tour.

---

### Arize Phoenix

**Layout:** Three-panel on the traces page: left sidebar for navigation, center for the trace list/table, right drawer for trace detail. Heavily table-oriented.

**Density:** High. Phoenix targets data scientists who want to see many metrics at once. Column-heavy tables with latency, token counts, cost, model name, scores.

**Theme:** Light default with the option for dark. Cool gray palette. Technical feel.

**Keyboard hints:** None visible. Fully mouse-driven for trace review.

**What works:** Outstanding for filtering and aggregating across large trace sets. Span tree rendering is very good for multi-turn and agentic traces.

**What does not work for us:** Far too dense for a beginner. The multi-column table approach assumes you know what you are looking at. No pedagogical layer.

---

### LangSmith

**Layout:** Two-column. Left sidebar lists projects and run types. Right panel shows a run list; clicking a run opens a full-page detail view with a trace tree down the left and the selected node detail on the right.

**Density:** Moderate-high. More information per page than Braintrust, less than Phoenix. LangChain run trees add visual weight.

**Theme:** Light default. Blue-heavy navigation with neutral content areas.

**Keyboard hints:** Not prominently shown. A few shortcuts (j/k for navigation) but not advertised to new users.

**What works:** The trace tree view is excellent for chain/agent traces with many steps. Timestamp and cost data are easy to find.

**What does not work for us:** Run-tree framing assumes users understand chain execution. Single-turn chat traces feel underserved. No beginner coaching.

---

## 3. Cross-Cutting Patterns

| Pattern | Braintrust | Phoenix | LangSmith |
|---|---|---|---|
| Primary layout | 2-column | 3-panel | 2-column + full-page detail |
| Default theme | Light | Light | Light |
| Density | Moderate | High | Moderate-high |
| Keyboard hints visible | No | No | No |
| One trace at a time | Yes (expanded row) | No | Yes (full-page detail) |
| Beginner coaching | No | No | No |

Key finding: none of these tools have keyboard hints or beginner coaching. That is our differentiation opportunity, not just a nice-to-have.

All three default to light theme. All three show one trace at a time when you enter detail view.

---

## 4. Design Decisions (Recommended Lock-in)

These are recommendations for the user to approve before Phase B applies them.

### 4.1 Layout: 75/25 split with right-side label panel

**Decision (amended by user):** Trace content takes 75% of the viewport on the left. A 25% right-side panel carries the label actions (Pass, Fail) and navigation (Previous, Next, Label next). A fixed top bar carries progress and filename. A fixed bottom bar carries quick-apply tag chips and always-visible keyboard hints.

**Why amended:** The original recommendation put label actions in a bottom bar. The user preferred a right-side action panel because it keeps Pass/Fail next to the trace at the same eye-level, mirrors how labelers in tools like Mechanical Turk and Label Studio work, and makes the action buttons larger and more reachable than a horizontal toolbar. Bottom bar still carries keyboard hints (per 4.4) and quick-apply tag chips.

**No list sidebar:** A small persistent counter in the top bar (e.g., "7 of 120 labeled") preserves progress visibility without showing the full list of remaining traces. Avoids "list anxiety" while preserving status visibility.

**v2.1 amendment - role clarification (issue #49):** The right panel is the *per-trace decision surface*. It carries only the actions a reviewer takes once per trace: Pass, Fail, Skip, Previous, Next, Label-next. Skip joined the panel in v2.0 as verdict-adjacent and is intentionally retained.

Session-level tools (Find / filter / jump / sample, Manage tags, Undo, Settings, Export, ? tips) move to the *top-bar tools row*. The reasoning: when labeling, the eye should scan a small same-shape set of decision buttons, not a 9-affordance column mixing per-trace decisions with administrative controls. Any new affordance proposed for the right panel must answer "is this a per-trace decision?" before it lands. If not, it belongs in the top bar.

This amendment narrows the v1 spec rather than redefining it: the original §4.1 intent was "label actions next to the trace at eye-level". Tools that grew into the panel post-v1 (Find, Manage tags, Undo) are routed elsewhere instead of trimmed.

---

### 4.2 Density: Medium - one trace fills the viewport

**Recommendation:** Target ~70-80% of the viewport height for the trace body. Leave room for a top bar (progress, filename) and a bottom bar (label actions, keyboard hints). No scrolling within the trace panel for typical chat turns.

**Why:** Phoenix's high-density approach works for experienced analysts. For a beginner annotating one trace at a time, dense tables are overwhelming. Medium density keeps the trace readable and leaves room for coaching hints.

**Progressive disclosure:** Metadata and "show JSON" should be collapsed by default. This follows the project's core principle and matches how Braintrust handles extra fields.

---

### 4.3 Default theme: Light, neutral

**Recommendation:** Light theme, neutral gray palette, with blue accents for primary actions and green/red for pass/fail. No dark mode in v1.

**Why:** All three tools default to light. For a browser-based tool used in office settings, light is the safer default. Dark mode is a v2 feature (tracked in #15).

**Color choices:**
- Background: white (`bg-white`) with light gray page background (`bg-gray-50`)
- Text: `text-gray-900` for primary, `text-gray-600` for secondary
- Pass badge: green-100 background, green-800 text
- Fail badge: red-100 background, red-800 text
- Primary action button: `bg-blue-600`

These map exactly to the Tailwind tokens already in use in the wizard.

---

### 4.4 Keyboard hint placement: Bottom-bar, always visible

**Recommendation:** Dedicate a fixed bottom bar to keyboard hints. Show the hot keys for the current state inline with their action labels (e.g., `[P] Pass   [F] Fail   [T] Tag   [←] Back`). Update the bar as the reviewer moves through states.

**Why:** None of the three tools surface keyboard hints visibly. That is the gap we fill. Hints must be always-visible (not in a modal or tooltip) because the reviewer should not have to stop annotating to discover shortcuts.

**Placement rationale:** Bottom bar keeps hints out of the trace content area. It mirrors the "status bar" pattern from code editors (VS Code, Vim) that experienced keyboard users already know. It also naturally pairs with the label action buttons that beginners use before they learn the shortcuts.

---

### 4.5 Chat bubble style: Role color-coded, standard chat-app alignment

**Decision (corrected):** User messages: right-aligned, blue bubble. Assistant messages: left-aligned, light gray bubble. System messages: centered, italic, muted with collapsible expansion. Tool calls: full-width card with monospace function name and collapsible arguments.

**Why:** This matches the convention from iMessage, WhatsApp, Slack, and ChatGPT, where "your" messages sit on the right in your accent color and the other party's messages sit on the left in neutral gray. Beginner PMs will recognize the layout instantly. The earlier draft of this note had user/assistant reversed; the implementation in `ChatRenderer.tsx` was correct from the start, and section 4.5 has been updated to match.

---

## 5. What This Does Not Decide

- Font family: Next.js/Tailwind default (system-ui stack) is fine for v1
- Icon set: Heroicons or similar - not decided yet, deferred to implementation
- Animation: none by default; reduced-motion is v2
- Mobile layout: v1 targets desktop browsers only

---

## 6. Risks and Open Questions

1. **Bottom bar height:** On small laptops (1280x800), a fixed bottom bar plus a fixed top bar may leave very little room for long traces. We may need a collapsible or auto-hide bottom bar for long traces.

2. **Role color accessibility:** Green/red for pass/fail has color-accessibility implications. A secondary shape cue (icon or label) should accompany color so the distinction works for color-blind reviewers. Not blocking for v1 but worth noting.

3. **Single-column for multi-turn:** Single-column works well for single-turn traces. For multi-turn, a scrollable chat panel may become very long. Pagination within the trace (e.g., show first 5 turns with a "show more" link) is worth building into the renderer from the start.

---

## 7. Phase B Applied (2026-05-03)

- Section 4.1 amended after user review (right-side label panel instead of bottom-bar actions)
- Section 4.5 corrected (user-right-blue / assistant-left-gray, matching the implementation)
- Decision summary added to `CLAUDE.md` under a new "Design Decisions" section
- `TraceView.tsx` refactored to a 75/25 split with right-side action panel
- Quick-apply tag chips and always-visible keyboard hints retained in the bottom bar
- Color tokens (gray/blue/green/red) verified across wizard, trace view, tag panel, coaching tip
- Color-accessibility cue and multi-turn pagination intentionally deferred to v2

Phase B should NOT start until the user approves this note.

---

## 8. v2.1 Amendments (issue #49)

### 8.1 Design decisions (rationale belongs here)

- Section 4.1 amended to clarify role separation: the right panel is the per-trace decision surface (Pass / Fail / Skip / Previous / Next / Label-next); session-level tools (Find, Tags, Undo, Settings, ? tips, Export) live in the top-bar tools row. Future panel additions must answer "is this a per-trace decision?" before landing.
- Find collapses three previous panel sections (filter, jump-to-#, random sample) into one popover anchored to the top-bar Find trigger. One click target, one dismiss path.
- Tag delete confirmation now spells out the impact ("will remove `wrong-date` from N traces. The labels themselves stay.") via a styled `ConfirmDialog` that mirrors the rest of the modal family. Destructive dialogs default focus to Cancel rather than the destructive primary so a stray Enter doesn't commit a delete.
- Tag rename now surfaces a merge confirmation when the new name matches an existing tag - the prior silent-merge behavior was risky for beginners who didn't know rename-into-existing was how merges worked.
- Coaching Card 1 interpolates the active `hotkeys.pass`, `hotkeys.fail`, and `hotkeys.next` so the teaching copy stays in sync with rebinds. Card 5 drops the trace-25 promise on files smaller than 25 traces (a promise we wouldn't keep).
- Coaching surface gains a small "Coaching - keep going" presence chip on traces 6-15 to maintain the teaching wedge across the silent gap between Card 5 and the trace-25 milestone. Lives in the top-bar tools row near `? tips` so it visually ties to the coaching surface, not to per-trace metadata.
- The `?` key is bound to toggle coaching tips so the `? tips` button label reads as a real hotkey hint rather than decoration.

### 8.2 Implementation fixes (touched the design surface but not decisions)

- Settings hotkey rebinding rejects digits 1-4, Enter, and arrow keys (reserved), and rejects collisions against other actions; an inline error explains why.
- Modal a11y: SettingsModal, TagManagementPanel, and the new Dialog primitives trap Tab/Shift+Tab focus, autoFocus the appropriate element on open, and restore focus to the trigger on close. Listener lives on `document` so escaped focus snaps back in.
- ToolCallRenderer no longer caps message bubble height for typical chat turns; individual bubbles cap at `max-h-[80vh] overflow-auto` so a pathological 50KB message doesn't push the navigation panel off-screen. JSON args/results `<pre>` blocks keep their `max-h-48` cap (tool outputs can be huge).
- Autosave tracks time since the *first* pending change in the current streak (not time since last save). After 3 seconds of continuous edits, the next change writes immediately. Single edits after idle periods still go through the 500ms debounce.
- Tab close / page hide flush listens on both `beforeunload` (desktop) and `visibilitychange -> hidden` (mobile, since iOS Safari often skips beforeunload). Best-effort - IndexedDB writes are async and the browser doesn't wait on promises.
- Random sample input includes a one-line helper for newcomers ("Pick a random subset to focus on - useful for spot-checking a large file"). Validation surfaces "Only X traces available" when the requested size exceeds `total`.
- FindPopover footer adds an "Esc to close" hint, matching the explanatory tone of SettingsModal.
- Progressbar `aria-valuenow` reports `labeledCount` (matching the visible fill), with `aria-valuetext` providing a screen-reader-friendly summary; trace position is already announced by the live region above.

---

## 9. v3.0 Amendments (the "tool grows with the user" release)

Plan: [plans/PLAN-v3.md](../plans/PLAN-v3.md). Release notes: [RELEASE-NOTES-v3.0.md](../RELEASE-NOTES-v3.0.md).

### 9.1 Design decisions (rationale belongs here)

- **Mode toggle, not separate product.** The wedge held: still "teach the method as you use it for new PMs". v3 amends it with "the same tool grows with the user." Implementation is one localStorage flag (`ta:mode:v1`) and conditional rendering for power features. Beginners are unaffected. The original CLAUDE.md design principle "hard and fast rules are a feature" is preserved as a novice-mode default; experienced mode lifts the rules for users who explicitly opt in.
- **No discovery cues for the toggle.** /explore considered three options (settings only, coaching card, earned milestone). User picked settings only. Cost: experienced practitioners have to know the toggle exists. Benefit: novice mode never breaks the teaching arc with "you might be ready" prompts.
- **Tool-call review badge does NOT force verdict.** Roll-up is informational ("tool calls: 2/3 reviewed"). A reviewer can mark every tool call right and still set the trace to Fail (or vice versa). Hard rollup would create contradictory states; users would either lose information or be forced into ambiguous situations. The tool-call panel and the trace verdict are independent surfaces with independent meanings.
- **String-based similarity, not embeddings, in v3.0.** Embedding-based similarity (transformers.js + a small all-MiniLM model) would add ~25MB to the bundle and 5-10s of first-use latency. TF-IDF + cosine ships zero bundle cost and is "good enough" for surface use. Upgrade path is preserved if quality is not enough; revisit in v3.1+.
- **JSON DSL for adapter in v3.0; repo-clone path in v3.1.** A browser-only JSON DSL helps more users at lower complexity. The repo-clone `adapter.ts` path (where a power user writes actual TypeScript transform logic) is a v3.1 companion.
- **SQLite deferred to v3.1.** IndexedDB scales fine for v3.0 trace volumes (a few thousand traces). Revisit only if v3.0 similarity at scale forces it.
- **Right panel role honored.** Per §8.1, the right panel is the per-trace decision surface. v3 power features that belong there (BatchPanel, ToolCallReviewPanel, SimilarityPanel) all act on the current trace or the active selection. Session-level tools (Settings, Find, Export) stay in the top bar.

### 9.2 Implementation fixes (touched the design surface but not decisions)

- Settings modal restructured to `flex flex-col max-h-[85vh]` with a scrollable body, so all three sections (Mode, Hotkeys, Adapter) fit on small viewports. Header and footer stay pinned.
- `UndoEntry` generalized from `{trace_id, before, after}` to `{ changes: UndoChange[], batchId? }`. Single-trace edits push one change; batch ops push N. `undo()` iterates over `changes` either way, so the in-memory undo path is the same for both.
- `AuditEntry` gained an optional `batchId`. The time estimator (#42) excludes batch entries from its rolling median so applying a tag to 50 traces does not crash the per-label average to milliseconds. Future "show me history of batches" features can scope by batchId.
- Tool-call parser factored from `ToolCallRenderer.tsx` into `src/lib/trace/tool-calls.ts`. Same logic; both the renderer and the review panel now import from one source of truth.
- `applyMapping` (`src/lib/trace/mapping.ts`) extended with `getFieldByPath`. Plain field names (no dot) take the existing direct-property fast path; dotted names walk the object. Existing v1/v2 wizard mappings unchanged; new adapters can target nested fields without flattening their files first.
- LabelRow gained an optional `tool_call_reviews` field (snake_case to match existing v1/v2 export naming). JSONL export round-trips it; CSV export drops it (CSV writer enumerates explicit fields).

---

## 10. v3.1 / "Quiet Notebook" amendments (issue #53)

Plan: [plans/PLAN-issue-53.md](../plans/PLAN-issue-53.md). Source: `Visual/Design Handoff.md`.

### 10.1 Design decisions (rationale belongs here)

- **Single design system end-to-end.** The pre-#53 surface was a Tailwind palette of blue, violet, green, red. v3.1 adopts the "Quiet Notebook" tokens (warm paper background, near-black ink, muted teal accent) across every visible surface. All accents share chroma and lightness; only hue varies. The reasoning: reading the trace is the focal act, so the chrome should never compete. CLAUDE.md design-decisions table updated to match.
- **Restyle in place, not rebuild.** All logic in `lib/`, `hooks/`, the wizard parser, IndexedDB schema, undo dispatcher, similarity, and time-estimate is preserved verbatim. Only component markup, classes, and styling change. Reference JSX in `Visual/` is structural sketch, not production code.
- **Tag surface consolidates 4 to 1.** v2/v3 had four overlapping tag surfaces (free-text input, recent-tags strip, bottom-bar quick-apply chips, datalist autocomplete). v3.1 collapses them to one: a single text input that doubles as the suggestion-cloud filter, with a 9-chip cloud of top-by-recency suggestions, each carrying a `1`-`9` hotkey badge. One source of truth, predictable affordance, no visual duplication. The bottom-bar quick-apply chips are gone; the recent strip is gone; the datalist is gone.
- **Hotkey map expanded.** Quick-apply tags moved from `1-4` to `1-9`. New keys: `T` focuses the consolidated tag input; `U` jumps to next unlabeled (was `N`); `S` toggles skip; `Ctrl K` opens Find; `Ctrl Shift Z` redoes (companion to existing `Ctrl Z` undo). The Settings hotkey-rebind validator now reserves digits 1-9 (was 1-4) to match the cloud's hotkey budget.
- **Coaching is independent of experienced mode.** Two distinct settings: "Coaching" (default on) and "Experienced mode" (default off). They do not co-vary. A beginner can hide tips; an experienced user can keep them. Storage key `ta:coaching-enabled:v1` separate from `ta:mode:v1`.
- **No modals while labeling.** Settings and Tag management open as full-bleed overlays anchored to the right edge, not as dialogs over the trace. The friction-test rule from the handoff §8 (no breadcrumbs, no nested settings drawers, no toast notifications, no modals over labeling work) is honored across the new surfaces.
- **Three new renderers, existing kept.** `RagRenderer` (query, retrieved chunks dimmed unless used, answer) and `SummarizerRenderer` (two-column source vs summary) win when `detect.ts` finds the right metadata. `AgentRenderer` wins on 2+ tool messages. The legacy `ChatRenderer`, `EmailRenderer`, `GenericRenderer`, and single-call `ToolCallRenderer` remain as fallbacks. None of the existing detect.ts thresholds for those renderers changed.
- **Light theme only retained.** Variant C (dark "lab console") in the source CSS is stripped at copy-time, matching CLAUDE.md design-decisions table.
- **Tailwind coexists during the migration.** Tailwind utilities still load via `@import "tailwindcss"` and a few wizard internals (notably the bulk-confirm dialog body) still use them. A "delete Tailwind" pass is left as cleanup once nothing imports it.

### 10.2 Implementation fixes (touched the design surface but not decisions)

- `Hotkeys` storage type gained `focusTag` (default `t`); `labelNext` default migrated from `n` to `u`. Older saved configs missing `focusTag` fall back to the default via the existing merge in `loadHotkeys()`.
- `UndoEntry` already supported batch shape from v3; v3.1 adds a paired `redoStackRef` so `Ctrl+Shift+Z` replays an inverse without re-pushing onto the audit log. New user actions clear the redo stack (matches every editor's semantics).
- `CoachingTip` exports a new `computeTaxonomyStats(allTags, tagCounts)` that returns `{uniqueTags, usedOnce, nearDuplicates}` for milestone-card stats. Near-duplicate detection is a cheap edit-distance pass (lowercase + 3-char prefix + |Δlen|≤2 + ≤2 char diffs); good enough to flag the typical "wrong-date / wrong-dates / wrong_date" trio without pulling in a real similarity library.
- Note edits debounce undo capture: a single before/after entry is pushed on blur, not on every keystroke. Without this, a single sentence flooded the undo stack and Cmd+Z was unusable.
- `ExportButton` gained click-outside and Esc dismiss so the menu does not leak focus when the user clicks elsewhere.
- `EmailRenderer` is kept (not in the handoff's first-class renderer table) but rebuilt on the new tokens. detect.ts continues to surface it on `From:/To:/Subject:` headers.

## 11. v3.2 amendments (issue #55)

Plan: [plans/PLAN-issue-55.md](../plans/PLAN-issue-55.md). Issue: [#55](https://github.com/mayankmankhand/Observability/issues/55).

v3.2 changes three things on the labeling view: the workspace shape (three-pane queue rail becomes the default, replacing the v3.1 two-pane), the chrome (top and bottom bars trim down, a single ⋯ overflow menu absorbs session tools), and the right-rail readability (darker ink across headers, body, and helper text plus a subtle background tint that anchors each section). The unifying thesis is that three-pane was always the intended workspace and v3.2 finally ships it.

### 11.1 Design decisions

- **Three-pane is the new default workspace, not a variant footnote.** The v3.1 handoff (`Visual/Design Handoff.md` §2) listed three layout variants but called two-pane the default. The intended config was always three-pane + dense + coaching, but the handoff and shipped implementation both defaulted to two-pane. v3.2 promotes three-pane to default. The implementation hard-codes `data-layout="two"` and renders no queue rail, so this is genuinely shipping a missing feature rather than re-flipping a default. Two-pane remains as a narrow-viewport fallback (queue collapses to icons at 1024-1280px, hides at <1024px).

- **Queue rail is session navigation; decision rail is per-trace decisions; top bar is session tools.** Three surfaces, three responsibilities. With the queue absorbing "where am I" and "what's left," the bottom bar shrinks to Prev / Next only and most top-bar buttons collapse into one overflow menu. This restores the role separation the v3.1 review (#49) tried to establish but could not complete without a navigation surface.

- **Filter affordance splits into two jobs.** The queue rail's inline filter narrows the visible session ("filter what I'm scrolling through right now"); top-bar `Ctrl K` is global Find for jumping to anything (id, content, regex, cross-file). Two distinct jobs that previously fought for the same surface.

- **Batch labeling moves into the queue, replacing `BatchPanel`.** Multi-select on a list is a recognition-over-recall pattern (Gmail, Finder, GitHub PR list, every spreadsheet). Hover-checkboxes + shift-click range + Esc clear + a contextual action bar at the bottom of the queue is what users already know. `BatchPanel` was a workaround for not having a queue; with one, it is redundant. At <1024px the queue is hidden, so batch is disabled there (mobile labeling is already deferred).

- **Dense density becomes the default.** v3.1 shipped medium density. The intended config bundles dense + three-pane + coaching. Dense gives more reading-time per scroll; medium had visual breathing room that proved unnecessary once the rail and queue gave the trace pane its own dedicated column.

- **Top-bar overflow menu uses `⋯` (kebab), not `≡` (hamburger).** Kebab is the universal "more actions" signal across web and mobile (Material guidelines, iOS HIG, GitHub, Gmail). Hamburger is reserved for primary navigation, which the narrow-viewport queue toggle already needs. Reusing `≡` for both creates ambiguity. The kebab lives at the far right of the top bar (Fitts's-law corner zone). Save status sits immediately left of the kebab as a small dot + text; passive status should be glanceable without opening the menu.

- **Right rail readability tightened.** Headers, body text, and helper/placeholder text in the rail were too low-contrast against the warm-paper background. Darken the ink across all three; add a subtle background tint behind each `.lv-rail__section` so headers feel anchored on a surface.

### 11.2 Implementation fixes

What landed alongside the design decisions above:

- Wired `data-layout` to a Settings preference (default `three`); the previous hard-coded `"two"` is gone. Density flipped to `dense` by default with a Settings escape hatch.
- Ported the queue rail JSX into `TraceView.tsx` as a `QueueRail` component with hover-checkbox multi-select, shift-click range selection, an inline session filter, an active-row scroll-into-view effect, and a contextual `QueueActionBar` at the bottom when 1+ rows are selected.
- Deleted `BatchPanel.tsx`. The queue absorbs multi-select; the bulk-verdict overwrite ConfirmDialog still gates blast-radius cases.
- Stripped the bottom bar to centered Prev / Next. Counter, undo/redo buttons, save status, and labeled count moved into the top bar's progress strip and the new ⋯ kebab menu.
- Added the `≡` queue-toggle button (top-bar left edge, only visible <1024px) plus the slide-over drawer behavior for the queue at narrow viewports.
- Removed the time-remaining estimator chip after manual feedback that it added noise without orienting the reviewer; the audit log itself is unchanged.

Open follow-ups for a later PR (called out in the post-launch review): kebab arrow-key navigation, drawer dialog semantics (focus trap + aria-modal), `<main>` landmark on the trace pane, and CSS hygiene for the `.lv-batch*` and `.lv-bottombar__*` rules orphaned by component deletions.
