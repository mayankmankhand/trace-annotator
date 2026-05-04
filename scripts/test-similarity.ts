#!/usr/bin/env -S npx tsx
// Smoke test for the v3 similarity module (src/lib/similarity.ts). Mirrors
// the test-fixtures.ts pattern: simple PASS/FAIL prints, exit code reflects
// total failures. Run via: npx tsx scripts/test-similarity.ts

import {
  findSimilar,
  tokenize,
  clearSimilarityCache,
} from "../src/lib/similarity";
import type { Trace } from "../src/lib/trace/types";

let pass = 0;
let fail = 0;

function check(name: string, cond: boolean, hint?: string) {
  if (cond) {
    pass++;
    console.log(`PASS  ${name}`);
  } else {
    fail++;
    console.log(`FAIL  ${name}${hint ? `  -> ${hint}` : ""}`);
  }
}

function makeTrace(id: string, text: string): Trace {
  return {
    id,
    input: [{ role: "user", content: text }],
    output: [{ role: "assistant", content: "" }],
  };
}

// Case 1: tokenizer basics.
{
  const tokens = tokenize("Hello, World! 123 foo-bar");
  check(
    "tokenize splits on non-alphanumeric",
    tokens.join("|") === "hello|world|123|foo|bar",
    `got ${tokens.join("|")}`,
  );
}

// Case 2: tokenizer handles unicode.
{
  const tokens = tokenize("naïve café 日本語");
  check(
    "tokenize handles unicode letters",
    tokens.includes("naïve") && tokens.includes("café") && tokens.includes("日本語"),
    `got ${tokens.join("|")}`,
  );
}

// Case 3: empty traces don't crash and return no results.
{
  const traces = [
    makeTrace("a", ""),
    makeTrace("b", ""),
    makeTrace("c", ""),
  ];
  const results = findSimilar("empty-test", traces, "a", 5);
  // All-empty traces have zero norms; cosine returns 0 for every pair, so
  // none make it past the score > 0 filter. Empty result is correct.
  check(
    "empty traces return no results",
    results.length === 0,
    `got ${results.length}`,
  );
}

// Case 4: near-duplicates rank highest. Trace "a" should be most similar
// to its near-duplicate "b" rather than the unrelated "c".
{
  const traces = [
    makeTrace("a", "the quick brown fox jumps over the lazy dog"),
    makeTrace("b", "the quick brown fox jumps over the lazy cat"),
    makeTrace("c", "completely unrelated content about gardening"),
  ];
  const results = findSimilar("dup-test", traces, "a", 5);
  check(
    "near-duplicate ranks first",
    results.length >= 1 && results[0].traceId === "b",
    `got ${results.map((r) => r.traceId).join(",")}`,
  );
}

// Case 5: no self-match. The current trace must never appear in its own
// similar list.
{
  const traces = [
    makeTrace("a", "shared content"),
    makeTrace("b", "shared content"),
    makeTrace("c", "shared content"),
  ];
  const results = findSimilar("self-test", traces, "a", 5);
  check(
    "self is not returned",
    !results.some((r) => r.traceId === "a"),
    `got ${results.map((r) => r.traceId).join(",")}`,
  );
}

// Case 6: deterministic ordering for ties. With three identical traces, the
// non-self ones should come back in trace ID order.
{
  const traces = [
    makeTrace("z", "shared content"),
    makeTrace("a", "shared content"),
    makeTrace("m", "shared content"),
  ];
  const results = findSimilar("tie-test", traces, "z", 5);
  // Both "a" and "m" tie on score (they're identical). ID-asc tiebreak ->
  // "a" before "m".
  check(
    "ties broken by trace ID ascending",
    results.length === 2 &&
      results[0].traceId === "a" &&
      results[1].traceId === "m",
    `got ${results.map((r) => r.traceId).join(",")}`,
  );
}

// Case 7: caching works. Calling twice with the same key shouldn't recompute
// (functionally equivalent results). We can't directly observe the cache,
// but we can verify a clear works without throwing.
{
  const traces = [
    makeTrace("a", "alpha beta gamma"),
    makeTrace("b", "alpha beta gamma"),
  ];
  const r1 = findSimilar("cache-test", traces, "a", 5);
  const r2 = findSimilar("cache-test", traces, "a", 5);
  clearSimilarityCache("cache-test");
  const r3 = findSimilar("cache-test", traces, "a", 5);
  check(
    "results are stable across calls and after cache clear",
    r1.length === r2.length &&
      r2.length === r3.length &&
      r1[0]?.traceId === r2[0]?.traceId &&
      r2[0]?.traceId === r3[0]?.traceId,
    `lengths ${r1.length}/${r2.length}/${r3.length}`,
  );
}

// Case 8: missing trace ID returns empty.
{
  const traces = [makeTrace("a", "hello")];
  const results = findSimilar("missing-test", traces, "nonexistent", 5);
  check(
    "missing current trace ID returns empty",
    results.length === 0,
    `got ${results.length}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
