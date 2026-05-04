# Trace Annotator

An opinionated, open-source local web app for reviewing LLM outputs and labeling what worked and what did not. Built for PMs starting with evals; grows with you when you're ready for power tools.

## What it does

When you ship an LLM-powered feature, you need to look at lots of real outputs to spot the patterns of where it goes wrong. Trace Annotator gives you a keyboard-driven loop for doing that:

- **Load** your traces from JSONL, JSON, or CSV. The wizard auto-detects common shapes (`{"traces": [...]}`, `{"data": [...]}`, `{"records": [...]}`, bare arrays, JSONL) plus nested `messages[]` chats with `tool_calls`. If it can't guess, it routes you to a manual mapping step.
- **Render** each trace the way the end user would see it (chat bubbles, email, tool-call cards) instead of raw JSON.
- **Label** pass or fail with one keystroke. Add free-text tags (`P` pass, `F` fail, `S` skip, arrows to navigate, `Cmd/Ctrl+Z` to undo).
- **Export** your labels as JSONL or CSV when you're done.

This kind of structured review is **open coding** (free-text notes on each example) and **error analysis** (finding the recurring patterns those notes reveal). The tool helps you do both without leaving the keyboard.

## Why this exists

Most existing labeling tools assume you already know how to do error analysis. This one teaches the method as you use it, so a PM doing their first eval can be productive on day one. The first 5 traces show coaching cards that explain Pass/Fail, tags vs notes, reversibility, and why the tool deliberately doesn't give you a fixed taxonomy upfront.

Once you've internalized the method, you don't have to graduate to a different tool. Open Settings, flip "I'm experienced", and the same app surfaces batch labeling, custom adapters, tool-call review, and similarity tools without changing the beginner experience anyone else sees.

## What's new in v3.0

The "tool grows with the user" release. Beginners get the v1/v2 experience untouched; an "I'm experienced" toggle in Settings unlocks four power features for serious practitioners. Full design notes in [RELEASE-NOTES-v3.0.md](./RELEASE-NOTES-v3.0.md).

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

Real trace data is never committed to this repo and is gitignored by default. Files are read in the browser; **nothing is uploaded anywhere**. Labels and session state live in your browser's IndexedDB - see [docs/save-model.md](./docs/save-model.md) for the full design.

## What v3.0 includes

For everyone:
- The full v1/v2.x labeling loop: wizard, keyboard-driven labeling, coaching arc, undo, tag management, autosave, JSONL/CSV export.
- A "how much longer?" estimate under the trace counter ("X traces left, ~Y min remaining"), computed from your recent labeling pace.
- An "I'm experienced" toggle in Settings. Flipping it on reveals the four power features below; flipping it off cleanly hides them.

For experienced practitioners, after flipping the toggle (some terminology below; the release notes explain each in plain language):

- **Batch labeling.** Tick a "Select for batch" checkbox on multiple traces, then apply Pass, Fail, or a tag to all of them at once. One-click undo for the whole batch.
- **Custom adapter.** If your trace files have an unusual shape, you can save a small piece of JSON that tells the wizard how to read them, so the wizard doesn't have to ask each time. (Power users who want code instead of JSON: that's coming in v3.1.)
- **Tool-call review.** When a trace shows the model calling functions (e.g. `search_hotels`, `send_email`), you can mark each call as the right call, wrong call, or skip. Roll-up shows in the trace header. Informational only - it does not auto-set the trace's overall verdict.
- **Similarity highlighting.** Click "Show similar traces" to find others that look like the one you're on. Useful for spotting clusters of the same failure mode.

Full v3.0 change list and design notes in [RELEASE-NOTES-v3.0.md](./RELEASE-NOTES-v3.0.md).

## Earlier versions

- v2.1 (post-launch review bundle): right-panel role clarification, modal a11y, state-freshness fixes for rapid keyboard labeling, native dialog replacement, coaching-arc polish. See [docs/ux-research-note.md](./docs/ux-research-note.md) §8.
- v2.0 (launch): wizard for real-world envelope shapes and nested chat with tool calls; 5-card teaching arc with milestones at 25/50/100; template-driven tag seeding; tag management, filtered navigation, random sample; IndexedDB autosave; JSONL/CSV export. See [RELEASE-NOTES-v2.0.md](./RELEASE-NOTES-v2.0.md).

## Roadmap

- **v3.1:** code-based custom adapter (write a TypeScript file in the repo instead of a JSON object) - companion to v3.0's JSON adapter. SQLite storage backend if v3.0 IndexedDB hits scale limits.
- **v4+:** open. We are deliberately not building bridges to other eval platforms (Braintrust, LangSmith, Phoenix). The intent is "stay and grow inside Trace Annotator," not "use this until you're ready for the real thing." See [open issues](../../issues).

## License

MIT, see [LICENSE](LICENSE).
