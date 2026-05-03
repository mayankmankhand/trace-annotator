# UX Research Note: Labeling Tool Design Pass

**Issue:** #10  
**Date:** 2026-05-03  
**Status:** Phase A - research only. Phase B (apply to CLAUDE.md + components) requires user review first.

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

### 4.1 Layout: Single-column, one trace at a time

**Recommendation:** Do not use a two-panel layout. Show one trace at a time in a single centered column, with a fixed top-bar carrying the progress indicator and a bottom-bar carrying the label actions.

**Why:** Two-panel layouts (Braintrust, LangSmith) make sense when you want to reference a list while reading. For annotation, you want the reviewer's full attention on one trace. Removing the list sidebar reduces distraction and prevents "list anxiety" (the visible pile of remaining work).

**Exception:** A small persistent counter in the top bar (e.g., "7 of 120") preserves progress visibility without showing the full list.

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

### 4.5 Chat bubble style: Role color-coded, left/right aligned

**Recommendation:** User messages: left-aligned, light gray bubble. Assistant messages: right-aligned, blue-tinted bubble. System messages: centered, italic, muted text (no bubble). Tool calls: full-width card with monospace function name and collapsible arguments.

**Why:** Braintrust uses role badges and colored text but not bubbles. Bubbles are the pattern users already know from consumer chat apps. Beginner PMs will recognize the layout instantly without needing a legend.

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

## 7. Next Steps (Phase B - requires user approval)

Phase B applies these decisions:
- Add the decision table to CLAUDE.md under a new "Design Decisions" section
- Apply color tokens consistently to existing wizard components
- Scaffold the top bar (progress) and bottom bar (keyboard hints) stubs for the trace view
- Ensure the chat renderer AC in issue #3 follows the bubble style from section 4.5

Phase B should NOT start until the user approves this note.
