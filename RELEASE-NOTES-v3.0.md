# Trace Annotator v3.0

> New here? **Trace Annotator** is a browser-based tool for reading LLM outputs and labeling what worked or failed. It teaches the open-coding method as a beginner uses it, and now grows into power tools when you're ready. Quick overview in the [README](./README.md).

The "tool grows with the user" release. v3 is the same product as v1 and v2 with the same wedge (teach the method as you use it for new PMs). The new piece: an explicit "I'm experienced" toggle in Settings unlocks four power features for serious practitioners. Beginners see the v1/v2 experience untouched.

## The hero moment

Open Settings, flip "I'm experienced (show power features)", and the same app you've been labeling in gains four new tools without the beginner experience changing for anyone else:

- A "Select for batch" checkbox on every trace, plus a Bulk action panel for applying Pass, Fail, or a tag to many traces at once
- A custom adapter section in Settings, so you can paste a JSON config and have the wizard skip its mapping step on future loads
- A Tool calls panel for marking each function call in a trace as right, wrong, or skip
- A "Show similar traces" button that surfaces the top 5 traces most like the one you're on

Toggle off any time to return to the beginner view. Nothing is destroyed.

## What's new in v3.0

### Mode toggle (foundation, applies to everyone)

- **What you'll see:** A new "Mode" section at the top of Settings with a single toggle: "I'm experienced (show power features)". A small "Experienced" pill appears in the top bar when the toggle is on; click the pill to jump back to Settings and flip it off.
- **What changes for beginners:** Nothing. The default is novice mode and the v1/v2 flow is byte-for-byte unchanged.
- **What's under the hood:** The choice persists across sessions in localStorage (`ta:mode:v1`). The CLAUDE.md design principles get a v3 amendment: rules apply in novice mode; experienced mode unlocks flexibility for users who explicitly opt in.

### Time-based progress estimation (#42, applies to everyone)

- **What you'll see:** A new subline appears under "X of Y labeled" once you've labeled around five traces: "12 traces left, ~6 min remaining". It's hidden when there isn't enough signal yet.
- **How it's computed:** A rolling median of the time you actually spent on the last twenty labels. Pauses over five minutes are filtered out (you went to lunch, the median shouldn't lie about your pace), and bulk-labeled traces are also excluded so a Pass-all-50 doesn't crash the average.

### Batch labeling (#36, experienced only)

- **What you'll see:** A "Select for batch" checkbox in every trace's header, a "Select all matching ({count})" button next to it, and a Bulk action panel in the right sidebar once you've selected one or more traces. The panel lets you apply Pass, Fail, or a tag to every selected trace.
- **Safety net:** If "Pass all" or "Fail all" would overwrite traces that already have a different verdict, you'll see a confirmation dialog naming the count before anything changes. Cmd/Ctrl+Z reverts the entire batch in one step.
- **Visual differentiation:** Bulk Pass / Fail buttons are outline style (white background with green/red text) so you can't mistake them for the per-trace solid Pass / Fail one section below.

### Custom adapter (#16 part 1, experienced only - JSON only in v3.0; code-based path comes in v3.1)

- **What you'll see:** A new "Custom adapter (JSON)" section in Settings. Paste a JSON object describing how your file maps to the internal trace shape, click Validate, then Save. Subsequent file loads skip the wizard's mapping step entirely.
- **When it doesn't fit:** If a saved adapter doesn't match the file you load (file shape changed, JSON broken), the wizard appears with a red alert and a "Clear adapter" button so you can recover in one click.
- **What goes in the JSON:** A superset of the wizard's normal mapping config (`idField`, `inputField`, `outputField`, `metadataPassthrough`, `roleAliases`), plus optional dot-notation for nested objects (e.g. `"data.messages"`). Prototype-key paths like `__proto__.foo` are rejected at save time.

### Tool-call correctness review (#37 part 1, experienced only)

