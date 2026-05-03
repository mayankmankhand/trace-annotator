"use client";

import { useState } from "react";
import type { Trace } from "@/lib/trace/types";
import { detectRenderer } from "./detect";
import { ChatRenderer } from "./ChatRenderer";
import { EmailRenderer } from "./EmailRenderer";
import { ToolCallRenderer } from "./ToolCallRenderer";
import { GenericRenderer } from "./GenericRenderer";

type Props = {
  trace: Trace;
  showJsonDefault?: boolean;
};

export function TraceRenderer({ trace, showJsonDefault = false }: Props) {
  const [showJson, setShowJson] = useState(showJsonDefault);
  const rendererType = detectRenderer(trace);
  const allMessages = [...trace.input, ...trace.output];

  return (
    <div className="space-y-4">
      <div>
        {rendererType === "chat" && <ChatRenderer messages={allMessages} />}
        {rendererType === "email" && (
          <EmailRenderer
            promptMessages={trace.input}
            emailContent={trace.output.map((m) => m.content).join("\n")}
          />
        )}
        {rendererType === "tool-call" && (
          <ToolCallRenderer messages={allMessages} />
        )}
        {rendererType === "generic" && <GenericRenderer trace={trace} />}
      </div>

      <details
        className="rounded border bg-gray-50 text-xs"
        open={showJson}
        onToggle={(e) => setShowJson((e.target as HTMLDetailsElement).open)}
      >
        <summary className="cursor-pointer select-none px-3 py-2 text-gray-600 hover:text-gray-900">
          {showJson ? "Hide" : "Show"} raw JSON
        </summary>
        <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-gray-800">
          {JSON.stringify(trace, null, 2)}
        </pre>
      </details>
    </div>
  );
}
