"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Trace } from "@/lib/trace/types";
import type { LabelRow } from "@/lib/labels/types";
import { serialize, mimeType, fileName } from "@/lib/labels/serialize";
import { TraceRenderer } from "@/components/renderer/TraceRenderer";
import { TagPanel } from "./TagPanel";

export type Verdict = "pass" | "fail";
export type Annotation = {
  verdict: Verdict | null;
  note: string;
  tags: string[];
  labeledAt: string;
  isEdited: boolean;
};
export type Annotations = Record<string, Annotation>;

const EMPTY_ANNOTATION: Annotation = {
  verdict: null,
  note: "",
  tags: [],
  labeledAt: "",
  isEdited: false,
};

function toRows(annotations: Annotations): LabelRow[] {
  return Object.entries(annotations)
    .filter(([, a]) => a.verdict !== null || a.tags.length > 0 || a.note.trim() !== "")
    .map(([id, a]) => ({
      trace_id: id,
      verdict: a.verdict,
      tags: a.tags,
      note: a.note,
      labeled_at: a.labeledAt || new Date().toISOString(),
    }));
}

function getOrEmpty(annotations: Annotations, id: string): Annotation {
  return annotations[id] ?? EMPTY_ANNOTATION;
}

type Props = {
  traces: Trace[];
  onReset: () => void;
};

