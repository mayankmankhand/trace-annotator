"use client";

import type { Trace } from "@/lib/trace/types";
import type { EnvelopeKey } from "@/lib/trace/parse";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";

type Props = {
  traces: Trace[];
  envelopeKey: EnvelopeKey | null;
  usedNestedMessages: boolean;
  autoRecognized: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

// ConfidenceBanner explains what the wizard auto-detected so the user can
// validate it before committing. Phrased as a question to invite correction.
// Skipped entirely when the user reached preview via manual mapping (no
// auto-detection happened).
function ConfidenceBanner({
  count,
  envelopeKey,
  usedNestedMessages,
}: {
  count: number;
  envelopeKey: EnvelopeKey | null;
  usedNestedMessages: boolean;
}) {
  const parts: string[] = [];
  if (envelopeKey) parts.push(`a "${envelopeKey}" wrapper`);
  if (usedNestedMessages) parts.push("a nested messages[] array");
  const pieces = parts.length > 0 ? ` using ${parts.join(" and ")}` : "";
  return (
    <div
      role="status"
      className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm"
    >
      <p className="font-medium text-blue-900">
        Found {count} {count === 1 ? "trace" : "traces"}
        {pieces}. Does this look right?
      </p>
      <p className="text-xs text-blue-800 mt-1">
        Confirm the first trace below renders the way you expect, then click
        Confirm. Otherwise, go back and adjust the field mapping.
      </p>
    </div>
  );
}

export function PreviewStep({
  traces,
  envelopeKey,
  usedNestedMessages,
  autoRecognized,
  onBack,
  onConfirm,
}: Props) {
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

      {autoRecognized && (
        <ConfidenceBanner
          count={traces.length}
          envelopeKey={envelopeKey}
          usedNestedMessages={usedNestedMessages}
        />
      )}

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
