import type { Trace } from "@/lib/trace/types";

export type RendererType = "chat" | "email" | "tool-call" | "generic";

function looksLikeToolCall(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.some(
        (item) =>
          item !== null &&
          typeof item === "object" &&
          "type" in (item as object) &&
          ((item as Record<string, unknown>).type === "tool_use" ||
            (item as Record<string, unknown>).type === "function"),
      );
    }
    if (typeof parsed !== "object" || parsed === null) return false;
    const obj = parsed as Record<string, unknown>;
    return (
      "function_call" in obj ||
      "tool_calls" in obj ||
      obj.type === "tool_use" ||
      ("name" in obj && "arguments" in obj)
    );
  } catch {
    return false;
  }
}

function looksLikeEmail(content: string): boolean {
  return /^(From|To|Subject):\s/im.test(content);
}

export function detectRenderer(trace: Trace): RendererType {
  const all = [...trace.input, ...trace.output];

  if (all.some((m) => m.role === "tool")) return "tool-call";
  if (all.some((m) => looksLikeToolCall(m.content))) return "tool-call";

  const outputText = trace.output.map((m) => m.content).join("\n");
  if (looksLikeEmail(outputText)) return "email";

  if (
    all.some(
      (m) =>
        m.role === "user" || m.role === "assistant" || m.role === "system",
    )
  ) {
    return "chat";
  }

  return "generic";
}
