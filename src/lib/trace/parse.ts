import Papa from "papaparse";
import type { CsvParsed, ParseFormat, ParseResult } from "./types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Files between this and MAX_FILE_BYTES show a "this might be slow" warning
// in the wizard but are still parsed. Below this, no warning.
export const SLOW_FILE_BYTES = 5 * 1024 * 1024;

// Recognized wrapper keys for the "envelope" pattern: a top-level object that
// holds the trace array under one well-known key. Order matters; we pick the
// first match. See docs/supported-inputs.md.
export const ENVELOPE_KEYS = ["traces", "data", "records"] as const;
export type EnvelopeKey = (typeof ENVELOPE_KEYS)[number];

export type Envelope = {
  unwrappedFrom: EnvelopeKey | null;
  rows: unknown[];
};

// Strip a recognized envelope wrapper. Returns the inner array plus which key
// the wrapper used (so the wizard can show that in the confidence banner).
// If the input is already an array or the wrapper key is unrecognized, no
// unwrap happens and the caller falls through to error or manual mapping.
export function unwrapEnvelope(parsed: unknown): ParseResult<Envelope> {
  if (Array.isArray(parsed)) {
    return { ok: true, value: { unwrappedFrom: null, rows: parsed } };
  }
  if (parsed === null || typeof parsed !== "object") {
    return {
      ok: false,
      error:
        "Top-level JSON must be an array or an object. Got " +
        (parsed === null ? "null" : typeof parsed) +
        ".",
    };
  }
  const obj = parsed as Record<string, unknown>;
  for (const key of ENVELOPE_KEYS) {
    if (key in obj && Array.isArray(obj[key])) {
      return {
        ok: true,
        value: { unwrappedFrom: key, rows: obj[key] as unknown[] },
      };
    }
  }
  // No recognized wrapper. Treat the whole object as a single trace - the v1
  // behavior. Lets users with one-record files still get through.
  return { ok: true, value: { unwrappedFrom: null, rows: [obj] } };
}

export function detectFormat(filename: string, content: string): ParseFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".jsonl") || lower.endsWith(".ndjson")) return "jsonl";
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";

  const trimmed = content.trimStart();
  const firstChar = trimmed[0];
  if (firstChar === "[") return "json";
  if (firstChar === "{" && trimmed.includes("\n{")) return "jsonl";
  if (firstChar === "{") return "json";
  return "csv";
}

export type ParsedJSON = {
  rows: unknown[];
  unwrappedFrom: EnvelopeKey | null;
};

export function parseJSON(content: string): ParseResult<ParsedJSON> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return { ok: false, error: `Could not parse JSON: ${(err as Error).message}` };
  }
  const env = unwrapEnvelope(parsed);
  if (!env.ok) return env;
  return {
    ok: true,
    value: { rows: env.value.rows, unwrappedFrom: env.value.unwrappedFrom },
  };
}

export function parseJSONL(content: string): ParseResult<ParsedJSON> {
  const lines = content.split(/\r?\n/);
  const out: unknown[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === "") continue;
    try {
      out.push(JSON.parse(line));
    } catch (err) {
      const snippet = line.length > 80 ? line.slice(0, 80) + "..." : line;
      return {
        ok: false,
        error: `Line ${i + 1} is not valid JSON (${(err as Error).message}). Saw: ${snippet}`,
      };
    }
  }
  if (out.length === 0) {
    return { ok: false, error: "File is empty or contains no JSON objects." };
  }
  // JSONL files don't have top-level envelopes; each line is a row.
  return { ok: true, value: { rows: out, unwrappedFrom: null } };
}

export function parseCSV(content: string): ParseResult<CsvParsed> {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    const where =
      typeof first.row === "number" ? ` at row ${first.row + 1}` : "";
    return { ok: false, error: `CSV parse error${where}: ${first.message}` };
  }
  const headers = result.meta.fields ?? [];
  if (headers.length === 0) {
    return { ok: false, error: "CSV has no header row." };
  }
  const renamed = result.meta.renamedHeaders;
  if (renamed && Object.keys(renamed).length > 0) {
    const original = Array.from(new Set(Object.values(renamed)));
    return {
      ok: false,
      error: `CSV has duplicate header(s): ${original.join(", ")}. Rename them in your file so each column is unique.`,
    };
  }
  if (result.data.length === 0) {
    return { ok: false, error: "CSV has a header row but no data rows." };
  }
  return { ok: true, value: { headers, rows: result.data } };
}

export function checkFileSize(bytes: number): ParseResult<true> {
  if (bytes > MAX_FILE_BYTES) {
    const mb = (bytes / (1024 * 1024)).toFixed(1);
    const cap = MAX_FILE_BYTES / (1024 * 1024);
    return {
      ok: false,
      error: `File is ${mb} MB. The current limit is ${cap} MB.`,
    };
  }
  return { ok: true, value: true };
}
