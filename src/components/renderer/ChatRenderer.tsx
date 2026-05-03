"use client";

import type { Message } from "@/lib/trace/types";

type Props = { messages: Message[] };

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

export function ChatRenderer({ messages }: Props) {
  return (
    <div className="space-y-3">
      {messages.map((m, i) => {
        const s = ROLE_STYLES[m.role] ?? FALLBACK_STYLE;
        const isSystem = m.role === "system";
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
