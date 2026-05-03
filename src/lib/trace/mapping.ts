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

  // Fall back to flat input/output recognition.
  const inputField = findByPriority(lower, fields, KNOWN_INPUT_FIELDS);
  const outputField = findByPriority(lower, fields, KNOWN_OUTPUT_FIELDS);
  if (!inputField || !outputField) return null;
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
      const value = row[config.inputField];
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
            `Row ${i + 1}: "${config.inputField}" must be a message array (objects with "role" and "content"). ` +
            `Got an unexpected value type.`,
        };
      }
      const { input, output } = splitMessages(all);
      const id = config.idField
        ? stringifyId(row[config.idField]) || String(i + 1)
        : String(i + 1);
      const trace: Trace = { id, input, output };
      attachMetadata(trace, row, config);
      out.push(trace);
      continue;
    }

    const inputValue = row[config.inputField];
    const outputValue = row[config.outputField];
    if (inputValue === undefined && outputValue === undefined) {
      return {
        ok: false,
        error: `Row ${i + 1} is missing both "${config.inputField}" and "${config.outputField}".`,
      };
    }
    const inputMessages = toMessages(inputValue ?? "", "user", aliases);
    const outputMessages = toMessages(outputValue ?? "", "assistant", aliases);
    if (!inputMessages || !outputMessages) {
      return {
        ok: false,
        error:
          `Row ${i + 1}: "${config.inputField}" and "${config.outputField}" must be text or message arrays. ` +
          `Got an unexpected value type. Pick a different field, or convert it before loading.`,
      };
    }
    const id = config.idField
      ? stringifyId(row[config.idField]) || String(i + 1)
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
