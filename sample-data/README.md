# sample-data

Synthetic fixtures for testing the wizard, parser, and renderer. None of these contain real user data. Drop any of them into the app's wizard to see how it handles different shapes.

## Files

| File | Shape | What it stresses |
|---|---|---|
| `recipe-chatbot-results.json` | Top-level array of flat objects with `query` / `response` | Baseline: clean shape, auto-detect should work |
| `synthetic-chat-with-tools.json` | `{"traces": [...]}` envelope, nested `messages[]` with `role` / `content` / `tool_calls` | Real-world OpenAI-style chat + tool calls. The wizard should unwrap the envelope, render multi-turn chat, and show tool calls as monospace cards |
| `synthetic-short-chats.jsonl` | JSONL, one short Q/A per line | Smallest happy-path shape. Tests the JSONL detection branch and short chat rendering |
| `synthetic-long-multi-turn.json` | Bare JSON array, `input[]` and `output[]` are message arrays of varying length (1-7 turns) | Multi-turn chat rendering. Tests that long conversations don't break the layout |
| `synthetic-rag-grounded.json` | `{"data": [...]}` envelope, fields named `question` / `retrieved_context` / `answer` | RAG pattern. Tests envelope unwrap with the `data` key. The `retrieved_context` field is metadata; the user labels the `answer` |
| `synthetic-ambiguous-fields.json` | `{"records": [...]}` envelope, fields named `submitted_text` / `model_text` (no recognized synonyms) | Forces the manual mapping fallback. Auto-detect should fail and the wizard should ask the user to map fields |

## How fixtures relate to v2 work

- **Wizard robustness (#46):** every fixture above must load through the wizard end-to-end. Each one stresses a different shape.
- **Coaching expansion (#43):** `synthetic-chat-with-tools.json` and `synthetic-short-chats.jsonl` are the natural fixtures to walk new PMs through the first 5 coaching cards.
- **Multi-turn rendering (#30):** `synthetic-long-multi-turn.json` is the regression fixture for multi-turn chat layout.

## Adding new fixtures

Keep them small (under ~50 traces). Synthetic only. No real user content. If you copy structure from a real provider's output, paraphrase the message bodies so nothing real ends up in the public repo.
