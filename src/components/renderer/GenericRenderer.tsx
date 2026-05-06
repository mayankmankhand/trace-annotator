"use client";

import type { Trace } from "@/lib/trace/types";

// GenericRenderer (issue #53). Fallback for "we don't know what shape
// this is" - input on top, output on the bottom, both serif because
// reading is the focal act. Quiet Notebook tokens.

type Props = { trace: Trace };

export function GenericRenderer({ trace }: Props) {
  const inputText = trace.input.map((m) => m.content).join("\n\n");
  const outputText = trace.output.map((m) => m.content).join("\n\n");

  return (
    <div className="generic-trace">
      {inputText && (
        <div className="generic-trace__section">
          <div className="generic-trace__label">input</div>
          <div className="generic-trace__body">{inputText}</div>
        </div>
      )}
      {outputText && (
        <div className="generic-trace__section">
          <div className="generic-trace__label">output</div>
          <div className="generic-trace__body">{outputText}</div>
        </div>
      )}
    </div>
  );
}
