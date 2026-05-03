"use client";

import type { Message, Trace } from "@/lib/trace/types";

type Props = {
  traces: Trace[];
  onBack: () => void;
  onConfirm: () => void;
};

export function PreviewStep({ traces, onBack, onConfirm }: Props) {
  const first = traces[0];

  if (!first) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
          <p className="text-sm text-gray-600 mt-1">
            No traces were found in this file. Go back and check the field
            mapping.
          </p>
        </div>
        <div className="flex justify-start pt-4 border-t">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Preview</h2>
        <p className="text-sm text-gray-600 mt-1">
          Loaded <span className="font-medium">{traces.length}</span>{" "}
          {traces.length === 1 ? "trace" : "traces"}. Here is the first one
          rendered the way the labeling view will show it.
        </p>
      </div>

      <div className="space-y-3">
        {first.input.map((m, i) => (
          <Bubble key={`in-${i}`} message={m} />
        ))}
        {first.output.map((m, i) => (
          <Bubble key={`out-${i}`} message={m} />
        ))}
      </div>

      <details className="rounded border bg-gray-50 text-xs">
        <summary className="cursor-pointer px-3 py-2 text-gray-700 select-none">
          View raw JSON
        </summary>
        <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-gray-800">
          {JSON.stringify(first, null, 2)}
        </pre>
      </details>

      <div className="flex justify-between pt-4 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-full rounded-lg px-4 py-3 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-gray-100 text-gray-900 border border-gray-200"
        }`}
      >
        <div
          className={`text-[10px] uppercase tracking-wide mb-1 ${
            isUser ? "text-blue-100" : "text-gray-500"
          }`}
        >
          {message.role}
        </div>
        <div className="max-h-72 overflow-auto">{message.content}</div>
      </div>
    </div>
  );
}
