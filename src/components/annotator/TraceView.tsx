"use client";

import { useCallback, useEffect, useState } from "react";
import type { Trace } from "@/lib/trace/types";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";

export type Verdict = "pass" | "fail";
export type Labels = Record<string, Verdict>;

type Props = {
  traces: Trace[];
  onReset: () => void;
};

export function TraceView({ traces, onReset }: Props) {
  const [index, setIndex] = useState(0);
  const [labels, setLabels] = useState<Labels>({});
  const total = traces.length;
  const trace = traces[index];
  const progressPct = ((index + 1) / total) * 100;
  const currentVerdict = labels[trace.id] ?? null;
  const labeledCount = Object.keys(labels).length;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
    },
    [total],
  );

  const applyVerdict = useCallback(
    (v: Verdict) => {
      setLabels((prev) => ({ ...prev, [trace.id]: v }));
    },
    [trace.id],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (inInput) return;

      switch (e.key) {
        case "p":
        case "P":
          applyVerdict("pass");
          break;
        case "f":
        case "F":
          applyVerdict("fail");
          break;
        case "ArrowRight":
        case "Enter":
          if (!e.shiftKey) go(1);
          break;
        case "ArrowLeft":
          go(-1);
          break;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [go, applyVerdict]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Load new file
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700" aria-live="polite">
            Trace {index + 1} of {total}
          </p>
          {labeledCount > 0 && (
            <p className="text-xs text-gray-400">
              {labeledCount} labeled
            </p>
          )}
        </div>
        <div className="w-24" aria-hidden="true" />
      </header>

      <div
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Annotation progress"
        className="h-1 bg-gray-200"
      >
        <div
          className="h-1 bg-blue-500 transition-[width] duration-200"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="mb-3 flex items-center gap-3">
            <span className="text-xs font-mono text-gray-400">
              id: {trace.id}
            </span>
            {currentVerdict && (
              <VerdictBadge verdict={currentVerdict} />
            )}
          </div>
          <TraceRenderer trace={trace} collapseSystem />
        </div>
      </main>

      <nav
        aria-label="Trace navigation and labeling"
        className="border-t bg-white sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.06)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(-1)}
            aria-label="Previous trace"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span aria-hidden="true">&#8592;</span> Prev
          </button>

          <div className="flex items-center gap-2" role="group" aria-label="Label verdict">
            <VerdictButton
              verdict="pass"
              current={currentVerdict}
              onClick={() => applyVerdict("pass")}
            />
            <VerdictButton
              verdict="fail"
              current={currentVerdict}
              onClick={() => applyVerdict("fail")}
            />
          </div>

          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => go(1)}
            aria-label="Next trace"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Next <span aria-hidden="true">&#8594;</span>
          </button>
        </div>

        <div
          aria-label="Keyboard shortcuts"
          className="border-t bg-gray-50 px-4 py-1.5 flex items-center justify-center gap-5 text-xs text-gray-400"
        >
          <span><kbd className="font-mono font-semibold text-gray-500">P</kbd> Pass</span>
          <span><kbd className="font-mono font-semibold text-gray-500">F</kbd> Fail</span>
          <span><kbd className="font-mono font-semibold text-gray-500">&#8592; &#8594;</kbd> Navigate</span>
          <span><kbd className="font-mono font-semibold text-gray-500">Enter</kbd> Next</span>
        </div>
      </nav>
    </div>
  );
}

function VerdictButton({
  verdict,
  current,
  onClick,
}: {
  verdict: Verdict;
  current: Verdict | null;
  onClick: () => void;
}) {
  const isActive = current === verdict;
  const isPass = verdict === "pass";
  const key = isPass ? "P" : "F";

  const base =
    "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  const active = isPass
    ? "bg-green-600 border-green-600 text-white"
    : "bg-red-600 border-red-600 text-white";
  const inactive = isPass
    ? "border-green-300 text-green-700 hover:bg-green-50"
    : "border-red-300 text-red-700 hover:bg-red-50";
  const ring = isPass ? "focus-visible:ring-green-500" : "focus-visible:ring-red-500";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`${base} ${isActive ? active : inactive} ${ring}`}
    >
      <kbd className="text-[10px] font-mono opacity-70">[{key}]</kbd>
      {isPass ? "Pass" : "Fail"}
    </button>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const isPass = verdict === "pass";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isPass
          ? "bg-green-100 text-green-800"
          : "bg-red-100 text-red-800"
      }`}
    >
      {isPass ? "Pass" : "Fail"}
    </span>
  );
}
