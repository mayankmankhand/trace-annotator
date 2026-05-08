# Trace Annotator v2.0

The launch release. This isn't a feature dump - it's the first version where a new PM can drop their real (messy) trace file in and the wizard "just understands" it, while the app teaches them how to do open coding as they label.

## The hero moment

Drop a real, messy trace file into the wizard. It just works.

The wizard auto-detects common envelope shapes (wrapped JSON like `{"traces": [...]}`, nested chat with tool calls, JSONL, CSV) and shows a confirmation banner so you can verify before committing. It renders the first trace exactly the way the labeling view will, and asks once what kind of app you're evaluating to seed your failure-mode tags.

From there, label with the keyboard. The first 5 traces show coaching cards that explain the method as you go.

## What's new in v2.0

### Wizard that handles real data
- Unwraps top-level envelopes: `{traces: [...]}`, `{data: [...]}`, `{records: [...]}`, plus bare arrays and JSONL.
- Auto-detects nested chat structure (`messages[]` with role / content / tool_calls).
- Falls through to a manual mapping step when auto-detect can't decide.
- Confidence preview banner so you can validate the guess before committing.
- Large-file warning between 5MB and 25MB.
- One-time "Chatbot / RAG / Summarizer / Other" prompt that seeds the failure-mode taxonomy.
- Documented supported shapes in [docs/supported-inputs.md](./docs/supported-inputs.md).

### Coaching that teaches the method
- 5 first-run cards designed against an explicit teaching goal: by trace 3, you know what Pass / Fail mean and how to use tags. See [docs/coaching-arc.md](./docs/coaching-arc.md).
- Milestone cards at traces 25, 50, 100. Each one consolidates rather than spams.
- Template-driven failure-mode tag suggestions, shown as ghost chips - examples to pull from, not a forced taxonomy.

### Persistence model that's actually documented
- Labels and session state live in your browser's IndexedDB. Manual JSONL/CSV export for portability.
- File fingerprint (filename + count + first/last trace IDs) drives the resume prompt.
- Visible "Saved at HH:MM:SS" indicator in the top bar.
- Per-label audit log persisted across sessions.
- Full design in [docs/save-model.md](./docs/save-model.md).

### Labeling tools
- Keyboard-first: P pass, F fail, S skip, arrows navigate, N jump-to-next-unlabeled, 1-4 quick-apply tags. All remappable in Settings.
- Cmd/Ctrl+Z undo with a 100-deep stack and a visible Undo button.
- Skip ("review later") flag with its own filter.
- Tag management: rename, merge, delete tags across the entire labeled set.
- Filter by Pass / Fail / Unlabeled / Skipped / Tag / Random sample. Jump-to-trace input.

### Polish
- Inter font via next/font.
- Logo wordmark + favicon.
- Trace header now shows filename + position + id.
- Resume prompt now lists pass/fail counts and distinct tag count, plus explicit "what each button does" copy.

## Install

Easiest path: paste [AGENT-SETUP.md](./AGENT-SETUP.md) into Claude or ChatGPT and let the agent set it up. Otherwise:

```
git clone https://github.com/mayankmankhand/trace-annotator.git
cd trace-annotator
npm install
npm run dev
```

## What's not in v2.0

- Batch labeling (#36) - deferred to v2.1 because it encourages premature taxonomy lock-in, which contradicts the wedge ("teaches the method").
- Power-user analysis (#37) - similarity highlighting and side-effect verification stay in v3.
- Tag hierarchy - flat tags only in v2.0.
- Dark mode - light only in v2.0.
- Adapter pattern (#16) - still v3.
- Multi-format rendering, external integrations, SQLite backend, LLM judge pipeline, alternate distribution - all v3.

## Migration from v1

**Skip this section if you didn't run v1 already.** New users have nothing to migrate.

If you did run v1: open the app once after upgrading. The localStorage key for "coaching dismissed" was bumped to `:v2`, so coaching reappears on trace 1 (this is intentional - the v2 cards are different). Server-side label files at `labels/session.jsonl` are no longer used. If you have unfinished v1 work there, run v1 once more, click Export to download the JSONL, then continue in v2.

## Acknowledgments

This release was shaped by peer review (GPT + Gemini debate). They cut the v2.0 scope from 12 to 11 issues, flagged the wedge conflict on batch labeling, and pushed for the explicit teaching arc spec before the coaching cards were written.
