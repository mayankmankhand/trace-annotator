"use client";

import type { Trace } from "@/lib/trace/types";

// RagRenderer (issue #53). Renders a retrieval-augmented trace as
// query -> retrieved chunks -> answer. Unused chunks dim to 65% so the
// reviewer's eye is drawn to the chunks the model actually grounded in.
//
// We accept a few common metadata shapes:
//   - chunks: [{id, text, score, source, used}]
//   - retrieved_chunks: same shape, alternate field name
//   - retrieved_context: a single string (collapsed into one chunk)
//   - sources: [{title, snippet, score}]
// Anything we cannot parse falls through to a query/answer pair only.

type Chunk = {
  id: string;
  text: string;
  score: number | null;
  source: string | null;
  used: boolean;
};

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function normalizeChunks(metadata: Record<string, unknown>): Chunk[] {
  const fromList = (raw: unknown): Chunk[] | null => {
    if (!Array.isArray(raw)) return null;
    return raw.map((item, i) => {
      const c = (item ?? {}) as Record<string, unknown>;
      return {
        id: asString(c.id) ?? `c${i + 1}`,
        text: asString(c.text) ?? asString(c.snippet) ?? asString(c.content) ?? "",
        score: asNumber(c.score) ?? asNumber(c.match) ?? null,
        source: asString(c.source) ?? asString(c.title) ?? asString(c.path) ?? null,
        used: c.used === true,
      };
    });
  };

  const direct = fromList(metadata.chunks) ?? fromList(metadata.retrieved_chunks);
  if (direct && direct.length > 0) return direct;

  const sources = fromList(metadata.sources);
  if (sources && sources.length > 0) return sources;

  const single = asString(metadata.retrieved_context);
  if (single && single.trim() !== "") {
    return [
      {
        id: "c1",
        text: single,
        score: null,
        source: asString(metadata.retrieved_source) ?? null,
        used: true,
      },
    ];
  }

  return [];
}

function deriveQuery(trace: Trace): string {
  const fromMeta = asString((trace.metadata ?? {}).query);
  if (fromMeta) return fromMeta;
  const firstUser = trace.input.find((m) => m.role === "user");
  if (firstUser) return firstUser.content;
  if (trace.input.length > 0) return trace.input[0].content;
  return "";
}

function deriveAnswer(trace: Trace): string {
  if (trace.output.length === 0) return "";
  return trace.output.map((m) => m.content).join("\n\n");
}

export function RagRenderer({ trace }: { trace: Trace }) {
  const metadata = (trace.metadata ?? {}) as Record<string, unknown>;
  const chunks = normalizeChunks(metadata);
  const query = deriveQuery(trace);
  const answer = deriveAnswer(trace);

  return (
    <div className="rag-trace">
      {query && (
        <div className="rag-trace__query">
          <span className="role-pill" data-role="user">
            query
          </span>
          <p className="rag-trace__queryText">{query}</p>
        </div>
      )}

      {chunks.length > 0 && (
        <div className="rag-trace__chunks">
          <div className="rag-trace__retrievedLabel">
            retrieved {chunks.length === 1 ? "1 chunk" : `${chunks.length} chunks`}
          </div>
          <div className="rag-trace__chunkList">
            {chunks.map((c) => (
              <div
                key={c.id}
                className={`rag-chunk${c.used ? " rag-chunk--used" : ""}`}
              >
                <div className="rag-chunk__head">
                  {c.source && (
                    <span className="rag-chunk__source" title="Source the retriever pulled this chunk from">
                      {c.source}
                    </span>
                  )}
                  {c.score !== null && (
                    <span
                      className="rag-chunk__score"
                      title="Retriever similarity score (0-1). Higher = stronger match."
                    >
                      match {c.score.toFixed(2)}
                    </span>
                  )}
                  {c.used && (
                    <span
                      className="rag-chunk__used"
                      title="The model's answer references this chunk."
                    >
                      used
                    </span>
                  )}
                </div>
                <div className="rag-chunk__text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {answer && (
        <>
          <hr className="ta-rule ta-rule--dotted rag-trace__divider" />
          <div className="rag-trace__answer">
            <span className="role-pill" data-role="assistant">
              answer
            </span>
            <p className="rag-trace__answerText">{answer}</p>
          </div>
        </>
      )}
    </div>
  );
}
