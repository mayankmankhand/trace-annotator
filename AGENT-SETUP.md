# AI Agent Setup Instructions

This file is written for AI agents (Claude, ChatGPT, Cursor) with shell access. If a user asks you to set up Trace Annotator on their machine, follow the steps below exactly.

---

## What This Is

Trace Annotator is a local web app that helps new PMs do open coding and error analysis on LLM traces. The user runs it on their own laptop. No cloud, no login, no telemetry. Once it's running, the in-app wizard takes the user the rest of the way.

---

## Environment

Assume shell access on the user's machine. Use bash on macOS/Linux/WSL or PowerShell on native Windows. The user's machine needs:

- `node` >= 20
- `npm` (ships with Node)
- `git`

If any of those are missing, stop and tell the user which ones to install. Do not try to install them yourself.

---

## Setup Steps

### Step 1: Clone the repo

```bash
git clone https://github.com/mayankmankhand/trace-annotator.git
cd trace-annotator
```

### Step 2: Install dependencies

```bash
npm install
```

This may take 60-90 seconds. Expect a clean install with no warnings about missing peers.

### Step 3: Start the dev server

```bash
npm run dev
```

The server starts on `http://localhost:3000`. Tell the user to open that URL in their browser.

### Step 4: Hand off to the user

Once the server is running, the in-app wizard takes over:

1. Drop a JSONL, JSON, or CSV file of LLM traces into the dropzone.
2. The wizard auto-detects the shape, asks the user what kind of app it is (chatbot / RAG / summarizer / other), and renders the first trace as a preview.
3. The user clicks Confirm and starts labeling. First-run coaching cards explain what to do.

If the user has no file ready, tell them to try `sample-data/recipe-chatbot-results.json` from the repo - it's a clean fixture that takes them through the happy path.

Stop here. Do **not** try to label traces for the user. The whole point is for them to do open coding themselves.

---

## Troubleshooting

**Port 3000 in use:** ask the user to stop the conflicting process or run `PORT=3001 npm run dev`.

**`npm install` fails on a peer dep:** show the user the exact error and stop. Don't paper over it with `--force`.

**Browser shows a blank page:** this is almost always a stale build cache. Run `rm -rf .next` then `npm run dev` again.

**File upload fails:** check `docs/supported-inputs.md` in the repo for the documented supported shapes. If the user's file isn't covered, the wizard will route them to the manual mapping step.

---

## What This File Does Not Do

- It does not configure GPU/CUDA (Trace Annotator is browser-only, no models run locally).
- It does not set up API keys or `.env.local` (the app makes no outbound API calls; if `.env.local.example` exists, ignore it for now).
- It does not deploy to a production host. Trace Annotator is local-only by design and there are no plans for hosting.

When in doubt, run the dev server and open the browser. The in-app coaching is the documentation.
