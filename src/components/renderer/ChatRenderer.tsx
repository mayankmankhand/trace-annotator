"use client";

import type { Message } from "@/lib/trace/types";

type Props = { messages: Message[]; collapseSystem?: boolean };

type RoleStyle = { wrap: string; bubble: string; label: string };

const ROLE_STYLES: Record<string, RoleStyle> = {
  user: {
    wrap: "justify-end",
    bubble: "bg-blue-600 text-white",
    label: "text-blue-200",
  },
  assistant: {
    wrap: "justify-start",
    bubble: "bg-gray-100 text-gray-900 border border-gray-200",
    label: "text-gray-500",
  },
  system: {
    wrap: "justify-center",
    bubble: "bg-amber-50 text-gray-700 border border-amber-200",
    label: "text-amber-600",
  },
  tool: {
    wrap: "justify-start",
    bubble: "bg-emerald-50 text-gray-800 border border-emerald-200 font-mono text-xs",
    label: "text-emerald-700",
  },
};

const FALLBACK_STYLE: RoleStyle = ROLE_STYLES.assistant;

export function ChatRenderer({ messages, collapseSystem = false }: Props) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => {
        const isSystem = m.role === "system";

        if (isSystem && collapseSystem) {
          return (
            <details
              key={i}
              className="rounded-lg border border-amber-200 bg-amber-50"
            >
              <summary className="cursor-pointer select-none px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100">
                System prompt (click to expand)
              </summary>
              <div className="px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap italic max-h-72 overflow-auto">
                {m.content}
              </div>
            </details>
          );
        }

        const s = ROLE_STYLES[m.role] ?? FALLBACK_STYLE;
        return (
          <div key={i} className={`flex ${s.wrap}`}>
            <div
              className={`rounded-lg px-4 py-3 text-sm whitespace-pre-wrap break-words ${
                isSystem ? "w-full text-center italic" : "max-w-[85%]"
              } ${s.bubble}`}
            >
              <div className={`text-[10px] uppercase tracking-wide mb-1 font-medium ${s.label}`}>
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
