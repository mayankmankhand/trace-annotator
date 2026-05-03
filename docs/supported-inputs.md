# Supported input shapes (v2.0)

The wizard auto-detects the shapes below. If your file matches one of them, you should see a confidence banner like "Found N traces using `traces[]` and `messages[]`. Does this look right?" and skip straight to preview. If auto-detect fails, you fall through to the manual mapping step.

## Top-level container shapes

The file may be:

- A bare JSON array: `[ {...}, {...} ]`
- A JSONL file (one JSON object per line)
- A JSON object that wraps the array under one of these keys:
  - `traces`
  - `data`
  - `records`
- A CSV with a header row

For wrapped objects, the wizard unwraps the first array-valued key it recognizes from the list above. If your wrapper key is something else, the wizard will fail open into the manual mapping step.

## Per-trace shapes

Each trace must be a JSON object. The wizard accepts the following common patterns and tries to auto-recognize them:

### Flat input/output

```json
{
  "id": "trace_001",
  "query": "What time do you close?",
  "response": "We close at 9pm."
}
```

Recognized synonyms (case-insensitive):

- **id field:** `id`, `trace_id`, `uuid`
- **input field:** `query`, `input`, `prompt`, `user_message`, `question`, `submitted_text`
- **output field:** `response`, `output`, `completion`, `assistant_message`, `answer`, `model_text`

### Nested chat with `messages[]`

```json
{
  "id": "trace_001",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

The wizard splits `messages[]` into input (everything up to the last assistant message) and output (the last assistant message). System messages are preserved.

### Nested chat with `messages[]` plus tool calls

```json
{
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "...", "tool_calls": [...] },
    { "role": "tool", "tool_call_id": "...", "content": "..." },
    { "role": "assistant", "content": "..." }
  ]
}
```

Tool calls are extracted from the assistant message and rendered as full-width monospace cards. Tool results (role `"tool"`) render as their own cards.

### CSV

A standard CSV with a header row. Each column becomes a candidate field. The wizard tries to auto-recognize via the synonyms above, then falls back to manual mapping.

## Out of scope for v2.0

These will route to the manual mapping step or fail with guidance:

- Files with no `messages[]` and no recognized field synonyms (e.g. `{"submitted_text": "...", "model_text": "..."}` works because `submitted_text` and `model_text` are synonyms; `{"foo": "...", "bar": "..."}` would force manual mapping)
- Top-level wrapper keys other than `traces`, `data`, `records`
- Multimodal traces (images, audio). v3 territory (#34).
- Streaming traces or partial deltas. We expect full input/output pairs.
- Per-trace metadata so deeply nested it requires a JSONPath expression. Use the manual mapping step or pre-flatten with `jq`.

## File size

The wizard accepts files up to **25 MB**. Files between **5-25 MB** show a warning before parsing ("This is a large file, loading may be slow"). Files over 25 MB are rejected with a clear error and a suggestion to sample down. There is no virtualization in v2.0; if your file is very large, label a random sample and lift the cap in v2.1 if real demand appears.

## Examples in the repo

See `sample-data/README.md` for fixtures that exercise each shape:

- `recipe-chatbot-results.json` - flat array, recognized field names
- `synthetic-chat-with-tools.json` - `{"traces": [...]}` wrapper, nested `messages[]` with tool calls
- `synthetic-short-chats.jsonl` - JSONL, flat fields
- `synthetic-long-multi-turn.json` - bare array, `input[]` + `output[]` are message arrays
- `synthetic-rag-grounded.json` - `{"data": [...]}` wrapper, recognized field names
- `synthetic-ambiguous-fields.json` - `{"records": [...]}` wrapper, NOT recognized synonyms (forces manual mapping fallback)

## How to debug a file that won't load

1. Check the wizard error message - it tells you which step failed (parse, envelope detection, field recognition, mapping).
2. Try opening the file in a text editor to confirm it's valid JSON / JSONL.
3. If you see "Could not parse JSON", run `jq . your-file.json` from the command line - jq prints clear errors for malformed JSON.
4. If parsing succeeds but the wizard says "no fields could be recognized", it'll route you to manual mapping. Pick the right fields by hand.
5. If you're stuck, open an issue with a redacted snippet showing the file shape.
