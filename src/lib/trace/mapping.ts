import type { MappingConfig, ParseResult, Trace } from "./types";

const KNOWN_ID_FIELDS = ["id", "trace_id", "uuid"];
const KNOWN_INPUT_FIELDS = [
  "query",
  "input",
  "prompt",
  "user_message",
  "question",
];
const KNOWN_OUTPUT_FIELDS = [
  "response",
  "output",
  "completion",
  "assistant_message",
  "answer",
];

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

export function autoRecognize(fields: string[]): MappingConfig | null {
  const lower = fields.map((f) => f.toLowerCase());
  const inputField = findByPriority(lower, fields, KNOWN_INPUT_FIELDS);
  const outputField = findByPriority(lower, fields, KNOWN_OUTPUT_FIELDS);
  if (!inputField || !outputField) return null;
  const idField = findByPriority(lower, fields, KNOWN_ID_FIELDS);
  return {
    idField,
    inputField,
    outputField,
    metadataPassthrough: true,
  };
}

function looksLikeMessageList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item !== null &&
      typeof item === "object" &&
      "role" in item &&
      "content" in item,
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

export function applyMapping(
  rows: Record<string, unknown>[],
  config: MappingConfig,
): ParseResult<Trace[]> {
  const out: Trace[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const inputValue = row[config.inputField];
    const outputValue = row[config.outputField];
    if (inputValue === undefined && outputValue === undefined) {
      return {
        ok: false,
        error: `Row ${i + 1} is missing both "${config.inputField}" and "${config.outputField}".`,
      };
    }
    if (
      looksLikeMessageList(inputValue) ||
      looksLikeMessageList(outputValue)
    ) {
      return {
        ok: false,
        error:
          `Row ${i + 1} appears to contain multi-turn messages. ` +
          `v1 supports single-turn traces only. Multi-turn support is tracked as a separate issue.`,
      };
    }
    if (
      (inputValue !== null && inputValue !== undefined && typeof inputValue !== "string") ||
      (outputValue !== null && outputValue !== undefined && typeof outputValue !== "string")
    ) {
      return {
        ok: false,
        error:
          `Row ${i + 1}: "${config.inputField}" and "${config.outputField}" must be text. ` +
          `Got a non-string value. Pick a different field, or convert it before loading.`,
      };
    }
    const id = config.idField
      ? stringifyId(row[config.idField]) || String(i + 1)
      : String(i + 1);
    const trace: Trace = {
      id,
      input: [{ role: "user", content: (inputValue as string) ?? "" }],
      output: [{ role: "assistant", content: (outputValue as string) ?? "" }],
    };
    if (config.metadataPassthrough) {
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
    out.push(trace);
  }
  return { ok: true, value: out };
}
