"use client";

import { useEffect, useState } from "react";
import type { WizardConfig } from "@/lib/config/types";
import {
  SLOW_FILE_BYTES,
  checkFileSize,
  detectFormat,
  parseCSV,
  parseJSON,
  parseJSONL,
  type EnvelopeKey,
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
import {
  loadTemplate,
  loadWizardConfig,
  saveTemplate,
  saveWizardConfig,
  type TemplateChoice,
} from "@/lib/storage";
import { DropZone } from "./DropZone";
import { MappingStep } from "./MappingStep";
import { PreviewStep } from "./PreviewStep";
import { TemplateStep } from "./TemplateStep";

type Step = "drop" | "mapping" | "preview" | "template";

// LoadedSource carries enough info to drive the confidence banner, the
// mapping fallback, and the preview. envelopeKey is null when the file
// was a bare array or JSONL (no wrapper to unwrap).
type LoadedSource = {
  filename: string;
  format: ParseFormat;
  rows: Record<string, unknown>[];
  fields: string[];
  envelopeKey: EnvelopeKey | null;
  autoRecognized: boolean;
  usedNestedMessages: boolean;
  sizeBytes: number;
};

const STEPS: { id: Exclude<Step, "template">; label: string }[] = [
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

function bytesLabel(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

export function Wizard({
  onDone,
}: {
  onDone: (traces: Trace[], filename: string) => void;
}) {
  const [step, setStep] = useState<Step>("drop");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [source, setSource] = useState<LoadedSource | null>(null);
  const [mapping, setMapping] = useState<MappingConfig | null>(null);
  const [savedConfig, setSavedConfig] = useState<WizardConfig | null>(null);
  const [traces, setTraces] = useState<Trace[] | null>(null);
  const [parsing, setParsing] = useState<string | null>(null);

  useEffect(() => {
    const config = loadWizardConfig();
    if (config) setSavedConfig(config as WizardConfig);
  }, []);

  function reset() {
    setError(null);
    setWarning(null);
    setSource(null);
    setMapping(null);
    setTraces(null);
    setParsing(null);
    setStep("drop");
  }

  async function handleFile(file: File) {
    setError(null);
    setWarning(null);
    setParsing(file.name);
    try {
      const sizeCheck = checkFileSize(file.size);
      if (!sizeCheck.ok) {
        setError(sizeCheck.error);
        return;
      }
      // Soft warning between SLOW_FILE_BYTES and MAX. Doesn't block parsing,
      // just sets expectations so the user knows why the wizard is sitting
      // there for 10 seconds.
      if (file.size >= SLOW_FILE_BYTES) {
        setWarning(
          `This is a ${bytesLabel(file.size)} file. Loading may take a few seconds.`,
        );
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
      let envelopeKey: EnvelopeKey | null = null;

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
          setError(friendlyParseError(result.error));
          return;
        }
        envelopeKey = result.value.unwrappedFrom;
        const objCheck = ensureObjectRows(result.value.rows);
        if (!objCheck.ok) {
          setError(objCheck.error);
          return;
        }
        rows = objCheck.rows;
        fields = collectFieldNames(rows);
      }

      const auto = autoRecognize(fields, rows[0]);
      const loaded: LoadedSource = {
        filename: file.name,
        format,
        rows,
        fields,
        envelopeKey,
        autoRecognized: auto !== null,
        usedNestedMessages: auto?.usedNestedMessages ?? false,
        sizeBytes: file.size,
      };
      setSource(loaded);

      if (auto) {
        const applied = applyMapping(rows, auto.config);
        if (!applied.ok) {
          setMapping(auto.config);
          setError(applied.error);
          setStep("mapping");
          return;
        }
        setMapping(auto.config);
        setTraces(applied.value);
        setStep("preview");
      } else {
        setMapping(savedConfig ?? null);
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

  function handlePreviewConfirm() {
    if (!traces || !mapping || !source) return;
    const config: WizardConfig = { ...mapping, savedAt: new Date().toISOString() };
    saveWizardConfig(config);
    // Show the template prompt only on first run. After the user has picked
    // once, future sessions skip straight to onDone.
    if (loadTemplate() === null) {
      setStep("template");
      return;
    }
    onDone(traces, source.filename);
  }

  function handleTemplateChoice(choice: TemplateChoice) {
    saveTemplate(choice);
    if (traces && source) onDone(traces, source.filename);
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
        {warning && !error && (
          <div
            role="status"
            aria-live="polite"
            className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"
          >
            {warning}
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
                  No data leaves your browser. Supported shapes:{" "}
                  <a
                    href="https://github.com/mayankmankhand/Observability/blob/main/docs/supported-inputs.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-gray-800"
                  >
                    docs/supported-inputs.md
                  </a>
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
            envelopeKey={source.envelopeKey}
            usedNestedMessages={source.usedNestedMessages}
            autoRecognized={source.autoRecognized}
            onBack={() => {
              setError(null);
              setStep("mapping");
            }}
            onConfirm={handlePreviewConfirm}
          />
        )}

        {step === "template" && (
          <TemplateStep onChoose={handleTemplateChoice} />
        )}
      </div>
    </div>
  );
}

function friendlyParseError(message: string): string {
  // Surface the parser error with a pointer to docs. Beginner-friendly framing
  // in line with the project's voice principles.
  return (
    message +
    "\n\nIf you're stuck, see docs/supported-inputs.md for the file shapes the wizard understands."
  );
}

function StepIndicator({ current }: { current: Step }) {
  const visibleSteps = STEPS;
  const currentIdx =
    current === "template"
      ? STEPS.length - 1
      : visibleSteps.findIndex((s) => s.id === current);
  return (
    <ol aria-label="Wizard progress" className="flex gap-3 text-xs text-gray-500">
      {visibleSteps.map((s, i) => {
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
