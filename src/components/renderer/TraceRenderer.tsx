"use client";

import { useState } from "react";
import type { Trace } from "@/lib/trace/types";
import { detectRenderer } from "./detect";
import { ChatRenderer } from "./ChatRenderer";
import { EmailRenderer } from "./EmailRenderer";
import { ToolCallRenderer } from "./ToolCallRenderer";
import { GenericRenderer } from "./GenericRenderer";
import { RagRenderer } from "./RagRenderer";
import { AgentRenderer } from "./AgentRenderer";
import { SummarizerRenderer } from "./SummarizerRenderer";

type Props = {
  trace: Trace;
  showJsonDefault?: boolean;
  collapseSystem?: boolean;
  dense?: boolean;
};

export function TraceRenderer({
  trace,
  showJsonDefault = false,
  collapseSystem = false,
  dense = false,
}: Props) {
  const [showJson, setShowJson] = useState(showJsonDefault);
  const rendererType = detectRenderer(trace);
  const allMessages = [...trace.input, ...trace.output];

  return (
    <div className="trace-renderer">
      <div>
        {rendererType === "chat" && (
          <ChatRenderer
            messages={allMessages}
            collapseSystem={collapseSystem}
            dense={dense}
          />
        )}
        {rendererType === "email" && (
          <EmailRenderer
            promptMessages={trace.input}
            emailContent={trace.output.map((m) => m.content).join("\n")}
          />
        )}
        {rendererType === "tool-call" && (
          <ToolCallRenderer messages={allMessages} />
        )}
        {rendererType === "rag" && <RagRenderer trace={trace} />}
        {rendererType === "agent" && <AgentRenderer trace={trace} />}
        {rendererType === "summarizer" && <SummarizerRenderer trace={trace} />}
        {rendererType === "generic" && <GenericRenderer trace={trace} />}
      </div>

      <details
        className="trace-renderer__json"
        open={showJson}
        onToggle={(e) => setShowJson((e.target as HTMLDetailsElement).open)}
      >
        <summary>{showJson ? "hide" : "show"} raw JSON</summary>
        <pre>{JSON.stringify(trace, null, 2)}</pre>
      </details>
    </div>
  );
}
