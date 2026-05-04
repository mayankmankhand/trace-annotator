// Tool-call extraction helpers (v3, #37 power-user analysis - tool-call
// correctness review).
//
// LLM traces commonly include "tool calls" - the assistant invoking a
// function with arguments. Different providers encode them differently
// (Anthropic tool_use, OpenAI function_call, OpenAI tool_calls,
// custom-shaped JSON). The renderer already deals with this in
// ToolCallRenderer.tsx; this module factors the parsing out so the v3 review
// panel can list the same set of tool calls and let the user pass/fail each.
//
// Multi-call awareness: a single message can encode multiple tool calls
// (OpenAI tool_calls is an array, Anthropic content blocks can list many
// tool_use entries in parallel). parseToolCalls returns ALL of them so the
// renderer shows N cards and the review panel lets the user verdict each.
//
// Stable indexing: each tool call's index is its sequential ordinal in the
// flattened tool-call list across the whole trace (input + output, in
// order). That's stable for a given trace (traces are immutable once
// loaded), so it's a safe key for review verdicts in
// LabelRow.tool_call_reviews.

import type { Message, Trace } from "./types";

export type ToolCallInfo = {
  name: string;
  args: unknown;
};

export type ToolCall = ToolCallInfo & {
  // Sequential ordinal across the trace's flattened tool-call list. Used as
  // the dictionary key for review verdicts.
  index: number;
};

// Coerce a possibly-string "arguments" value into JSON if it parses, or
// return as-is. OpenAI commonly sends arguments as a JSON-encoded string;
// Anthropic sends it as an object. We accept both.
function decodeArgs(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

// Parse one entry from a tool_calls / content-blocks array.
function parseToolCallEntry(entry: unknown): ToolCallInfo | null {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const e = entry as Record<string, unknown>;

  // Anthropic content block: { type: "tool_use", name, input }
  if (e.type === "tool_use" && typeof e.name === "string") {
    return { name: e.name, args: e.input ?? {} };
  }

  // OpenAI tool_calls[] item: { type: "function", function: { name, arguments } }
  if (
    e.type === "function" &&
    e.function &&
    typeof (e.function as Record<string, unknown>).name === "string"
  ) {
    const fn = e.function as Record<string, unknown>;
    return { name: fn.name as string, args: decodeArgs(fn.arguments) };
  }

  // OpenAI tool_calls[] item without explicit type: { function: { name, arguments } }
  if (
    e.function &&
    typeof e.function === "object" &&
    typeof (e.function as Record<string, unknown>).name === "string"
  ) {
    const fn = e.function as Record<string, unknown>;
    return { name: fn.name as string, args: decodeArgs(fn.arguments) };
  }

  // Older / custom shape: { name, arguments } or { name, input } directly
  if (typeof e.name === "string") {
    const args = e.arguments ?? e.input ?? {};
    return { name: e.name, args: decodeArgs(args) };
  }

  return null;
}

// Parse a single message's content into a list of tool-call descriptors.
// Returns an empty array if the content is not a tool call (the caller
// should fall through to the normal text rendering / no review affordance).
//
// Replaces the previous single-result version, which silently dropped all
// but the first tool call when a message contained an array.
export function parseToolCalls(content: string): ToolCallInfo[] {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  // Top-level array: each entry is a tool call. Common in Anthropic content
  // blocks and in raw OpenAI tool_calls arrays serialized as the message body.
  if (Array.isArray(parsed)) {
    const out: ToolCallInfo[] = [];
    for (const entry of parsed) {
      const tc = parseToolCallEntry(entry);
      if (tc) out.push(tc);
    }
    return out;
  }

  if (typeof parsed === "object" && parsed !== null) {
    const obj = parsed as Record<string, unknown>;

    // Anthropic single-block: { type: "tool_use", name, input }
    if (obj.type === "tool_use" && typeof obj.name === "string") {
      return [{ name: obj.name, args: obj.input ?? {} }];
    }

    // OpenAI legacy: { function_call: { name, arguments } }
    if ("function_call" in obj) {
      const fc = obj.function_call as Record<string, unknown>;
      return [
        {
          name: (fc.name as string) ?? "unknown",
          args: decodeArgs(fc.arguments),
        },
      ];
    }

    // OpenAI new: { tool_calls: [ { function: { name, arguments } }, ... ] }
    // This is the multi-call case the previous parser silently truncated.
    if ("tool_calls" in obj && Array.isArray(obj.tool_calls)) {
      const out: ToolCallInfo[] = [];
      for (const entry of obj.tool_calls) {
        const tc = parseToolCallEntry(entry);
        if (tc) out.push(tc);
      }
      return out;
    }

    // Custom flat shape: { name, arguments }
    if ("name" in obj && "arguments" in obj && typeof obj.name === "string") {
      return [{ name: obj.name, args: decodeArgs(obj.arguments) }];
    }
  }

  return [];
}

// Backward-compatible single-result helper. Returns the first tool call from
// a message, or null. Kept for callers that only need to know "is this
// message a tool call?" (e.g. the renderer's per-message branch).
export function parseToolCallContent(content: string): ToolCallInfo | null {
  const all = parseToolCalls(content);
  return all.length > 0 ? all[0] : null;
}

// Extract every tool call from a trace, in [...input, ...output] message
// order, with sequential ordinal indices across the whole flattened list.
// Index is the key for review verdicts in LabelRow.tool_call_reviews and is
// stable as long as the trace itself is (traces are immutable once loaded).
export function extractToolCalls(trace: Trace): ToolCall[] {
  const all: Message[] = [...trace.input, ...trace.output];
  const out: ToolCall[] = [];
  let ordinal = 0;
  for (const m of all) {
    const calls = parseToolCalls(m.content);
    for (const tc of calls) {
      out.push({ index: ordinal, name: tc.name, args: tc.args });
      ordinal++;
    }
  }
  return out;
}

export type ToolCallVerdict = "right" | "wrong" | "skip";
export type ToolCallReviews = Record<number, ToolCallVerdict>;
