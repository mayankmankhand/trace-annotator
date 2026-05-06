"use client";

import type { Message, Trace } from "@/lib/trace/types";
import { parseToolCalls, type ToolCallInfo } from "@/lib/trace/tool-calls";

// AgentRenderer (issue #53). Same single-column skeleton as the chat
// renderer, but tool_call rows render as `.tool-block` cards with
// args/result rows and a status dot. Selected when detect.ts finds 2 or
// more tool messages in a trace.
//
// We treat any of the following as a tool turn:
//   - role: "tool" message (the result, with optional name in metadata)
//   - assistant message that parses as one or more inline tool_use blocks

type Step =
  | { kind: "message"; msg: Message }
  | {
      kind: "tool";
      name: string;
      args: unknown;
      result: string | null;
      ok: boolean;
    };

function buildSteps(messages: Message[]): Step[] {
  const steps: Step[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role === "tool") {
      // Pair this result with the most recent tool-call we emitted.
      // Walk backwards through `steps` to find the unfilled call.
      const pendingIdx = (() => {
        for (let j = steps.length - 1; j >= 0; j--) {
          const s = steps[j];
          if (s.kind === "tool" && s.result === null) return j;
        }
        return -1;
      })();
      if (pendingIdx >= 0) {
        const pending = steps[pendingIdx] as Extract<Step, { kind: "tool" }>;
        pending.result = m.content;
        // Heuristic: if the result text starts with "Error" assume failure;
        // otherwise treat as ok. Real telemetry would carry an explicit
        // status field but most JSON-export shapes drop it.
        pending.ok = !/^error[:\s]/i.test(m.content.trim());
      } else {
        // Orphan tool result: treat it as a status row with no name.
        steps.push({
          kind: "tool",
          name: "tool",
          args: null,
          result: m.content,
          ok: !/^error[:\s]/i.test(m.content.trim()),
        });
      }
      continue;
    }

    const calls: ToolCallInfo[] = parseToolCalls(m.content);
    if (calls.length > 0) {
      // If the assistant emitted prose alongside the tool calls (only
      // possible when parseToolCalls accepts the wrapper but the content
      // also contains text), surface the prose as a separate message.
      // Most provider shapes either give us pure JSON or a wrapper, so
      // we keep it simple: render the calls and skip the prose.
      for (const tc of calls) {
        steps.push({
          kind: "tool",
          name: tc.name,
          args: tc.args,
          result: null,
          ok: true,
        });
      }
      continue;
    }

    steps.push({ kind: "message", msg: m });
  }
  return steps;
}

function previewArgs(args: unknown): string {
  try {
    if (args === null || args === undefined) return "";
    return JSON.stringify(args);
  } catch {
    return "(unserializable args)";
  }
}

function previewResult(result: string | null): string {
  if (!result) return "";
  return result;
}

export function AgentRenderer({ trace }: { trace: Trace }) {
  const messages = [...trace.input, ...trace.output];
  const steps = buildSteps(messages);

  return (
    <div className="agent-trace">
      {steps.map((step, i) => {
        if (step.kind === "message") {
          const m = step.msg;
          const isSerif =
            m.role === "user" || m.role === "assistant";
          return (
            <div key={i} className="trace-msg agent-trace__msg">
              <div className="agent-trace__pill">
                <span className="role-pill" data-role={m.role}>
                  {m.role}
                </span>
              </div>
              <div
                className={`trace-msg__body ${isSerif ? "trace-msg__body--serif" : "trace-msg__body--mono"}`}
              >
                {m.content}
              </div>
            </div>
          );
        }

        return (
          <div key={i} className="trace-msg agent-trace__tool">
            <div className="agent-trace__pill">
              <span className="role-pill" data-role="tool">
                tool · {step.name}
              </span>
              <span
                className="agent-trace__status"
                data-ok={step.ok ? "true" : "false"}
              >
                {step.ok ? "ok" : "error"}
              </span>
            </div>
            <div className="tool-block">
              {step.args !== null && (
                <div className="tool-block__row">
                  <span className="tool-block__label">args</span>
                  <code>{previewArgs(step.args)}</code>
                </div>
              )}
              {step.result !== null && (
                <div className="tool-block__row">
                  <span className="tool-block__label">{"→"}</span>
                  <code data-ok={step.ok ? "true" : "false"}>
                    {previewResult(step.result)}
                  </code>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
