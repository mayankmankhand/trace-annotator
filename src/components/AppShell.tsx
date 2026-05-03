"use client";

import { useState } from "react";
import type { Trace } from "@/lib/trace/types";
import type { Annotations } from "./annotator/TraceView";
import type { LabelRow } from "@/lib/labels/types";
import { Wizard } from "./wizard/Wizard";
import { TraceView } from "./annotator/TraceView";
import { Logo } from "./Logo";
import { fingerprintFile, loadLabels, loadSessionState } from "@/lib/storage";

type Phase =
  | { kind: "wizard" }
  | { kind: "checking"; traces: Trace[]; filename: string }
  | {
      kind: "resume-offer";
      traces: Trace[];
      filename: string;
      fingerprint: string;
      lastIndex: number;
      annotations: Annotations;
      labeledCount: number;
    }
  | {
      kind: "annotating";
      traces: Trace[];
      filename: string;
      fingerprint: string;
      initialAnnotations: Annotations;
      initialIndex: number;
      // True when the initial load from IndexedDB threw (e.g., Safari
      // private mode, browser storage disabled). The annotator surfaces
      // this so the user knows their work might not persist.
      storageUnavailable?: boolean;
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
      skipped: false,
    };
  }
  return out;
}

function computeFingerprint(traces: Trace[], filename: string): string {
  const first = traces[0]?.id ?? "";
  const last = traces[traces.length - 1]?.id ?? "";
  return fingerprintFile(filename, traces.length, first, last);
}

export function AppShell() {
  const [phase, setPhase] = useState<Phase>({ kind: "wizard" });

  async function handleWizardDone(traces: Trace[], filename: string) {
    setPhase({ kind: "checking", traces, filename });
    const fingerprint = computeFingerprint(traces, filename);
    let storageUnavailable = false;
    try {
      const [state, rows] = await Promise.all([
        loadSessionState(fingerprint),
        loadLabels(fingerprint),
      ]);
      if (state && rows.length > 0) {
        setPhase({
          kind: "resume-offer",
          traces,
          filename,
          fingerprint,
          lastIndex: state.lastIndex,
          annotations: labelRowsToAnnotations(rows),
          labeledCount: rows.length,
        });
        return;
      }
    } catch (err) {
      // Storage unavailable (Safari private mode, browser storage disabled,
      // quota exceeded). Don't silently swallow - log so the user can debug,
      // and pass a flag down so the annotator's save indicator can surface a
      // persistent warning. Without this signal a v1-style "labels never
      // persisted" bug would be invisible to the user again.
      storageUnavailable = true;
      // eslint-disable-next-line no-console
      console.warn("Trace Annotator: browser storage unavailable.", err);
    }

    setPhase({
      kind: "annotating",
      traces,
      filename,
      fingerprint,
      initialAnnotations: {},
      initialIndex: 0,
      storageUnavailable,
    });
  }

  if (phase.kind === "wizard") {
    return (
      <main className="min-h-screen flex flex-col items-center px-4 py-12">
        <div className="w-full max-w-2xl mb-8 flex flex-col items-center text-center gap-3">
          <Logo />
          <p className="text-gray-600 max-w-xl">
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
    const { traces, filename, fingerprint, lastIndex, annotations, labeledCount } = phase;
    // Compose richer resume copy so the user knows exactly what state will
    // be restored. Tag count surfaced too because that's the most visible
    // sign of "have I done useful work yet?".
    const passCount = Object.values(annotations).filter((a) => a.verdict === "pass").length;
    const failCount = Object.values(annotations).filter((a) => a.verdict === "fail").length;
    const distinctTags = new Set<string>();
    for (const a of Object.values(annotations)) {
      for (const t of a.tags) distinctTags.add(t);
    }
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Resume session?</h2>
          <p className="text-sm text-gray-600">
            Found a saved session for{" "}
            <span className="font-mono text-gray-800">{filename}</span>.
          </p>
          <ul className="text-sm text-gray-700 space-y-1">
            <li>
              <strong>{labeledCount}</strong> of {traces.length} traces labeled
              {labeledCount > 0 && (
                <span className="text-gray-500">
                  {" "}({passCount} pass, {failCount} fail)
                </span>
              )}
            </li>
            <li>
              Last viewed: trace #{lastIndex + 1}
            </li>
            {distinctTags.size > 0 && (
              <li>
                <strong>{distinctTags.size}</strong>{" "}
                {distinctTags.size === 1 ? "distinct tag" : "distinct tags"}{" "}
                so far
              </li>
            )}
          </ul>
          <p className="text-xs text-gray-500">
            Resuming restores all your labels and tags. Start fresh archives the
            current state and starts at trace 1.
          </p>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                setPhase({
                  kind: "annotating",
                  traces,
                  filename,
                  fingerprint,
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
                  fingerprint,
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
      fingerprint={phase.fingerprint}
      initialAnnotations={phase.initialAnnotations}
      initialIndex={phase.initialIndex}
      storageUnavailable={phase.storageUnavailable}
      onReset={() => setPhase({ kind: "wizard" })}
    />
  );
}
