import type { MappingConfig, Message, ParseResult, Role, RoleAlias, Trace } from "./types";

const KNOWN_ID_FIELDS = ["id", "trace_id", "uuid"];
const KNOWN_INPUT_FIELDS = [
  "query",
  "input",
  "prompt",
  "user_message",
  "question",
  "submitted_text",
];
const KNOWN_OUTPUT_FIELDS = [
  "response",
  "output",
  "completion",
  "assistant_message",
  "answer",
  "model_text",
];
// Recognized field name for a nested chat conversation. Anything matching
// this name shape with role/content children is treated as the full chat.
const KNOWN_MESSAGES_FIELD = "messages";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function collectFieldNames(
  rows: Record<string, unknown>[],
): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!UNSAFE_KEYS.has(k)) seen.add(k);
    }
  }
  return Array.from(seen);
}

function findByPriority(
  fieldsLower: string[],
  fields: string[],
  known: string[],
): string | null {
  for (const candidate of known) {
    const idx = fieldsLower.indexOf(candidate);
    if (idx !== -1) return fields[idx];
  }
  return null;
}

// AutoRecognition explains what the wizard detected so it can show a
// confidence banner. The detected mapping is the same v1 MappingConfig
// shape; the extras describe the auto-detection so the UI can surface
// "Found N traces using `traces[]` and `messages[]`. Does this look right?"
export type AutoRecognition = {
  config: MappingConfig;
  // Whether the input/output came from a nested messages[] array rather
  // than separate flat fields. UI uses this to show a different banner.
  usedNestedMessages: boolean;
};

export function autoRecognize(
  fields: string[],
  sampleRow?: Record<string, unknown>,
): AutoRecognition | null {
  const lower = fields.map((f) => f.toLowerCase());
  const idField = findByPriority(lower, fields, KNOWN_ID_FIELDS);

  // Try nested messages[] first - it's the more specific shape and avoids
  // the ambiguity of "is `question` the user message or a metadata field?"
  // when both messages[] and flat fields exist.
  const messagesIdx = lower.indexOf(KNOWN_MESSAGES_FIELD);
  if (messagesIdx !== -1 && sampleRow) {
    const messagesField = fields[messagesIdx];
    const value = sampleRow[messagesField];
    if (looksLikeMessageList(value)) {
      // Use the messages field for both input and output. applyMapping then
      // splits them: everything except the trailing assistant message is
      // input; the trailing assistant message is output.
      return {
        config: {
          idField,
          inputField: messagesField,
          outputField: messagesField,
          metadataPassthrough: true,
        },
        usedNestedMessages: true,
      };
    }
  }

  // Try flat input/output field-name match next (two-field mode). Files
  // with explicit top-level `input` and `output` message arrays (or any
  // pair from KNOWN_INPUT_FIELDS / KNOWN_OUTPUT_FIELDS) belong here, not
  // in the deeper-nested check below. Doing this before the nested check
  // preserves v1/v2 behavior for those shapes.
  const inputField = findByPriority(lower, fields, KNOWN_INPUT_FIELDS);
  const outputField = findByPriority(lower, fields, KNOWN_OUTPUT_FIELDS);
  if (inputField && outputField) {
    return {
      config: {
        idField,
        inputField,
        outputField,
        metadataPassthrough: true,
      },
      usedNestedMessages: false,
    };
  }

  // Try truly-nested messages[] paths (path contains a dot). Catches the
  // OpenAI-shaped request/response files where top-level fields are
  // objects wrapping a `messages` array. We only consider dotted paths so
  // we don't shadow the flat-field detection above. Prefer the path whose
  // array contains an assistant turn (that's the full conversation); fall
  // back to the first detected path otherwise.
  if (sampleRow) {
    const nested = findMessageArrayPaths(sampleRow).filter((c) =>
      c.path.includes("."),
    );
    const withAssistant = nested.find((c) => c.hasAssistant);
    const picked = withAssistant ?? nested[0];
    if (picked) {
      return {
        config: {
          idField,
          inputField: picked.path,
          outputField: picked.path,
          metadataPassthrough: true,
        },
        usedNestedMessages: true,
      };
    }
  }

  return null;
}

