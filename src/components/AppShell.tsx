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
      // Persist the skip marker across reloads (was lost in v3 - skip was
      // session-scoped only). Older rows without a `skipped` field default
      // to false.
      skipped: row.skipped === true,
      ...(row.tool_call_reviews
        ? { toolCallReviews: row.tool_call_reviews }
        : {}),
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
      <main className="wz-page">
        {/*
          Visually hidden h1 so the page has a level-one heading (axe
          page-has-heading-one). The Logo wordmark is the visual title.
        */}
        <h1 className="sr-only">Trace Annotator</h1>
        <div className="wz-page__intro">
          <Logo />
          <p className="wz-page__lede">
            A keyboard-first labeling tool for new PMs running their first
            eval. Load a file of LLM traces below; the wizard maps the
            fields and previews the first trace before labeling.
          </p>
        </div>
        <Wizard onDone={handleWizardDone} />
      </main>
    );
  }

  if (phase.kind === "checking") {
    return (
      <main className="wz-page wz-page--center">
        <p className="wz-page__lede" role="status" aria-live="polite">
          Loading session...
        </p>
      </main>
    );
  }

  if (phase.kind === "resume-offer") {
    const { traces, filename, fingerprint, lastIndex, annotations, labeledCount } = phase;
    const passCount = Object.values(annotations).filter((a) => a.verdict === "pass").length;
    const failCount = Object.values(annotations).filter((a) => a.verdict === "fail").length;
    const distinctTags = new Set<string>();
    for (const a of Object.values(annotations)) {
      for (const t of a.tags) distinctTags.add(t);
    }
    return (
      <main className="wz-page wz-page--center">
        <div className="wz-card wz-resume">
          <h2 className="wz-step__title">Resume session?</h2>
          <p className="wz-step__hint">
            Found a saved session for{" "}
            <span className="wz-resume__file">{filename}</span>.
          </p>
          <ul className="wz-resume__list">
            <li>
              <strong>{labeledCount}</strong> of {traces.length} traces labeled
              {labeledCount > 0 && (
                <span className="wz-resume__sub">
                  {" "}({passCount} pass, {failCount} fail)
                </span>
              )}
            </li>
            <li>Last viewed: trace #{lastIndex + 1}</li>
            {distinctTags.size > 0 && (
              <li>
                <strong>{distinctTags.size}</strong>{" "}
                {distinctTags.size === 1 ? "distinct tag" : "distinct tags"}{" "}
                so far
              </li>
            )}
          </ul>
          <p className="wz-resume__note">
            Resuming restores all your labels and tags. Start fresh archives
            the current state and starts at trace 1.
          </p>
          <div className="wz-resume__actions">
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
              className="lv-nav lv-nav--primary wz-resume__btn"
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
              className="lv-nav wz-resume__btn"
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
    <main aria-labelledby="ta-app-heading">
      {/*
        Visually hidden h1 so the labeling page has a top-level heading
        (axe page-has-heading-one). The trace title is rendered as h2
        inside the trace pane so the heading hierarchy stays h1 -> h2.
      */}
      <h1 id="ta-app-heading" className="sr-only">
        Trace Annotator - labeling view
      </h1>
      <TraceView
        traces={phase.traces}
        filename={phase.filename}
        fingerprint={phase.fingerprint}
        initialAnnotations={phase.initialAnnotations}
        initialIndex={phase.initialIndex}
        storageUnavailable={phase.storageUnavailable}
        onReset={() => setPhase({ kind: "wizard" })}
      />
    </main>
  );
}