export function TraceView({ traces, onReset }: Props) {
  const [index, setIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotations>({});
  const [allTags, setAllTags] = useState<string[]>([]);
  const total = traces.length;
  const trace = traces[index];
  const annotation = getOrEmpty(annotations, trace.id);
  const labeledCount = Object.values(annotations).filter((a) => a.verdict !== null).length;
  const labelProgressPct = (labeledCount / total) * 100;

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(total - 1, i + delta)));
    },
    [total],
  );

  const applyVerdict = useCallback(
    (v: Verdict) => {
      setAnnotations((prev) => {
        const cur = getOrEmpty(prev, trace.id);
        const isEdited = cur.isEdited || (cur.verdict !== null && cur.verdict !== v);
        return {
          ...prev,
          [trace.id]: {
            ...cur,
            verdict: v,
            isEdited,
            labeledAt: cur.labeledAt || new Date().toISOString(),
          },
        };
      });
    },
    [trace.id],
  );

  const updateAnnotation = useCallback(
    (a: Annotation) => {
      setAnnotations((prev) => ({
        ...prev,
        [trace.id]: {
          ...a,
          labeledAt: a.labeledAt || new Date().toISOString(),
        },
      }));
    },
    [trace.id],
  );

  const addTagToSession = useCallback((tag: string) => {
    setAllTags((prev) => {
      const without = prev.filter((t) => t !== tag);
      return [tag, ...without];
    });
  }, []);

  const applyQuickTag = useCallback(
    (tag: string) => {
      setAnnotations((prev) => {
        const cur = getOrEmpty(prev, trace.id);
        if (cur.tags.includes(tag)) return prev;
        return { ...prev, [trace.id]: { ...cur, tags: [...cur.tags, tag] } };
      });
      addTagToSession(tag);
    },
    [trace.id, addTagToSession],
  );

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;
      if (inInput) return;

      switch (e.key) {
        case "p":
        case "P":
          applyVerdict("pass");
          break;
        case "f":
        case "F":
          applyVerdict("fail");
          break;
        case "ArrowRight":
        case "Enter":
          if (!e.shiftKey) go(1);
          break;
        case "ArrowLeft":
          go(-1);
          break;
        case "1":
        case "2":
        case "3":
        case "4": {
          const i = Number(e.key) - 1;
          if (allTags[i]) applyQuickTag(allTags[i]);
          break;
        }
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [go, applyVerdict, applyQuickTag, allTags]);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const rows = toRows(annotations);
    if (rows.length === 0) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch("/api/save-labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      }).catch(() => {});
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [annotations]);

  function handleExport(format: "jsonl" | "csv") {
    const rows = toRows(annotations);
    if (rows.length === 0) return;
    const content = serialize(rows, format);
    const blob = new Blob([content], { type: mimeType(format) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(format);
    a.click();
    URL.revokeObjectURL(url);
  }

  const topTags = allTags.slice(0, 4);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="border-b bg-white px-4 py-3 flex items-center justify-between sticky top-0 z-10 shadow-sm">
        <button
          type="button"
          onClick={onReset}
          className="text-sm text-gray-500 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Load new file
        </button>
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700">
            Trace{" "}
            <span aria-live="polite">
              {index + 1} of {total}
            </span>
          </p>
          <p
            aria-live="polite"
            aria-atomic="true"
            className="text-xs text-gray-500 mt-0.5"
          >
            {labeledCount} of {total} labeled
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ExportButton onExport={handleExport} disabled={labeledCount === 0} />
        </div>
      </header>

      <div
        role="progressbar"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-label="Annotation progress"
        className="h-1 bg-gray-200"
      >
        <div
          className="h-1 bg-blue-500 transition-[width] duration-200"
          style={{ width: `${labelProgressPct}%` }}
        />
      </div>

      <main className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="mb-3 flex items-center flex-wrap gap-2">
            <span className="text-xs font-mono text-gray-400">id: {trace.id}</span>
            {annotation.verdict && <VerdictBadge verdict={annotation.verdict} />}
            {annotation.isEdited && (
              <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                Edited
              </span>
            )}
            {annotation.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800"
              >
                {t}
              </span>
            ))}
          </div>

          <TraceRenderer trace={trace} collapseSystem />

          <TagPanel
            annotation={annotation}
            allTags={allTags}
            onUpdate={updateAnnotation}
            onTagCreated={addTagToSession}
          />
        </div>
      </main>

      <nav
        aria-label="Trace navigation and labeling"
        className="border-t bg-white sticky bottom-0 shadow-[0_-1px_3px_rgba(0,0,0,0.06)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-4">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => go(-1)}
            aria-label="Previous trace"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span aria-hidden="true">&#8592;</span> Prev
          </button>

          <div className="flex items-center gap-2" role="group" aria-label="Label verdict">
            <VerdictButton
              verdict="pass"
              current={annotation.verdict}
              onClick={() => applyVerdict("pass")}
            />
            <VerdictButton
              verdict="fail"
              current={annotation.verdict}
              onClick={() => applyVerdict("fail")}
            />
          </div>

          <button
            type="button"
            disabled={index === total - 1}
            onClick={() => go(1)}
            aria-label="Next trace"
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Next <span aria-hidden="true">&#8594;</span>
          </button>
        </div>

        {topTags.length > 0 && (
          <div
            aria-label="Quick-apply failure mode tags"
            className="border-t px-4 py-2 flex gap-2 flex-wrap"
          >
            {topTags.map((tag, i) => (
              <button
                key={tag}
                type="button"
                onClick={() => applyQuickTag(tag)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                  annotation.tags.includes(tag)
                    ? "bg-violet-600 border-violet-600 text-white"
                    : "border-violet-300 text-violet-700 hover:bg-violet-50"
                }`}
              >
                <kbd className="font-mono opacity-70">[{i + 1}]</kbd>
                {tag}
              </button>
            ))}
          </div>
        )}

        <div
          aria-label="Keyboard shortcuts"
          className="border-t bg-gray-50 px-4 py-1.5 flex items-center justify-center gap-5 text-xs text-gray-400"
        >
          <span><kbd className="font-mono font-semibold text-gray-500">P</kbd> Pass</span>
          <span><kbd className="font-mono font-semibold text-gray-500">F</kbd> Fail</span>
          <span><kbd className="font-mono font-semibold text-gray-500">&#8592; &#8594;</kbd> Navigate</span>
          <span><kbd className="font-mono font-semibold text-gray-500">Enter</kbd> Next</span>
          {topTags.length > 0 && (
            <span><kbd className="font-mono font-semibold text-gray-500">1-{Math.min(4, topTags.length)}</kbd> Tag</span>
          )}
        </div>
      </nav>
    </div>
  );
}

function VerdictButton({
  verdict,
  current,
  onClick,
}: {
  verdict: Verdict;
  current: Verdict | null;
  onClick: () => void;
}) {
  const isActive = current === verdict;
  const isPass = verdict === "pass";
  const key = isPass ? "P" : "F";

  const base =
    "flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1";
  const active = isPass
    ? "bg-green-600 border-green-600 text-white"
    : "bg-red-600 border-red-600 text-white";
  const inactive = isPass
    ? "border-green-300 text-green-700 hover:bg-green-50"
    : "border-red-300 text-red-700 hover:bg-red-50";
  const ring = isPass ? "focus-visible:ring-green-500" : "focus-visible:ring-red-500";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={`${base} ${isActive ? active : inactive} ${ring}`}
    >
      <kbd className="text-[10px] font-mono opacity-70">[{key}]</kbd>
      {isPass ? "Pass" : "Fail"}
    </button>
  );
}

function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const isPass = verdict === "pass";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isPass ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}
    >
      {isPass ? "Pass" : "Fail"}
    </span>
  );
}

function ExportButton({
  onExport,
  disabled,
}: {
  onExport: (fmt: "jsonl" | "csv") => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded shadow-lg z-20 min-w-[120px]">
          {(["jsonl", "csv"] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => {
                onExport(fmt);
                setOpen(false);
              }}
              className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Download .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