function looksLikeMessageList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return (
    value.length > 0 &&
    value.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        "role" in item &&
        "content" in item,
    )
  );
}

// Walk a row to find every dotted path whose value looks like a list of
// {role, content} message objects. Bounded depth so we don't recurse into
// arbitrarily deep structures. Used to:
//   1. Power smarter auto-recognition when top-level fields are wrappers
//      (e.g. OpenAI-shaped request/response objects) rather than message
//      arrays themselves.
//   2. Show detected paths to the user in the wizard's mapping step so
//      they can click to fill instead of guessing the right path.
export function findMessageArrayPaths(
  row: Record<string, unknown>,
  maxDepth = 4,
): Array<{ path: string; size: number; hasAssistant: boolean; hasUser: boolean }> {
  const out: Array<{
    path: string;
    size: number;
    hasAssistant: boolean;
    hasUser: boolean;
  }> = [];
  function walk(value: unknown, prefix: string, depth: number) {
    if (depth > maxDepth) return;
    if (Array.isArray(value)) {
      if (looksLikeMessageList(value)) {
        const arr = value as Array<{ role: string }>;
        out.push({
          path: prefix,
          size: arr.length,
          hasAssistant: arr.some((m) => m.role === "assistant"),
          hasUser: arr.some((m) => m.role === "user"),
        });
      }
      // Don't recurse into array items; message arrays are leaves for
      // our purposes, and walking deep into other arrays risks noisy
      // false matches.
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (UNSAFE_KEYS.has(k)) continue;
      walk(v, prefix ? `${prefix}.${k}` : k, depth + 1);
    }
  }
  walk(row, "", 0);
  return out;
}

