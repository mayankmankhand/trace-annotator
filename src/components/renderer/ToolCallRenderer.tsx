"use client";

import type { Message } from "@/lib/trace/types";
import { parseToolCalls, type ToolCallInfo } from "@/lib/trace/tool-calls";

// ToolCallRenderer (issue #53). Quiet Notebook restyle: each call lives
// in a `.tool-block` mono card with label/code rows, paired with a role
// pill so it's clear who owns each line. Used for traces with one tool
// call; multi-tool traces flow through AgentRenderer.

type Props = { messages: Message[] };

function ToolCallBlock({ name, args }: ToolCallInfo) {
  return (
    <div className="trace-msg">
      <div className="chat-trace__pill">
        <span className="role-pill" data-role="tool">
          tool · {name}
        </span>
      </div>
      <div className="tool-block">
        <div className="tool-block__row">
          <span className="tool-block__label">args</span>
          <code>{JSON.stringify(args)}</code>
        </div>
      </div>
    </div>
  );
}

function ToolResultBlock({ content }: { content: string }) {
  const ok = !/^error[:\s]/i.test(content.trim());
  return (
    <div className="trace-msg">
      <div className="chat-trace__pill">
        <span className="role-pill" data-role="tool">
          tool result
        </span>
        <span className="agent-trace__status" data-ok={ok ? "true" : "false"}>
          {ok ? "ok" : "error"}
        </span>
      </div>
      <div className="tool-block">
        <div className="tool-block__row">
          <span className="tool-block__label">{"→"}</span>
          <code data-ok={ok ? "true" : "false"}>{content}</code>
        </div>
      </div>
    </div>
  );
}

function ChatTurn({ msg }: { msg: Message }) {
  const isSerif = msg.role === "user" || msg.role === "assistant";
  return (
    <div className="trace-msg chat-trace__turn">
      <div className="chat-trace__pill">
        <span className="role-pill" data-role={msg.role}>
          {msg.role}
        </span>
      </div>
      <div
        className={`trace-msg__body ${isSerif ? "trace-msg__body--serif" : "trace-msg__body--mono"}`}
      >
        {msg.content}
      </div>
    </div>
  );
}

export function ToolCallRenderer({ messages }: Props) {
  return (
    <div className="chat-trace">
      {messages.map((m, i) => {
        if (m.role === "tool") {
          return <ToolResultBlock key={i} content={m.content} />;
        }
        const calls = parseToolCalls(m.content);
        if (calls.length > 0) {
          // Multiple parallel tool calls (OpenAI tool_calls[], Anthropic
          // content blocks) render one card each so nothing is dropped.
          return (
            <div key={i} className="chat-trace__group">
              {calls.map((tc, j) => (
                <ToolCallBlock key={`${i}-${j}`} {...tc} />
              ))}
            </div>
          );
        }
        return <ChatTurn key={i} msg={m} />;
      })}
    </div>
  );
}
