"use client";

import { useState } from "react";
import {
  checkFileSize,
  detectFormat,
  parseCSV,
  parseJSON,
  parseJSONL,
} from "@/lib/trace/parse";
import {
  applyMapping,
  autoRecognize,
  collectFieldNames,
} from "@/lib/trace/mapping";
import type {
  MappingConfig,
  ParseFormat,
  Trace,
} from "@/lib/trace/types";
import { DropZone } from "./DropZone";
import { MappingStep } from "./MappingStep";
import { PreviewStep } from "./PreviewStep";

type Step = "drop" | "mapping" | "preview";

type LoadedSource = {
  filename: string;
  format: ParseFormat;
  rows: Record<string, unknown>[];
  fields: string[];
  autoRecognized: boolean;
};

const STEPS: { id: Step; label: string }[] = [
  { id: "drop", label: "Add file" },
  { id: "mapping", label: "Map fields" },
  { id: "preview", label: "Confirm" },
];

function ensureObjectRows(
  parsed: unknown[],
): { ok: true; rows: Record<string, unknown>[] } | { ok: false; error: string } {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return {
        ok: false,
        error: `Entry ${i + 1} is not an object. Each trace must be a JSON object.`,
      };
    }
    rows.push(item as Record<string, unknown>);
  }
  if (rows.length === 0) {
    return { ok: false, error: "File contains no entries." };
  }
  return { ok: true, rows };
}

export function Wizard({ onDone }: { onDone: (traces: Trace[]) => void }) {
  const [step, setStep] = useState<Step>("drop");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [mapping, setMapping] = useState<MappingConfig | null>(null);
  const [traces, setTraces] = useState<Trace[] | null>(null);
  const [parsing, setParsing] = useState<string | null>(null);

  function reset() {
    setError(null);
    setSource(null);
    setMapping(null);
    setTraces(null);
    setParsing(null);
    setStep("drop");
  }

  async function handleFile(file: File) {
    setError(null);
    setParsing(file.name);
    try {
      const sizeCheck = checkFileSize(file.size);
      if (!sizeCheck.ok) {
        setError(sizeCheck.error);
        return;
      }
      let content: string;
      try {
        content = await file.text();
      } catch (err) {
        setError(`Could not read file: ${(err as Error).message}`);
        return;
      }
      const format = detectFormat(file.name, content);

      let rows: Record<string, unknown>[];
      let fields: string[];

      if (format === "csv") {
        const result = parseCSV(content);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        rows = result.value.rows;
        fields = result.value.headers;
      } else {
        const result = format === "json" ? parseJSON(content) : parseJSONL(content);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const objCheck = ensureObjectRows(result.value);
        if (!objCheck.ok) {
          setError(objCheck.error);
          return;
        }
        rows = objCheck.rows;
        fields = collectFieldNames(rows);
      }

      const auto = autoRecognize(fields);
      const loaded: LoadedSource = {
        filename: file.name,
        format,
        rows,
        fields,
        autoRecognized: auto !== null,
      };
      setSource(loaded);

      if (auto) {
        const applied = applyMapping(rows, auto);
        if (!applied.ok) {
          setMapping(auto);
          setError(applied.error);
          setStep("mapping");
          return;
        }
        setMapping(auto);
        setTraces(applied.value);
        setStep("preview");
      } else {
        setMapping(null);
        setStep("mapping");
      }
    } finally {
      setParsing(null);
    }
  }

  function handleMappingConfirm(config: MappingConfig) {
    if (!source) return;
    const applied = applyMapping(source.rows, config);
    if (!applied.ok) {
      setError(applied.error);
      setMapping(config);
      return;
    }
    setError(null);
    setMapping(config);
    setTraces(applied.value);
    setStep("preview");
  }

  return (
    <div className="w-full max-w-2xl">
      <StepIndicator current={step} />

      <div className="mt-6 rounded-lg border bg-white p-6 shadow-sm">
        {error && (
          <div
            role="alert"
            aria-live="assertive"
            className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {step === "drop" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Drop a JSONL, JSON, or CSV file of LLM traces to get started.
            </p>
            <DropZone onFile={handleFile} disabled={parsing !== null} />
            {parsing ? (
              <p
                role="status"
                aria-live="polite"
                className="text-sm text-gray-600"
              >
                Reading {parsing}...
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-500">
                  No file ready? Try{" "}
                  <span className="font-mono">
                    sample-data/recipe-chatbot-results.json
                  </span>{" "}
                  from the repo to see how it works.
                </p>
                <p className="text-xs text-gray-500">
                  No data leaves your browser.
                </p>
              </>
            )}
          </div>
        )}

        {step === "mapping" && source && (
          <MappingStep
            fields={source.fields}
            firstRow={source.rows[0]}
            initial={mapping}
            onBack={reset}
            onConfirm={handleMappingConfirm}
          />
        )}

        {step === "preview" && traces && source && (
          <PreviewStep
            traces={traces}
            onBack={() => {
              setError(null);
              setStep("mapping");
            }}
            onConfirm={() => onDone(traces)}
          />
        )}
      </div>
    </div>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current);
  return (
    <ol aria-label="Wizard progress" className="flex gap-3 text-xs text-gray-500">
      {STEPS.map((s, i) => {
        const done = i < currentIdx;
        const active = s.id === current;
        return (
          <li
            key={s.id}
            aria-current={active ? "step" : undefined}
            className={
              active
                ? "font-semibold text-gray-900"
                : done
                  ? "text-green-700"
                  : ""
            }
          >
            {done ? "✓ " : `${i + 1}. `}
            {s.label}
          </li>
        );
      })}
    </ol>
  );
}