- **What you'll see:** When a trace contains tool calls (the model invoking a function like `search_hotels` or `send_email`), a new Tool calls panel appears in the right sidebar. Each call has its name, a short args preview, and three buttons: Right, Wrong, Skip. A "tool calls: 2/3" indicator shows in the trace header.
- **Important:** The roll-up indicator is **informational only.** Marking every tool call right does not auto-set the trace verdict. A reviewer can still mark the trace Fail (or Pass with one wrong call) - the verdict and the tool-call review are independent surfaces with independent meanings.
- **Multi-call support:** A single message can contain multiple parallel tool calls (OpenAI tool_calls is an array). All calls are now extracted and reviewable - earlier draft code only captured the first.

### Wizard improvements (applies to everyone)

- **What you'll see:** When auto-detection cannot place your file, the manual mapping step now shows a blue "Detected paths" panel listing every dotted path that resolves to a message array, with badges noting count and whether it has an assistant turn. One click fills the field. A separate "First row structure" expandable panel shows the shape of your file as an indented tree so you do not have to crack open the JSON file by hand.
- **Smarter auto-detection.** The wizard now also looks one level *into* top-level objects to find message arrays. OpenAI-shaped files where messages are nested inside `request` and `response` wrappers (the most common shape in the wild) are auto-detected without any typing.
- **More diagnostic errors.** When a chosen field cannot be turned into messages, the error names the actual shape of the value (e.g. "request is an object with keys: messages") instead of "got an unexpected value type", and proposes a concrete next step.

### Similarity highlighting (#37 part 2, experienced only)

- **What you'll see:** A "Show similar traces" button in the right sidebar (visible when total traces > 1). Click it; after a brief computation, the top 5 most similar traces appear with their first user-message preview and a similarity score. Click any result to jump to it.
- **How it's computed:** TF-IDF + cosine similarity over the trace's combined text. Picked over an embedding-based model because it ships with zero bundle cost and is "good enough" for surface use.
- **What's not yet:** No abort or progress bar on long files. If you have ~5000+ traces and similarity feels slow, hit Cancel by navigating away. We'll move the index build to a Web Worker in v3.1.

## What's not in v3.0 (deferred to v3.1)

- **Repo-clone `adapter.ts` path** (#16 part 2). v3.0 ships JSON adapters; v3.1 adds a code-based adapter for power users who want logic in their transform.
- **SQLite storage backend** (#32). IndexedDB scales fine for v3.0 trace volumes (a few thousand traces). v3.1 revisits if v3.0 similarity at scale forces it.

## What was cut from v3 entirely

These issues were closed during v3 planning:

- **Braintrust export** (#17) and **external platform integrations** (#33). These are graduation paths and contradict the "stay and grow" v3 framing.
- **Multi-format rendering** (#34). Image/audio/video out of scope.
- **LLM judge training pipeline** (#44). A meaningfully different product (LLMOps tooling, not labeling tooling).
- **CLI + notebook widget** (#45). Drifts the audience toward ML engineers and data scientists; v3 stays focused on PMs.

## Migration from v2.x

Nothing to do. Existing IndexedDB labels load unchanged. The new optional `tool_call_reviews` field is absent on legacy rows. The "I'm experienced" toggle is off by default, so a v2 user who upgrades sees an identical app until they go looking for the toggle.

## How this release was scoped

Shaped by `/explore` Phase 1 (vision mode) - the v3 scope started as 10 candidate issues and converged to 5 in v3.0 + 2 in v3.1 + 5 cut. Phase 2 mapped out feasibility against the existing audit log, IndexedDB schema, and wizard flow before any code was written. Post-implementation review surfaced issues that landed in this version (StrictMode purity, multi-tool-call parsing, prototype-pollution guard, bulk-overwrite confirmation, multi-select-via-filter, similarity error handling and cache eviction, tool-call review a11y). A late round of in-browser testing surfaced the wizard's "nested message array" gap and the over-reliance on a `<datalist>` dropdown that did not pop on click in some browsers; both were fixed in the same release with the smarter auto-detection, the Detected paths panel, the structure preview, and the diagnostic error messages.
