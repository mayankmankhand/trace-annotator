"use client";

import { useState } from "react";
import type { Trace } from "@/lib/trace/types";
import { Wizard } from "./wizard/Wizard";
import { TraceView } from "./annotator/TraceView";

export function AppShell() {
  const [traces, setTraces] = useState<Trace[] | null>(null);

  if (traces) {
    return <TraceView traces={traces} onReset={() => setTraces(null)} />;
  }

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
      <Wizard onDone={setTraces} />
    </main>
  );
}
