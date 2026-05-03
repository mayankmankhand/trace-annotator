"use client";

import type { Trace } from "@/lib/trace/types";

type Props = { trace: Trace };

export function GenericRenderer({ trace }: Props) {
  const inputText = trace.input.map((m) => m.content).join("\n\n");
  const outputText = trace.output.map((m) => m.content).join("\n\n");

  return (
    <div className="space-y-4">
      {inputText && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">
            Input
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-sm text-gray-800 whitespace-pre-wrap max-h-48 overflow-auto">
              {inputText}
            </p>
          </div>
        </div>
      )}
      {outputText && (
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium mb-2">
            Output
          </p>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
            <p className="text-sm text-gray-900 whitespace-pre-wrap max-h-72 overflow-auto">
              {outputText}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
