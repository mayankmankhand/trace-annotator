"use client";

import type { Message } from "@/lib/trace/types";

type Props = { messages: Message[] };

type ToolCallInfo = {
  name: string;
  args: unknown;
};

function parseToolCall(content: string): ToolCallInfo | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0] as Record<string, unknown>;
      if (first.type === "tool_use" && typeof first.name === "string") {
        return { name: first.name, args: first.input ?? {} };
      }
      if (
        first.type === "function" &&
        first.function &&
        typeof (first.function as Record<string, unknown>).name === "string"
      ) {
        const fn = first.function as Record<string, unknown>;
        let args: unknown = fn.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            // leave as string
          }
        }
        return { name: fn.name as string, args };
      }
    }

    if (typeof parsed === "object" && parsed !== null) {
      const obj = parsed as Record<string, unknown>;

      if (obj.type === "tool_use" && typeof obj.name === "string") {
        return { name: obj.name, args: obj.input ?? {} };
      }

      if ("function_call" in obj) {
        const fc = obj.function_call as Record<string, unknown>;
        let args: unknown = fc.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            // leave as string
          }
        }
        return { name: (fc.name as string) ?? "unknown", args };
      }

      if ("tool_calls" in obj && Array.isArray(obj.tool_calls)) {
        const first = obj.tool_calls[0] as Record<string, unknown>;
        const fn = first.function as Record<string, unknown> | undefined;
        if (fn && typeof fn.name === "string") {
          let args: unknown = fn.arguments;
          if (typeof args === "string") {
            try {
              args = JSON.parse(args);
            } catch {
              // leave as string
            }
          }
          return { name: fn.name, args };
        }
      }

      if ("name" in obj && "arguments" in obj && typeof obj.name === "string") {
        let args: unknown = obj.arguments;
        if (typeof args === "string") {
          try {
            args = JSON.parse(args);
          } catch {
            // leave as string
          }
        }
        return { name: obj.name, args };
      }
    }
  } catch {
    // not parseable JSON
  }
  return null;
}

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

        const toolCall = parseToolCall(m.content);
        if (toolCall) {
          return <ToolCallCard key={i} {...toolCall} />;
        }

        const isUser = m.role === "user";
        return (
          <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-lg px-4 py-3 text-sm whitespace-pre-wrap break-words ${
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
              <div className="max-h-72 overflow-auto">{m.content}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
