"use client";

import type { Message } from "@/lib/trace/types";
import { parseToolCalls, type ToolCallInfo } from "@/lib/trace/tool-calls";

type Props = { messages: Message[] };

function ToolCallCard({ name, args }: ToolCallInfo) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 overflow-hidden">
      <div className="px-4 py-2 bg-violet-100 border-b border-violet-200 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-violet-600 font-medium">
          tool call
        </span>
        <span className="font-mono text-sm font-semibold text-violet-900">
          {name}()
        </span>
      </div>
      <div className="px-4 py-3">
        <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap overflow-auto max-h-48">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function ToolResultCard({ content }: { content: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 overflow-hidden">
      <div className="px-4 py-2 bg-emerald-100 border-b border-emerald-200">
        <span className="text-[10px] uppercase tracking-wide text-emerald-700 font-medium">
          tool result
        </span>
      </div>
      <div className="px-4 py-3">
        <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap overflow-auto max-h-48">
          {content}
        </pre>
      </div>
    </div>
  );
}

export function ToolCallRenderer({ messages }: Props) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => {
        if (m.role === "tool") {
          return <ToolResultCard key={i} content={m.content} />;
        }

        const toolCalls = parseToolCalls(m.content);
        if (toolCalls.length > 0) {
          // A single message can encode multiple parallel tool calls
          // (OpenAI tool_calls[], Anthropic content blocks). Render one
          // card per call so nothing is silently dropped.
          return (
            <div key={i} className="space-y-3">
              {toolCalls.map((tc, j) => (
                <ToolCallCard key={`${i}-${j}`} {...tc} />
              ))}
            </div>
          );
        }

        const isUser = m.role === "user";
        return (
          <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] max-h-[80vh] overflow-auto rounded-lg px-4 py-3 text-sm whitespace-pre-wrap break-words ${
                isUser
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-900 border border-gray-200"
              }`}
            >
              <div
                className={`text-[10px] uppercase tracking-wide mb-1 font-medium ${
                  isUser ? "text-blue-200" : "text-gray-500"
                }`}
              >
                {m.role}
              </div>
              {m.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
