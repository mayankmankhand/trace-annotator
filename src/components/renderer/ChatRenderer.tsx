"use client";

import { useState } from "react";
import type { Message } from "@/lib/trace/types";

// ChatRenderer (issue #53). Quiet Notebook restyle:
//   - role pills (data-role attribute) are the only label decoration
//   - serif body for prose (user/assistant/tool prose), mono for system
//   - 22px gap between turns, 14px in dense mode
//   - system messages collapse behind a disclosure summary by default
//
// Tool messages routed here render as a compact mono card so a single
// inline tool result inside an otherwise chatty trace stays readable.

type Props = {
  messages: Message[];
  collapseSystem?: boolean;
  dense?: boolean;
};

export function ChatRenderer({ messages, collapseSystem = false, dense = false }: Props) {
  return (
    <div className="chat-trace">
      {messages.map((m, i) => {
        if (m.role === "system" && collapseSystem) {
          return <SystemCollapsible key={i} content={m.content} />;
        }
        return <ChatTurn key={i} msg={m} dense={dense} />;
      })}
    </div>
  );
}

function ChatTurn({ msg, dense }: { msg: Message; dense: boolean }) {
  const isMono = msg.role === "system" || msg.role === "tool";
  return (
    <div className={`trace-msg chat-trace__turn${dense ? " chat-trace__turn--dense" : ""}`}>
      <div className="chat-trace__pill">
        <span className="role-pill" data-role={msg.role}>
          {msg.role}
        </span>
      </div>
      <div
        className={`trace-msg__body ${isMono ? "trace-msg__body--mono" : "trace-msg__body--serif"}`}
      >
        {msg.content}
      </div>
    </div>
  );
}

// System messages are usually long, repeat across the file, and aren't
// what the reviewer is judging. Hide behind a summary by default.
function SystemCollapsible({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="chat-trace__system">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="chat-trace__systemSummary"
      >
        <span className="role-pill" data-role="system">
          system
        </span>
        <span>{open ? "hide system prompt" : "show system prompt"}</span>
      </button>
      {open && (
        <div className="trace-msg__body trace-msg__body--mono chat-trace__systemBody">
          {content}
        </div>
      )}
    </div>
  );
}
