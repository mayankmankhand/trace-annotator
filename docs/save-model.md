# Save and persistence model (v2.0)

## TL;DR

Labels and session state live in **IndexedDB** in the user's browser. The user owns them. Manual **JSONL export** is the portable artifact the user shares or analyzes elsewhere. There is no server-side label file in v2.0.

## What gets stored, where

| Data | Where | Why |
|---|---|---|
| Label rows (verdict, tags, note, timestamp, trace_id) | IndexedDB, keyed by file fingerprint | Bulk data, needs structured queries, persists across reloads |
| Session state (filename, last viewed trace index, savedAt) | IndexedDB, single record per file fingerprint | Drives the "Resume?" prompt |
| Wizard config (last-used field mapping) | localStorage | Small, simple key-value, used on every wizard load |
| Tag taxonomy / recent tags | Derived from label rows in IndexedDB | Source of truth is the label rows themselves |
| Coaching dismissal flags | localStorage | Cross-file UI preference, not data |

## Why IndexedDB

We considered four storage options.

| Option | Pros | Cons |
|---|---|---|
| **IndexedDB** ✅ | Universal browser support, large capacity, structured queries, persists across sessions, survives tab crash | Async API, data trapped in browser until exported |
| File System Access API | Real files on user's disk, aligns with "BYO data" | Chromium-only (Firefox absent, Safari limited), clunky permission prompts |
| localStorage | Trivial API | 5-10 MB cap, synchronous I/O on main thread |
| Server-side file (`labels/session.jsonl` via Next.js API routes) | Easy to inspect with `cat` | Contradicts "browser-based local app" framing, multi-tab races, tied to dev server cwd |

IndexedDB wins on universal support and capacity. The "data trapped in browser" downside is solved by the JSONL export button - the user can pull their labels out any time.

The v1 behavior (server-side file writes) is **removed** in v2.0. No more `/api/save-labels`, `/api/load-labels`, `/api/session-state`. They were always a bit of an architectural lie - the app pretends to be browser-only but quietly wrote files to the dev host.

## Autosave behavior

- **Labels:** debounced 500ms after a label change. Indicator shows "Saving..." during the debounce window, then "Saved at HH:MM:SS".
- **Session state (last viewed trace):** debounced 300ms after navigation. Same indicator.
- **Wizard config:** written immediately on wizard completion.
- On any save failure (quota exceeded, browser disabled storage), the indicator switches to "Save error - export your labels" with a one-line explanation. Export remains available.

## Export format

Identical to v1: JSONL of `LabelRow` objects.

```jsonl
{"trace_id":"trace_001","verdict":"pass","tags":["incomplete-answer"],"note":"...","labeled_at":"2026-05-03T11:39:47.689Z"}
```

CSV is also offered for users who want to open in a spreadsheet. Same row schema, tags joined by semicolon.

## Resume behavior

When the user loads a file, the app computes a **file fingerprint**:

```
fingerprint = sha256(filename + ":" + traceCount + ":" + firstTraceId + ":" + lastTraceId)
```

If a saved session matches that fingerprint, the app offers "Resume? You labeled N of M traces. Last viewed trace #X." The user picks "Resume from trace X" or "Start fresh." Choosing "Start fresh" archives the old fingerprint's data under a timestamped key (so it's recoverable, not lost) and starts a new session.

This catches the obvious cases:
- Same file uploaded twice → resume offered.
- Same filename but different content (e.g. user re-exported their dataset) → fingerprint differs, no resume offered.
- File renamed → fingerprint differs (we include filename), no resume offered.

It does **not** catch:
- A file that grows over time (e.g. a streaming pipeline). The trace count changes, fingerprint changes. Acceptable: the user can't resume across versions of an evolving dataset, but that's a v3 concern.

## Crash recovery

IndexedDB writes are durable. On reload, the app:

1. Loads the last session state from IndexedDB.
2. If the user was in the wizard, returns to the wizard.
3. If the user was annotating, shows the resume prompt for that file.

If the user has **not** uploaded a file again yet (no fingerprint match), the resume prompt does not auto-trigger - the user needs to upload to identify which file to resume. We don't persist the file's content itself; the user re-uploads.

## What happens if the source file is moved or deleted

The user uploads the file each time (no persistent file handle in v2.0). If the file is moved or deleted, the user simply cannot upload it again. Labels are still in IndexedDB, accessible via the export button. We surface this in the resume prompt: "Found a saved session for `filename.json`. Upload that file to resume." If the user uploads a different file, no match, no resume prompt.

## What's NOT in v2.0

- File System Access API direct integration (deferred; would let labels write to a sidecar file next to the source). Reconsidered for v2.1 if real users complain about the export-and-re-import dance.
- IndexedDB backup/restore UI (today: export JSONL is the backup; tomorrow: maybe a "restore from JSONL" import).
- Multi-device sync (out of scope for a local tool).
- Server-side persistence (explicitly removed - see above).

## Visible UI

- **Save indicator** in the top bar, right side: "Saved", "Saving...", or "Save error".
- **Export button** in the top bar, always visible (no longer hidden behind a hover dropdown).
- **Resume prompt** when a fingerprinted match is found on file upload.
