/**
 * One row of a label export file.
 * Each row corresponds to one annotated trace in the session.
 *
 * trace_id   - matches Trace.id from the source file
 * verdict    - "pass" or "fail"; null if the trace was touched but no verdict applied
 * tags       - failure mode labels (open coding, can be empty)
 * note       - free-text note from the reviewer (can be empty)
 * labeled_at - ISO 8601 timestamp, set when any annotation was first recorded
 */
export type LabelRow = {
  trace_id: string;
  verdict: "pass" | "fail" | null;
  tags: string[];
  note: string;
  labeled_at: string;
};
