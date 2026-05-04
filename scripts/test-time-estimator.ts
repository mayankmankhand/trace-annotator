#!/usr/bin/env -S npx tsx
// Smoke test for the v3 time estimator (src/lib/time-estimate.ts). Mirrors
// the test-fixtures.ts pattern: simple PASS/FAIL prints, exit code reflects
// total failures. Run via: npx tsx scripts/test-time-estimator.ts

import {
  estimateSecondsRemaining,
  formatRemaining,
} from "../src/lib/time-estimate";
import type { AuditEntry } from "../src/lib/storage";

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

// Build synthetic audit entries with timestamps that differ by `gapsMs`.
// Returns them most-recent-first to match loadRecentAuditEntries' order.
function makeEntries(gapsMs: number[], opts?: { batchAt?: Set<number> }): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let t = Date.parse("2026-05-04T12:00:00Z");
  // gapsMs[i] is the time spent on the (i+1)-th entry (newer minus older).
  // We accumulate forward in time then reverse so the newest is index 0.
  const times: number[] = [t];
  for (const g of gapsMs) {
    t += g;
    times.push(t);
  }
  for (let i = times.length - 1; i >= 0; i--) {
    const e: AuditEntry = {
      fingerprint: "fp",
      trace_id: `t${i}`,
      at: new Date(times[i]).toISOString(),
      before: null,
      after: null,
    };
    if (opts?.batchAt?.has(i)) e.batchId = "batch-1";
    entries.push(e);
  }
  return entries;
}

// Case 1: fewer than 5 valid deltas -> null.
{
  const audit = makeEntries([5_000, 5_000, 5_000]); // 4 entries, 3 deltas
  const r = estimateSecondsRemaining(audit, 100, 4);
  check(
    "under MIN_SAMPLES returns null",
    r === null,
    `got ${r}`,
  );
}

// Case 2: normal case. 21 entries 6s apart -> 20 deltas of 6s each ->
// median 6s -> 6 * remaining seconds.
{
  const gaps = Array(20).fill(6_000);
  const audit = makeEntries(gaps);
  const r = estimateSecondsRemaining(audit, 100, 21);
  // remaining = 100 - 21 = 79; 6 * 79 = 474
  check(
    "normal case: median 6s over 20 deltas",
    r === 474,
    `got ${r}`,
  );
}

// Case 3: batch entries are excluded. 5 normal at 6s + 6 batch at 50ms.
// Batch entries should be filtered, leaving 4 deltas (5 normal entries),
// which is below MIN_SAMPLES -> null.
{
  const gaps = [6_000, 6_000, 6_000, 6_000, 50, 50, 50, 50, 50, 50];
  // Indices 0..5 are most-recent in the output array. Mark indices 0..5
  // as batch (the recent burst) by computing original indices.
  // makeEntries pushes oldest-first into times[], then reverses, so the
  // oldest entry corresponds to original-index 0 (gaps[0] is oldest gap).
  // We want the 6 most-recent entries (newest 6) marked batch, which are
  // entries 0..5 in the *output* (most-recent-first). Their original
  // indices in the times[] array are times.length - 1 - 0..5.
  const batchAt = new Set([0, 1, 2, 3, 4, 5].map((i) => gaps.length - i));
  const audit = makeEntries(gaps, { batchAt });
  const r = estimateSecondsRemaining(audit, 100, 11);
  check(
    "batch entries excluded leaves too few samples -> null",
    r === null,
    `got ${r}`,
  );
}

// Case 4: a 10-minute pause is excluded from the median. 20 normal deltas
// of 4s each plus one 10-minute gap. Median should still be 4s, not skewed.
{
  const gaps = Array(20).fill(4_000);
  gaps[10] = 10 * 60 * 1000; // a 10-minute pause in the middle
  const audit = makeEntries(gaps);
  const r = estimateSecondsRemaining(audit, 100, 21);
  // 4s * 79 remaining = 316s
  check(
    "pause longer than threshold is excluded",
    r === 316,
    `got ${r}`,
  );
}

// Case 5: already done -> 0 seconds.
{
  const audit = makeEntries(Array(10).fill(5_000));
  const r = estimateSecondsRemaining(audit, 50, 50);
  check("labeledCount === total returns 0", r === 0, `got ${r}`);
}

// Case 6: mixed pace. Deltas: [2,2,2,2,2,10,10,10,10,10] -> sorted median
// is between index 4 and 5 = (2+10)/2 = 6.
{
  const gaps = [2_000, 2_000, 2_000, 2_000, 2_000, 10_000, 10_000, 10_000, 10_000, 10_000];
  const audit = makeEntries(gaps);
  const r = estimateSecondsRemaining(audit, 100, 11);
  // 6s * 89 remaining = 534s
  check("mixed pace: median is 6s", r === 534, `got ${r}`);
}

// Case 7: format helper.
check("formatRemaining: under 60s", formatRemaining(45) === "~45s remaining");
check("formatRemaining: minutes", formatRemaining(720) === "~12 min remaining");
check("formatRemaining: hours+minutes", formatRemaining(3900) === "~1h 5m remaining");
check("formatRemaining: zero", formatRemaining(0) === "done");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
