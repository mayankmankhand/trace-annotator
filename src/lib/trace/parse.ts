import Papa from "papaparse";
import type { CsvParsed, ParseFormat, ParseResult } from "./types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

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

export function parseJSON(content: string): ParseResult<unknown[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    return { ok: false, error: `Could not parse JSON: ${(err as Error).message}` };
  }
  if (Array.isArray(parsed)) return { ok: true, value: parsed };
  if (parsed !== null && typeof parsed === "object") {
    return { ok: true, value: [parsed] };
  }
  return {
    ok: false,
    error:
      "Top-level JSON must be an array or object. Got " +
      (parsed === null ? "null" : typeof parsed) +
      ".",
  };
}

export function parseJSONL(content: string): ParseResult<unknown[]> {
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
  return { ok: true, value: out };
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
