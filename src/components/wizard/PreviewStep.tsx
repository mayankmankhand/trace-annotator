"use client";

import type { Trace } from "@/lib/trace/types";
import type { EnvelopeKey } from "@/lib/trace/parse";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";

// PreviewStep (issue #53). Quiet Notebook restyle. Logic unchanged.

type Props = {
  traces: Trace[];
  envelopeKey: EnvelopeKey | null;
  usedNestedMessages: boolean;
  autoRecognized: boolean;
  viaAdapter: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

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
    <div role="status" className="wz-banner wz-banner--info">
      <p className="wz-banner__title">
        Found {count} {count === 1 ? "trace" : "traces"}
        {pieces}. Does this look right?
      </p>
      <p className="wz-banner__body">
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
  viaAdapter,
  onBack,
  onConfirm,
}: Props) {
  const first = traces[0];

  if (!first) {
    return (
      <div className="wz-step">
        <div className="wz-step__head">
          <h2 className="wz-step__title">Preview</h2>
          <p className="wz-step__hint">
            No traces were found in this file. Go back and check the field
            mapping.
          </p>
        </div>
        <div className="wz-step__foot wz-step__foot--single">
          <button type="button" onClick={onBack} className="lv-nav">
            back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wz-step">
      <div className="wz-step__head">
        <h2 className="wz-step__title">Preview</h2>
        <p className="wz-step__hint">
          Loaded <strong>{traces.length}</strong>{" "}
          {traces.length === 1 ? "trace" : "traces"}. Here is the first one
          rendered the way the labeling view will show it.
        </p>
      </div>

      {viaAdapter && (
        <div role="status" className="wz-banner wz-banner--info">
          <p className="wz-banner__title">
            Loaded {traces.length}{" "}
            {traces.length === 1 ? "trace" : "traces"} via your custom
            adapter (configured in Settings).
          </p>
          <p className="wz-banner__body">
            The wizard skipped the mapping step because a saved adapter
            applied cleanly. Confirm the first trace looks right, or clear
            the adapter in Settings to use the normal flow next time.
          </p>
        </div>
      )}
      {/*
        Confidence banner pairs with viaAdapter when the adapter unwrapped
        a wrapper or used a nested messages array (the user benefits from
        seeing what the adapter actually did). When no adapter ran, this
        is the primary auto-detect signal. The two branches do not
        overlap.
      */}
      {autoRecognized &&
        (!viaAdapter || envelopeKey || usedNestedMessages) && (
          <ConfidenceBanner
            count={traces.length}
            envelopeKey={envelopeKey}
            usedNestedMessages={usedNestedMessages}
          />
        )}

      <div className="wz-preview">
        <TraceRenderer trace={first} />
      </div>

      <div className="wz-step__foot">
        <button type="button" onClick={onBack} className="lv-nav">
          back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="lv-nav lv-nav--primary"
        >
          confirm
        </button>
      </div>
    </div>
  );
}
