"use client";

import type { Trace } from "@/lib/trace/types";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";

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

      <TraceRenderer trace={first} />

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
