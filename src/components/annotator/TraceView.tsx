"use client";

import { useState } from "react";
import type { Trace } from "@/lib/trace/types";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";

type Props = {
  traces: Trace[];
  onReset: () => void;
};

export function TraceView({ traces, onReset }: Props) {
  const [index, setIndex] = useState(0);
  const total = traces.length;
  const trace = traces[index];
  const progressPct = ((index + 1) / total) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Load new file
        </button>
        <span className="text-sm font-medium text-gray-700" aria-live="polite">
          Trace {index + 1} of {total}
        </span>
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
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-mono text-gray-400">id: {trace.id}</span>
          </div>
          <TraceRenderer trace={trace} collapseSystem />
        </div>
      </main>

      <nav
        aria-label="Trace navigation"
        className="border-t bg-white px-4 py-4 flex items-center justify-between sticky bottom-0"
      >
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((i) => i - 1)}
          aria-label="Previous trace"
          className="px-4 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Previous
        </button>

        <span className="text-xs text-gray-400">
          {index + 1} / {total}
        </span>

        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => setIndex((i) => i + 1)}
          aria-label="Next trace"
          className="px-4 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Next
        </button>
      </nav>
    </div>
  );
}
