# Trace Annotator — Design Handoff

> Single-user, local, browser-based tool for reviewing LLM outputs and labeling pass/fail with free-text failure-mode tags. Optimized so a 200-trace session takes ~1 hour vs ~20/hour in a spreadsheet.

---

## 1. Design system — "Quiet notebook"

One direction, applied everywhere.

### Color tokens (CSS custom properties — copy verbatim)

```
--paper:    #faf8f4;   /* primary surface — warm off-white */
--paper-2:  #f3efe7;   /* secondary surface (rail bg, hover) */
--paper-3:  #ece7dc;   /* tertiary (kbd, chip bg) */
--rule:     #e3ddd0;   /* hairlines */
--rule-2:   #d6cfbe;   /* slightly stronger hairlines */

--ink:      #1a1814;   /* primary text */
--ink-2:    #4a4640;   /* secondary text */
--ink-3:    #807a70;   /* tertiary / metadata */
--ink-4:    #b3ad9f;   /* disabled, very subtle */

--accent:       oklch(0.55 0.09 220);   /* muted teal-blue */
--accent-soft:  oklch(0.93 0.03 220);
--accent-ink:   oklch(0.32 0.07 220);

--pass:        oklch(0.55 0.09 150);   /* muted green */
--pass-soft:   oklch(0.94 0.04 150);
--fail:        oklch(0.55 0.13 30);    /* muted red */
--fail-soft:   oklch(0.94 0.05 30);
```

**Rule:** all accents share the same chroma / lightness; only hue varies. Don't introduce saturated brand colors.

### Typography

| Use | Family | Weights |
|---|---|---|
| UI (buttons, labels, body) | **IBM Plex Sans** | 400 / 500 / 600 |
| Trace prose, headlines | **Newsreader** (serif) | 400 / 500 |
| Keys, metadata, IDs, scores | **IBM Plex Mono** | 400 / 500 |

Load via Google Fonts. Trace content always renders in the serif so reading the data is the focal act — not decorating the chrome.

### Spacing & shape

- Density tokens: `--pad: 20px` balanced, `14px` dense.
- Radii: `4 / 6 / 10`.
- Borders are 1px solid `--rule` for structure, 1px dotted `--rule-2` for soft separators.
- No drop shadows except: `0 1px 3px rgba(0,0,0,.08), 0 4px 16px rgba(0,0,0,.06)` on cards.

### Components defined (see CSS)

- `.ta-chip` / `.ta-chip--applied` — pill for tags
- `.verdict-btn[data-active=pass|fail|skip]` — tri-state verdict buttons
- `.role-pill[data-role=user|assistant|system|tool]` — chat role labels
- `kbd` — keyboard hint badges (Plex Mono)
- `.lv-tag-cloud__chip` — suggestion chip with optional `.lv-tag-cloud__num` hotkey badge
- `.coach-card`, `.milestone-card` — coaching surfaces (warm yellow tint)
- `.rag-chunk` / `.rag-chunk--used` — retrieval chunks (dimmed unless used)
- `.tool-block` — tool-call display

---

## 2. Layout invariants

The labeling view is where 99% of session time lives. **These never move:**

- **Top bar** (46px): file/template, progress bar, jump-to-next-unlabeled, find, manage tags, export, settings.
- **Trace pane** (left, scrolls independently). Header pinned at top with id + title + source. Foot prints a small "end of trace" marker.
- **Decision rail** (right, 380px, sticky). Verdict → Tags → Note → Coaching/Similar. Never scrolls out of view.
- **Bottom bar** (38px): Prev / Next / counter / undo-redo hints / save status / labeled count.

Layout variants supported via `data-layout="one|two|three"` on `.labeling-view`. Default is `two`. Three-pane adds a 220px queue list on the left.

**Long-trace rule:** rail is `position` independent; the trace pane scrolls. A 30-turn agent trace must never bury the verdict / tag input / note.

---

## 3. Tag-surface consolidation (single biggest design decision)

The four overlapping surfaces in v1 (free-text input, recent strip, bottom-bar quick-apply chips, datalist autocomplete) **collapse into one**:

