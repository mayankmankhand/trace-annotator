// Time-based progress estimation (v3, issue #42).
//
// Reads the audit log to compute "how long until done?" using a rolling
// median of seconds-per-label. Pure; no IndexedDB or React dependencies, so
// it can be smoke-tested headlessly via scripts/test-time-estimator.ts.
//
// Why median, not mean: a single 30-minute coffee break would skew the mean
// for the rest of the session. Median is robust to outliers we have not
// already filtered (the pause threshold catches the obvious ones, but small
// distractions still happen).
//
// Why the audit log, not annotation timestamps: LabelRow.labeled_at is set
// when an annotation is FIRST recorded and never updates on edits. The audit
// log captures every change, including edits, so its inter-event deltas
// reflect the user's actual labeling cadence.

import type { AuditEntry } from "./storage";

// Treat any inter-event gap longer than this as a "session paused" (lunch,
// got up, switched tabs). Excluding these from the median keeps the
// estimate honest. 5 minutes is short enough to catch real pauses but long
// enough to tolerate a slow trace.
const PAUSE_THRESHOLD_MS = 5 * 60 * 1000;

// Need this many valid deltas before we estimate at all. Below this, the
// median is too noisy to be useful and we hide the subline rather than
// showing a wildly wrong number.
const MIN_SAMPLES = 5;

// Cap on how many recent audit entries we look at. We need MAX_SAMPLES + 1
// entries to compute MAX_SAMPLES deltas. 20 was picked because it covers
// roughly the last 2-3 minutes of normal labeling without sliding too far
// back into older sessions whose pace might no longer be representative.
const MAX_SAMPLES = 20;

/**
 * Estimate seconds remaining to finish labeling the file.
 *
 * @param audit - recent audit entries, ordered most-recent-first (the order
 *   loadRecentAuditEntries returns them in)
 * @param totalTraces - total trace count in the file
 * @param labeledCount - how many traces have a verdict so far
 * @returns whole seconds remaining, or null if there is not enough signal
 */
export function estimateSecondsRemaining(
  audit: AuditEntry[],
  totalTraces: number,
  labeledCount: number,
): number | null {
  const remaining = totalTraces - labeledCount;
  if (remaining <= 0) return 0;

  // Drop batch entries. A batch operation writes one audit row per trace
  // touched, all within milliseconds, which would otherwise tell us the
  // user labels at 100 traces/second.
  const solo = audit.filter((e) => !e.batchId);

  // We need at least MIN_SAMPLES deltas, which means MIN_SAMPLES + 1 entries.
  if (solo.length < MIN_SAMPLES + 1) return null;

  const window = solo.slice(0, MAX_SAMPLES + 1);

  // Compute deltas between consecutive entries. Input is most-recent-first
  // so window[i] is newer than window[i+1]; the delta is the time the user
  // spent on the trace that ended at window[i].
  const deltas: number[] = [];
  for (let i = 0; i < window.length - 1; i++) {
    const newer = Date.parse(window[i].at);
    const older = Date.parse(window[i + 1].at);
    if (Number.isNaN(newer) || Number.isNaN(older)) continue;
    const ms = newer - older;
    if (ms < 0) continue; // out of order; skip rather than negate
    if (ms > PAUSE_THRESHOLD_MS) continue;
    deltas.push(ms);
  }

  if (deltas.length < MIN_SAMPLES) return null;

  const sorted = [...deltas].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return Math.round((medianMs * remaining) / 1000);
}

/**
 * Human-friendly string for the top-bar subline. Returns shapes like
 * "~45s remaining", "~12 min remaining", or "~1h 5m remaining".
 */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "done";
  if (seconds < 60) return `~${seconds}s remaining`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `~${min} min remaining`;
  const hr = Math.floor(min / 60);
  const restMin = min % 60;
  return `~${hr}h ${restMin}m remaining`;
}
