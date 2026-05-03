import Papa from "papaparse";
import type { LabelRow } from "./types";

export function toJSONL(rows: LabelRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
}

export function toCSV(rows: LabelRow[]): string {
  const flat = rows.map((r) => ({
    trace_id: r.trace_id,
    verdict: r.verdict ?? "",
    tags: r.tags.join("|"),
    note: r.note,
    labeled_at: r.labeled_at,
  }));
  return Papa.unparse(flat);
}

export type ExportFormat = "jsonl" | "csv";

export function serialize(rows: LabelRow[], format: ExportFormat): string {
  return format === "csv" ? toCSV(rows) : toJSONL(rows);
}

export function mimeType(format: ExportFormat): string {
  return format === "csv" ? "text/csv" : "application/x-ndjson";
}

export function fileName(format: ExportFormat): string {
  const ts = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return `labels-${ts}.${format === "csv" ? "csv" : "jsonl"}`;
}
