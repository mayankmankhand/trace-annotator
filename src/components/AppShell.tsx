"use client";

import { useState } from "react";
import type { Trace } from "@/lib/trace/types";
import type { Annotations } from "./annotator/TraceView";
import type { LabelRow } from "@/lib/labels/types";
import { Wizard } from "./wizard/Wizard";
import { TraceView } from "./annotator/TraceView";

type SessionState = {
  filename: string;
  traceCount: number;
  lastIndex: number;
};

type Phase =
  | { kind: "wizard" }
  | { kind: "checking"; traces: Trace[]; filename: string }
  | {
      kind: "resume-offer";
      traces: Trace[];
      filename: string;
      lastIndex: number;
      annotations: Annotations;
      labeledCount: number;
    }
  | {
      kind: "annotating";
      traces: Trace[];
      filename: string;
      initialAnnotations: Annotations;
      initialIndex: number;
    };

function labelRowsToAnnotations(rows: LabelRow[]): Annotations {
  const out: Annotations = {};
  for (const row of rows) {
    out[row.trace_id] = {
      verdict: row.verdict,
      note: row.note,
      tags: row.tags,
      labeledAt: row.labeled_at,
      isEdited: false,
    };
  }
  return out;
}

export function AppShell() {
  const [phase, setPhase] = useState<Phase>({ kind: "wizard" });

  async function handleWizardDone(traces: Trace[], filename: string) {
    setPhase({ kind: "checking", traces, filename });
    try {
      const [stateRes, labelsRes] = await Promise.all([
        fetch("/api/session-state").then((r) => r.json()) as Promise<{
          ok: boolean;
          state?: SessionState;
        }>,
        fetch("/api/load-labels").then((r) => r.json()) as Promise<{
          ok: boolean;
          rows?: LabelRow[];
        }>,
      ]);

      if (
        stateRes.ok &&
        stateRes.state &&
        stateRes.state.filename === filename &&
        stateRes.state.traceCount === traces.length &&
        labelsRes.ok &&
        labelsRes.rows &&
        labelsRes.rows.length > 0
      ) {
        const annotations = labelRowsToAnnotations(labelsRes.rows);
        setPhase({
          kind: "resume-offer",
          traces,
          filename,
          lastIndex: stateRes.state.lastIndex,
          annotations,
          labeledCount: labelsRes.rows.length,
        });
        return;
      }
    } catch {
      // network error - fall through to fresh start
    }

    setPhase({
      kind: "annotating",
      traces,
      filename,
      initialAnnotations: {},
      initialIndex: 0,
    });
  }

  if (phase.kind === "wizard") {
    return (
      <main className="min-h-screen flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-2xl mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            Trace Annotator
          </h1>
          <p className="text-gray-600 mt-2">
            A keyboard-first labeling tool for new PMs running their first eval.
            Load a file of LLM traces below; the wizard will help you map the
            fields and preview the first trace before labeling.
          </p>
        </div>
        <Wizard onDone={handleWizardDone} />
      </main>
    );
  }

  if (phase.kind === "checking") {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-500" role="status" aria-live="polite">
          Loading session...
        </p>
      </main>
    );
  }

  if (phase.kind === "resume-offer") {
    const { traces, filename, lastIndex, annotations, labeledCount } = phase;
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Resume session?</h2>
          <p className="text-sm text-gray-600">
            Found a saved session for{" "}
            <span className="font-mono text-gray-800">{filename}</span>:{" "}
            <strong>{labeledCount}</strong> of <strong>{traces.length}</strong> traces labeled.
            Last viewed trace #{lastIndex + 1}.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                setPhase({
                  kind: "annotating",
                  traces,
                  filename,
                  initialAnnotations: annotations,
                  initialIndex: lastIndex,
                })
              }
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Resume from trace {lastIndex + 1}
            </button>
            <button
              type="button"
              onClick={() =>
                setPhase({
                  kind: "annotating",
                  traces,
                  filename,
                  initialAnnotations: {},
                  initialIndex: 0,
                })
              }
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 rounded border border-gray-300 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Start fresh
            </button>
          </div>
        </div>
      </main>
    );
  }

  // phase.kind === "annotating"
  return (
    <TraceView
      traces={phase.traces}
      filename={phase.filename}
      initialAnnotations={phase.initialAnnotations}
      initialIndex={phase.initialIndex}
      onReset={() => setPhase({ kind: "wizard" })}
    />
  );
}
