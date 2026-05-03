# Trace Annotator

An opinionated, open-source local web app for reviewing LLM outputs and labeling what worked and what did not. Built for new PMs starting with evals.

**v2.0** ships the hero feature: drop your real (messy) trace file into the wizard and the app figures it out, then teaches the method as you label.

## What it does

When you ship an LLM-powered feature, you need to look at lots of real outputs to spot the patterns of where it goes wrong. Trace Annotator gives you a keyboard-driven loop for doing that:

- **Load** your traces from JSONL, JSON, or CSV. The wizard auto-detects common shapes (`{"traces": [...]}`, `{"data": [...]}`, `{"records": [...]}`, bare arrays, JSONL) plus nested `messages[]` chats with `tool_calls`. If it can't guess, it routes you to a manual mapping step.
- **Render** each trace the way the end user would see it (chat bubbles, email, tool-call cards) instead of raw JSON.
- **Label** pass or fail with one keystroke. Add free-text tags (`P` pass, `F` fail, `S` skip, arrows to navigate, `Cmd/Ctrl+Z` to undo).
- **Export** your labels as JSONL or CSV when you're done.

This kind of structured review is **open coding** (free-text notes on each example) and **error analysis** (finding the recurring patterns those notes reveal). The tool helps you do both without leaving the keyboard.

## Why this exists

Most existing labeling tools assume you already know how to do error analysis. This one teaches the method as you use it, so a PM doing their first eval can be productive on day one. The first 5 traces show coaching cards that explain Pass/Fail, tags vs notes, reversibility, and why the tool deliberately doesn't give you a fixed taxonomy upfront.

## Install

The fastest path is to paste the [AGENT-SETUP.md](./AGENT-SETUP.md) file into Claude or ChatGPT and ask it to set up the app on your machine. Otherwise:

```bash
git clone https://github.com/mayankmankhand/Observability.git
cd Observability
npm install
npm run dev
```

Open http://localhost:3000 and drop a file into the wizard. No file ready? Two synthetic fixtures ship with the repo:

- `fixtures/sample-chat-traces.jsonl` - 20 single-turn travel-assistant traces with deliberate failure modes (hallucinations, incompleteness, verbosity). Good for a first session.
- `sample-data/recipe-chatbot-results.json` - 100 recipe-assistant traces. Larger dataset for sustained labeling.

## Bring your own data

BYO-data tool. Real trace data is never committed and is gitignored by default. Files are read in the browser; **nothing is uploaded anywhere**. Labels and session state live in your browser's IndexedDB - see [docs/save-model.md](./docs/save-model.md) for the full design.

## What v2.0 includes

- Wizard that handles real-world envelope shapes and nested chat with tool calls. See [docs/supported-inputs.md](./docs/supported-inputs.md).
- Keyboard-first labeling loop with remappable hotkeys (Settings panel).
- 5-card teaching arc + milestone cards at traces 25, 50, 100. See [docs/coaching-arc.md](./docs/coaching-arc.md).
- Template-driven failure-mode tag suggestions (Chatbot / RAG / Summarizer / Generic).
- Skip ("review later"), undo with Cmd/Ctrl+Z, per-label audit log.
- Tag management (rename, merge, delete), filtered navigation, jump-to-trace, random sample.
- IndexedDB autosave with visible save indicator. Manual JSONL/CSV export.

## Roadmap

- **v2.1:** post-launch review bundle (#49) - right-panel role clarification, modal a11y, state-freshness fixes for rapid keyboard labeling, native dialog replacement, coaching-arc polish. Full change list in [docs/ux-research-note.md](./docs/ux-research-note.md) §8.
- **v3:** power-user analysis (similarity highlighting, side-effect verification), adapter pattern for power users, batch labeling (#36), multi-format rendering (image/audio/video), external platform integrations, SQLite storage backend, alternate distribution shapes (CLI, notebook widget), LLM judge training pipeline. See [open v3 issues](../../issues?q=is%3Aopen+label%3Av3).

## License

MIT, see [LICENSE](LICENSE).
