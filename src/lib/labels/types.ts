/**
 * One row of a label export file.
 * Each row corresponds to one annotated trace in the session.
 *
 * trace_id            - matches Trace.id from the source file
 * verdict             - "pass" or "fail"; null if the trace was touched but no verdict applied
 * tags                - failure mode labels (open coding, can be empty)
 * note                - free-text note from the reviewer (can be empty)
 * labeled_at          - ISO 8601 timestamp, set when any annotation was first recorded
 * skipped             - (v3.1, optional) "needs review later" marker.
 *                       Independent of verdict so a user can mark a trace
 *                       skipped before deciding pass/fail. Absent on
 *                       existing v1/v2/v3 labels; CSV export drops it
 *                       (JSONL preserves it).
 * tool_call_reviews   - (v3, optional) per-tool-call correctness verdict.
 *                       Keyed by the tool call's stable index (its position
 *                       in the trace's combined input+output message
 *                       stream). Absent on existing v1/v2 labels; CSV
 *                       export drops it (JSONL preserves it).
 */
export type LabelRow = {
  trace_id: string;
  verdict: "pass" | "fail" | null;
  tags: string[];
  note: string;
  labeled_at: string;
  skipped?: boolean;
  tool_call_reviews?: Record<number, "right" | "wrong" | "skip">;
};