1. Single text input — type to add a brand-new tag (Enter creates it).
2. Same input filters the suggestion cloud below as you type.
3. Suggestion cloud shows the top 9 tags by recency/count, each with a `1`–`9` hotkey badge. Press the digit to apply.
4. `+ N more` chip expands the full taxonomy. Filtering replaces the truncation.

**Why:** one source of truth, predictable affordance, no visual duplication.

---

## 4. Keyboard map (Windows-friendly)

| Key | Action |
|---|---|
| `P` / `F` / `S` | Pass / Fail / Skip |
| `T` | Focus tag input |
| `1`–`9` | Apply visible suggestion |
| `Left arrow` / `Right arrow` | Prev / Next |
| `U` | Jump to next unlabeled |
| `Ctrl K` | Find / jump-to-id |
| `Ctrl Z` / `Ctrl Shift Z` | Undo / Redo |
| `Esc` | Exit batch / dismiss modal |

Mac users will see the same `Ctrl` labels — fine; the chord works as `⌘` on Mac browsers via `accelerator-key` semantics. Don't ship two label sets.

---

## 5. Trace shape rendering

| Shape | Renderer | Notes |
|---|---|---|
| **Chatbot** | `<ChatTrace>` | Role pill + serif body, 22px gap between turns. System messages dimmed in mono. |
| **RAG** | `<RagTrace>` | Query → retrieved chunks (unused = 65% opacity) → answer. Chunks show `match 0.94` and `used in answer` badge. |
| **Tool-calling agent** | `<AgentTrace>` | Same skeleton as chat; `tool_call` rows render in a `.tool-block` with args + result rows. Status dot shows ok/error. |
| **Summarizer** | `<SummarizerTrace>` | Two-column grid: source doc left, summary right. Equal width. The only renderer that breaks the single-column trace pane; lets the reviewer judge faithfulness. |
| **Unknown** | falls back to `<ChatTrace>` |

---

## 6. Coaching strategy

Beginner experience by default; off by setting (not by user mode).

- **First 5 traces:** inline coaching card in the rail. Topics in order: Welcome / Tags-are-flat / Reversibility / Keyboard / Quality-over-speed. Dismissible per-session and globally.
- **Milestones at 25 / 50 / 100 traces:** a `MilestoneCard` prompts taxonomy review with stats (unique tags, used-once-only, near-duplicates).
- Cards live **inside** the rail — they never block the trace.

---

## 7. Experienced mode (gated by setting)

Off by default. Beginner experience untouched for everyone else. When on:

- **Batch labeling** — multi-select queue replaces trace pane; `Shift P` / `Shift F` / tag apply to all selected. Single-undo for the batch.
- **Similarity** — clusters of similar unlabeled traces; click a cluster to review it as a filtered queue.
- **Tool-call review** — per-call right/wrong/skip mark inside `.tool-block` (informational only).
- **Custom JSON adapter** — declarative transform config so the load wizard skips field-mapping on saved shapes.

---

## 8. Friction test (apply to every change)

Borrowed from Hamel: *does this remove friction from looking at data, or add it?* If it adds, cut it.

Concrete rejections that follow from this:

- No breadcrumbs on the labeling view.
- No nested settings drawers; preferences live in one Settings sheet.
- No toast notifications for routine saves — bottom-bar status indicator only.
- No modals while labeling (taxonomy / settings open as full-bleed overlays, not popups over the trace).

---

## 9. What to share with the AI / engineer

Pack these (in this order) when you hand off:

1. **This document** (`Design Handoff.md`).
2. **`Trace Annotator.html`** — visual reference, all variants on the canvas.
3. **`styles.css`** — the design tokens. Copy these verbatim into the production CSS.
4. **`labeling-view.css`** + **`batch-similarity.css`** — component CSS.
5. **`labeling-view.jsx`** + **`trace-renderers.jsx`** + **`batch-similarity.jsx`** — reference implementations of each surface.
6. **`data.jsx`** — sample data shapes for chatbot / RAG / agent / summarizer. The engineer can use these as TypeScript-shape examples.

Skip: `design-canvas.jsx`, `tweaks-panel.jsx`, `Trace Annotator.html` script tags, sample HTML markup. Those are the canvas chrome.
