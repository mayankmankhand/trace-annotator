import type { Trace } from "@/lib/trace/types";

// Renderer types (issue #53). Three new shapes added on top of the v2
// fallbacks: rag (query + retrieved chunks + answer), agent (multiple
// tool calls), summarizer (long source doc -> short summary). The chat
// fallback still wins when nothing more specific is detected.
export type RendererType =
  | "chat"
  | "email"
  | "tool-call"
  | "rag"
  | "agent"
  | "summarizer"
  | "generic";

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

// Heuristic field-name match for RAG-style metadata. We accept any of the
// common shapes (single retrieved_context string, chunks array, sources
// array) so the wizard's metadata passthrough is enough to drive
// detection. False positives fall through to chat.
function metadataLooksLikeRag(metadata: Record<string, unknown>): boolean {
  if (typeof metadata.retrieved_context === "string" && metadata.retrieved_context.trim() !== "") {
    return true;
  }
  if (Array.isArray(metadata.chunks) && metadata.chunks.length > 0) return true;
  if (Array.isArray(metadata.retrieved_chunks) && metadata.retrieved_chunks.length > 0) {
    return true;
  }
  if (Array.isArray(metadata.sources) && metadata.sources.length > 0) return true;
  return false;
}

// Summarizer detection: explicit metadata fields (source_doc + summary or
// source + summary). The renderer falls back to splitting input/output if
// the signal is "long input, short output" but we don't auto-detect on
// length alone because plenty of chats look like that too.
function metadataLooksLikeSummarizer(metadata: Record<string, unknown>): boolean {
  const has = (key: string) =>
    typeof metadata[key] === "string" && (metadata[key] as string).trim() !== "";
  if (has("source_doc")) return true;
  if (has("source") && has("summary")) return true;
  if (has("article") && has("summary")) return true;
  return false;
}

export function detectRenderer(trace: Trace): RendererType {
  const all = [...trace.input, ...trace.output];
  const metadata = (trace.metadata ?? {}) as Record<string, unknown>;

  // Summarizer wins over chat when the metadata says so, because the
  // two-column layout is much more useful than rendering the source as a
  // user message.
  if (metadataLooksLikeSummarizer(metadata)) return "summarizer";

  // RAG wins over chat for the same reason: chunks deserve their own
  // surface even when the underlying messages look conversational.
  if (metadataLooksLikeRag(metadata)) return "rag";

  // Agent: 2+ tool messages OR 2+ inline tool_call structures.
  const toolMessages = all.filter((m) => m.role === "tool").length;
  const inlineToolCalls = all.filter((m) => looksLikeToolCall(m.content)).length;
  if (toolMessages + inlineToolCalls >= 2) return "agent";

  // Single tool call: existing tool-call renderer (v2 behavior preserved).
  if (toolMessages > 0 || inlineToolCalls > 0) return "tool-call";

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
