"use client";

import type { Trace } from "@/lib/trace/types";

// SummarizerRenderer (issue #53). Two-column layout: source doc on the
// left, summary on the right. The only renderer in the system that breaks
// the single-column trace pane on purpose - putting source and summary
// side by side lets the reviewer judge faithfulness without scrolling
// back and forth.

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function deriveSource(trace: Trace): string {
  const meta = (trace.metadata ?? {}) as Record<string, unknown>;
  const fromMeta =
    asString(meta.source_doc) ??
    asString(meta.source) ??
    asString(meta.article) ??
    asString(meta.input_text);
  if (fromMeta) return fromMeta;
  return trace.input.map((m) => m.content).join("\n\n");
}

function deriveSummary(trace: Trace): string {
  const meta = (trace.metadata ?? {}) as Record<string, unknown>;
  const fromMeta = asString(meta.summary) ?? asString(meta.output_text);
  if (fromMeta) return fromMeta;
  return trace.output.map((m) => m.content).join("\n\n");
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function SummarizerRenderer({ trace }: { trace: Trace }) {
  const source = deriveSource(trace);
  const summary = deriveSummary(trace);

  return (
    <div className="summ-grid">
      <div className="summ-col">
        <div className="summ-col__head">
          <span className="role-pill" data-role="user">
            source
          </span>
          <span className="summ-col__meta">{wordCount(source)} words</span>
        </div>
        <div className="summ-col__body">{source}</div>
      </div>
      <div className="summ-col">
        <div className="summ-col__head">
          <span className="role-pill" data-role="assistant">
            summary
          </span>
          <span className="summ-col__meta">{wordCount(summary)} words</span>
        </div>
        <div className="summ-col__body">{summary}</div>
      </div>
    </div>
  );
}
