// String-based trace similarity (v3, #37 power analysis).
//
// TF-IDF + cosine similarity over the concatenated text of every message in
// each trace. Picked over an embedding model (transformers.js +
// all-MiniLM-L6-v2) for v3.0 because:
//   - Zero bundle cost (pure JS, no model download)
//   - Fast enough for typical trace counts (a few thousand)
//   - "Good enough" for "find related traces" surface use
//   - Upgrade path to embeddings is preserved if quality bar isn't met
//
// The first call builds and caches an index keyed by the file fingerprint.
// Subsequent calls reuse it. Loading a different file uses a different key
// so the cache stays correct without manual invalidation.

import type { Trace } from "./trace/types";

type Vector = Map<string, number>;

type ComputedIndex = {
  vectors: Map<string, Vector>;
  norms: Map<string, number>;
};

// Single-entry cache. Earlier versions used `Map<key, index>` which grew
// unbounded across multi-file sessions (each cached `ComputedIndex` holds a
// `Map<traceId, Map<token, weight>>` and can be tens of MB). Keeping at most
// one entry is enough for the actual lifecycle (one file at a time) and
// evicts the previous index automatically when a new file is loaded.
let cached: { key: string; index: ComputedIndex } | null = null;

// Word-level tokenizer. Unicode-aware so non-English traces still split into
// reasonable tokens. NFKC normalize so accent variants don't fragment the
// vocabulary. Drops punctuation and whitespace.
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);
}

function traceText(trace: Trace): string {
  let out = "";
  for (const m of trace.input) out += m.content + " ";
  for (const m of trace.output) out += m.content + " ";
  return out;
}

function buildIndex(traces: Trace[]): ComputedIndex {
  const docTokens = new Map<string, string[]>();
  for (const t of traces) {
    docTokens.set(t.id, tokenize(traceText(t)));
  }
  // Document frequency: how many docs contain each term.
  const df = new Map<string, number>();
  for (const tokens of docTokens.values()) {
    const seen = new Set(tokens);
    for (const tok of seen) {
      df.set(tok, (df.get(tok) ?? 0) + 1);
    }
  }
  const N = Math.max(traces.length, 1);
  const vectors = new Map<string, Vector>();
  const norms = new Map<string, number>();
  for (const [id, tokens] of docTokens) {
    const tf = new Map<string, number>();
    for (const tok of tokens) {
      tf.set(tok, (tf.get(tok) ?? 0) + 1);
    }
    const vec: Vector = new Map();
    let normSq = 0;
    for (const [tok, count] of tf) {
      const dfCount = df.get(tok) ?? 1;
      // Add-one smoothed IDF. Always non-negative; rare terms weight more.
      const idf = Math.log(1 + N / dfCount);
      const w = count * idf;
      vec.set(tok, w);
      normSq += w * w;
    }
    vectors.set(id, vec);
    norms.set(id, Math.sqrt(normSq));
  }
  return { vectors, norms };
}

function cosine(a: Vector, b: Vector, normA: number, normB: number): number {
  if (normA === 0 || normB === 0) return 0;
  // Iterate over the smaller vector for performance.
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [tok, weight] of smaller) {
    const other = larger.get(tok);
    if (other !== undefined) dot += weight * other;
  }
  return dot / (normA * normB);
}

/**
 * Find the topK traces most similar to currentTraceId.
 *
 * @param cacheKey - identifies the trace set (e.g. file fingerprint). Same
 *   key reuses the precomputed index; different key rebuilds.
 * @param traces - the full trace set to compare against
 * @param currentTraceId - exclude this trace from results
 * @param topK - return at most this many results
 *
 * Returns sorted by score descending, then trace ID ascending so ordering is
 * deterministic when two traces tie.
 */
export function findSimilar(
  cacheKey: string,
  traces: Trace[],
  currentTraceId: string,
  topK = 5,
): Array<{ traceId: string; score: number }> {
  if (!cached || cached.key !== cacheKey) {
    cached = { key: cacheKey, index: buildIndex(traces) };
  }
  const index = cached.index;
  const ownVec = index.vectors.get(currentTraceId);
  const ownNorm = index.norms.get(currentTraceId);
  if (!ownVec || ownNorm === undefined) return [];

  const scores: Array<{ traceId: string; score: number }> = [];
  for (const [id, vec] of index.vectors) {
    if (id === currentTraceId) continue;
    const score = cosine(ownVec, vec, ownNorm, index.norms.get(id) ?? 0);
    if (score > 0) scores.push({ traceId: id, score });
  }
  scores.sort(
    (a, b) => b.score - a.score || a.traceId.localeCompare(b.traceId),
  );
  return scores.slice(0, topK);
}

// Drop the cached index. Optional cacheKey only clears when it matches the
// currently-cached key; omit it to clear unconditionally. Safe to call when
// nothing is cached.
export function clearSimilarityCache(cacheKey?: string): void {
  if (cacheKey === undefined || cached?.key === cacheKey) {
    cached = null;
  }
}
