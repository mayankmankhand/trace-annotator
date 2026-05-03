# Trace Annotator

An opinionated, open-source local web app for reviewing LLM (large language model) outputs and labeling what worked and what did not. Built for new product managers starting with evals.

## What it does

When you ship an LLM-powered feature, you need to look at lots of real outputs to spot the patterns of where it goes wrong. Trace Annotator gives you a clean keyboard-driven loop for doing that:

- Load your **LLM traces** (the recorded prompt, model output, and metadata for each call your app made) from a JSONL, JSON, or CSV file. A guided wizard maps your file's fields to the tool's internal trace shape, with no code editing required.
- Read each one rendered the way the end user would see it (chat bubble, email, etc.) instead of as a raw JSON blob.
- Mark it pass or fail and add a short reason. Reuse reasons you have used before so they accumulate into a list of failure modes.
- Export your labels as JSONL and feed them into an evaluator, a fine-tune, or a writeup.

This kind of structured review is sometimes called **open coding** (writing free-text notes on each example) and **error analysis** (looking for the recurring patterns those notes reveal). The tool helps you do both without leaving the keyboard.

## Why this exists

Most existing labeling tools assume you already know how to do error analysis. This one is built to teach the method as you use it, so a PM doing their first eval pass can be productive on day one.

## Try it with sample data

The repo ships with two synthetic fixtures:

- **`fixtures/sample-chat-traces.jsonl`** - 20 single-turn chat traces from a fictional travel booking assistant. Includes a mix of good responses and common failure modes (hallucinated facts, incomplete answers, overly verbose replies). Good for a first annotation session.
- **`sample-data/recipe-chatbot-results.json`** - 100 recipe assistant traces, an existing JSON array. Drop this into the wizard to see a larger dataset.

Drop either file into the wizard to see the loader and renderer work end to end without bringing your own data.

## Bring your own data

This is a BYO-data tool. Real trace data is never committed and is gitignored by default. The wizard reads your file in the browser; nothing is uploaded.

## Try it

```bash
git clone https://github.com/mayankmankhand/Observability.git
cd Observability
npm install
npm run dev
```

Then open http://localhost:3000 in your browser. The home page is the trace loader: drop a JSONL, JSON, or CSV file (or use the sample above) and walk the wizard. The labeling view itself is the next milestone, see [open issues](../../issues) for status.

## Status

Pre-v1, active development. The full v1 build list lives in [open issues](../../issues).

### Roadmap (post-v1)

Deferred to a future release: similarity highlighting, side-effect verification, batch labeling, SQLite storage option.

## License

MIT, see [LICENSE](LICENSE).