// Read a field from a row by name OR by dot-notation path. Plain field names
// (no dots) take the fast path of direct property access so existing v1/v2
// mapping behavior is unchanged. Dotted names walk the object one segment at
// a time. Used by the JSON DSL adapter (v3, #16) so power users can target
// nested fields without flattening their file first.
//
// Security: every segment is checked against UNSAFE_KEYS so a pasted adapter
// like {"inputField": "messages.constructor.prototype"} can't reach into
// prototypes and pollute global state. Returns undefined (matching the
// "missing field" path) when an unsafe segment is encountered.
//
// Limitation: if a row genuinely has a top-level key with a "." in its name,
// the dotted lookup will miss it. That's exotic; treat it as a known edge.
export function getFieldByPath(
  row: Record<string, unknown>,
  path: string,
): unknown {
  if (!path.includes(".")) {
    if (UNSAFE_KEYS.has(path)) return undefined;
    return row[path];
  }
  const parts = path.split(".");
  let cur: unknown = row;
  for (const p of parts) {
    if (UNSAFE_KEYS.has(p)) return undefined;
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

// Reject any field path whose segments include __proto__, constructor, or
// prototype. Returns null if safe, or an error message if unsafe. Exported
// so the adapter DSL parser can validate at save time and the user gets
// feedback before the path silently misses at load time.
export function validateFieldPath(path: string): string | null {
  const parts = path.split(".");
  for (const p of parts) {
    if (UNSAFE_KEYS.has(p)) {
      return `Field path "${path}" contains unsafe segment "${p}". Reserved JavaScript prototype keys (${Array.from(UNSAFE_KEYS).join(", ")}) cannot be used.`;
    }
  }
  return null;
}

// Human-readable description of an arbitrary value, used to make the
// "wrong shape" error in applyMapping diagnostic. The user otherwise sees
// only "got an unexpected value type" with no hint about WHAT type was
// actually found, which makes it impossible to know whether to (a) pick
// a different field, (b) use dot-notation to dig into a nested object,
// or (c) convert the file before loading.
function describeValue(value: unknown): string {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "an empty array";
    const sample = value[0];
    if (sample === null || sample === undefined) {
      return `an array of ${value.length} (first item is ${sample === null ? "null" : "undefined"})`;
    }
    if (typeof sample === "object") {
      const keys = Object.keys(sample as Record<string, unknown>).slice(0, 5);
      return `an array of ${value.length} object${value.length === 1 ? "" : "s"} (first has keys: ${keys.join(", ") || "(none)"})`;
    }
    return `an array of ${value.length} ${typeof sample}${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const shown = keys.slice(0, 6).join(", ");
    const more = keys.length > 6 ? `, and ${keys.length - 6} more` : "";
    return `an object with keys: ${shown || "(none)"}${more}`;
  }
  if (typeof value === "string") {
    if (value.length === 0) return "an empty string";
    const preview = value.length > 40 ? `${value.slice(0, 40)}...` : value;
    return `a ${value.length}-char string ("${preview}")`;
  }
  return `a ${typeof value} (${JSON.stringify(value).slice(0, 40)})`;
}

function stringifyId(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
}

function resolveRole(raw: string, aliases: RoleAlias[]): Role {
  const lower = raw.toLowerCase();
  for (const alias of aliases) {
    if (alias.from.toLowerCase() === lower) return alias.to;
  }
  const known: Role[] = ["user", "assistant", "system", "tool"];
  return known.includes(raw as Role) ? (raw as Role) : "assistant";
}

function toMessages(
  value: unknown,
  defaultRole: Role,
  aliases: RoleAlias[],
): Message[] | null {
  if (typeof value === "string") {
    return [{ role: defaultRole, content: value }];
  }
  if (looksLikeMessageList(value)) {
    // Each message keeps its content as a string. If `tool_calls` is present
    // on the message, we synthesize an extra entry with the tool calls
    // serialized as JSON so the tool-call renderer can pick it up.
    const out: Message[] = [];
    for (const raw of value as Array<{
      role: string;
      content: unknown;
      tool_calls?: unknown;
    }>) {
      const role = resolveRole(raw.role, aliases);
      const content =
        typeof raw.content === "string"
          ? raw.content
          : raw.content == null
            ? ""
            : JSON.stringify(raw.content);
      out.push({ role, content });
      if (Array.isArray(raw.tool_calls) && raw.tool_calls.length > 0) {
        // Render tool calls inline as their own assistant-side card. Wrapped
        // in `tool_calls` so the renderer's existing detection logic fires.
        out.push({
          role: "assistant",
          content: JSON.stringify({ tool_calls: raw.tool_calls }),
        });
      }
    }
    return out;
  }
  return null;
}

// Split a full messages[] conversation into input (everything up to the last
// assistant message) and output (the last assistant message). System
// messages are kept on the input side. Used when nested chat is detected
// and there's no separate output field.
function splitMessages(messages: Message[]): { input: Message[]; output: Message[] } {
  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }
  if (lastAssistantIdx === -1) {
    // No assistant turn at all - put everything in input, leave output empty.
    return { input: messages, output: [] };
  }
  return {
    input: messages.slice(0, lastAssistantIdx),
    output: messages.slice(lastAssistantIdx),
  };
}

export function applyMapping(
  rows: Record<string, unknown>[],
  config: MappingConfig,
): ParseResult<Trace[]> {
  const aliases = config.roleAliases ?? [];
  // When inputField === outputField, the mapping says "the whole conversation
  // lives in this one field". We split it into input/output by finding the
  // last assistant turn. See splitMessages.
  const fromSingleField = config.inputField === config.outputField;
  const out: Trace[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (fromSingleField) {
      const value = getFieldByPath(row, config.inputField);
      if (value === undefined) {
        return {
          ok: false,
          error: `Row ${i + 1} is missing "${config.inputField}".`,
        };
      }
      const all = toMessages(value, "user", aliases);
      if (!all) {
        return {
          ok: false,
          error:
            `Row ${i + 1}: "${config.inputField}" must be a message array (objects with "role" and "content" fields), but got ${describeValue(value)}. ` +
            `If your messages are nested inside this field, try a dotted path like "${config.inputField}.messages" in the manual mapping step or a custom adapter.`,
        };
      }
      const { input, output } = splitMessages(all);
      const id = config.idField
        ? stringifyId(getFieldByPath(row, config.idField)) || String(i + 1)
        : String(i + 1);
      const trace: Trace = { id, input, output };
      attachMetadata(trace, row, config);
      out.push(trace);
      continue;
    }

    const inputValue = getFieldByPath(row, config.inputField);
    const outputValue = getFieldByPath(row, config.outputField);
    if (inputValue === undefined && outputValue === undefined) {
      return {
        ok: false,
        error: `Row ${i + 1} is missing both "${config.inputField}" and "${config.outputField}".`,
      };
    }
    const inputMessages = toMessages(inputValue ?? "", "user", aliases);
    const outputMessages = toMessages(outputValue ?? "", "assistant", aliases);
    if (!inputMessages || !outputMessages) {
      // Diagnostic error so the user sees the actual shape of the field
      // they picked and has a concrete next step. The previous "got an
      // unexpected value type" was too generic to act on.
      const lines: string[] = [`Row ${i + 1}: cannot extract messages.`];
      if (!inputMessages) {
        lines.push(`  "${config.inputField}" is ${describeValue(inputValue)}.`);
      }
      if (!outputMessages) {
        lines.push(`  "${config.outputField}" is ${describeValue(outputValue)}.`);
      }
      lines.push(
        `Each field needs to be either plain text OR an array of objects with "role" and "content" (e.g. ` +
          `[{"role":"user","content":"hi"},{"role":"assistant","content":"hello"}]).`,
      );
      lines.push(
        `Common fix: if the messages are nested deeper (e.g. "${config.inputField}.messages" or "${config.inputField}.choices.0.message.content"), ` +
          `dot-notation paths work in the manual mapping step and in custom adapters.`,
      );
      return { ok: false, error: lines.join("\n") };
    }
    const id = config.idField
      ? stringifyId(getFieldByPath(row, config.idField)) || String(i + 1)
      : String(i + 1);
    const trace: Trace = {
      id,
      input: inputMessages,
      output: outputMessages,
    };
    attachMetadata(trace, row, config);
    out.push(trace);
  }
  // Trace IDs are the keys we annotate by. Duplicates would silently overwrite
  // each other's labels. Bail out with the row numbers so the user can fix the
  // file or pick a different ID field, rather than ship corrupt labels later.
  const dupeError = findDuplicateIdError(out);
  if (dupeError) return { ok: false, error: dupeError };
  return { ok: true, value: out };
}

function findDuplicateIdError(traces: Trace[]): string | null {
  const seen = new Map<string, number>();
  for (let i = 0; i < traces.length; i++) {
    const id = traces[i].id;
    const prev = seen.get(id);
    if (prev !== undefined) {
      return (
        `Two rows have the same trace id "${id}" (rows ${prev + 1} and ${i + 1}). ` +
        `Labels are stored per id, so duplicates would overwrite each other. ` +
        `Pick a different ID field in the wizard, or de-duplicate the file before loading.`
      );
    }
    seen.set(id, i);
  }
  return null;
}

function attachMetadata(
  trace: Trace,
  row: Record<string, unknown>,
  config: MappingConfig,
): void {
  if (!config.metadataPassthrough) return;
  const metadata: Record<string, unknown> = Object.create(null);
  const skip = new Set(
    [config.idField, config.inputField, config.outputField].filter(
      (f): f is string => f !== null,
    ),
  );
  for (const [k, v] of Object.entries(row)) {
    if (!skip.has(k) && !UNSAFE_KEYS.has(k)) metadata[k] = v;
  }
  if (Object.keys(metadata).length > 0) trace.metadata = metadata;
}
