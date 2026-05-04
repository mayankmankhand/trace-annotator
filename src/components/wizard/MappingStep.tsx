"use client";

import { useId, useMemo, useState } from "react";
import type { MappingConfig, RoleAlias } from "@/lib/trace/types";
import { findMessageArrayPaths, getFieldByPath } from "@/lib/trace/mapping";

type Props = {
  fields: string[];
  firstRow: Record<string, unknown>;
  initial: MappingConfig | null;
  onBack: () => void;
  onConfirm: (config: MappingConfig) => void;
};

const NONE = "__none__";

function preview(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 120 ? text.slice(0, 120) + "..." : text;
}

export function MappingStep({
  fields,
  firstRow,
  initial,
  onBack,
  onConfirm,
}: Props) {
  const initialValues = useMemo(
    () => ({
      idField: initial?.idField ?? null,
      inputField: initial?.inputField ?? "",
      outputField: initial?.outputField ?? "",
      metadataPassthrough: initial?.metadataPassthrough ?? true,
      userAlias: initial?.roleAliases?.find((a) => a.to === "user")?.from ?? "",
      assistantAlias: initial?.roleAliases?.find((a) => a.to === "assistant")?.from ?? "",
    }),
    [initial],
  );

  const [idField, setIdField] = useState<string | null>(initialValues.idField);
  const [inputField, setInputField] = useState(initialValues.inputField);
  const [outputField, setOutputField] = useState(initialValues.outputField);
  const [metadataPassthrough, setMetadataPassthrough] = useState(
    initialValues.metadataPassthrough,
  );
  const [userAlias, setUserAlias] = useState(initialValues.userAlias);
  const [assistantAlias, setAssistantAlias] = useState(initialValues.assistantAlias);

  // Pre-compute every nested path that resolves to a message array. Lets
  // us surface click-to-fill suggestions instead of asking the user to
  // type a path or read JSON. Computed once per first-row instance.
  const detectedPaths = useMemo(
    () => findMessageArrayPaths(firstRow),
    [firstRow],
  );

  const canConfirm = inputField !== "" && outputField !== "";

  function buildRoleAliases(): RoleAlias[] {
    const aliases: RoleAlias[] = [];
    const u = userAlias.trim();
    const a = assistantAlias.trim();
    if (u && u.toLowerCase() !== "user") aliases.push({ from: u, to: "user" });
    if (a && a.toLowerCase() !== "assistant") aliases.push({ from: a, to: "assistant" });
    return aliases;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Map your fields
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Tell us where the conversation lives in your file. If you&apos;ve never
          opened a trace file before, that&apos;s fine - the detected paths and
          structure preview below will get you there.
        </p>
      </div>

      {detectedPaths.length > 0 && (
        <DetectedPaths
          paths={detectedPaths}
          onUseForBoth={(p) => {
            setInputField(p);
            setOutputField(p);
          }}
          onUseForInput={(p) => setInputField(p)}
          onUseForOutput={(p) => setOutputField(p)}
        />
      )}

      <StructurePreview firstRow={firstRow} />

      <FieldPicker
        label="User input field"
        helper="What the user asked. If your file's messages live inside a wrapper, type the dotted path (e.g. request.messages)."
        value={inputField}
        onChange={setInputField}
        fields={fields}
        firstRow={firstRow}
        required
      />

      <FieldPicker
        label="Assistant output field"
        helper="What the model replied. If both fields point to the same path, the wizard splits the conversation at the last assistant turn."
        value={outputField}
        onChange={setOutputField}
        fields={fields}
        firstRow={firstRow}
        required
      />

      <FieldPicker
        label="ID field (optional)"
        helper="A unique id per row. If skipped, row numbers are used."
        value={idField ?? NONE}
        onChange={(v) => setIdField(v === NONE ? null : v)}
        fields={fields}
        firstRow={firstRow}
        allowNone
      />

      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={metadataPassthrough}
          onChange={(e) => setMetadataPassthrough(e.target.checked)}
          className="mt-1"
        />
        <span>
          Keep the other fields as metadata on each trace.
          <br />
          <span className="text-gray-500">
            Useful if your file has extra fields you may want to filter or
            group by later.
          </span>
        </span>
      </label>

      <RoleAliasSection
        userAlias={userAlias}
        assistantAlias={assistantAlias}
        onUserAlias={setUserAlias}
        onAssistantAlias={setAssistantAlias}
      />

      <div className="flex justify-between pt-4 border-t">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          Back
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={() => {
            const roleAliases = buildRoleAliases();
            onConfirm({
              idField,
              inputField,
              outputField,
              metadataPassthrough,
              ...(roleAliases.length > 0 ? { roleAliases } : {}),
            });
          }}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Preview
        </button>
      </div>
    </div>
  );
}

// Show every nested path in the first row that already resolves to a list
// of {role, content} message objects. Each path gets a "Use for both" button
// (the most-likely-correct action: single-field mode where the wizard splits
// at the last assistant turn) plus separate "Use for input" / "Use for
// output" buttons for users who really want to split across two fields.
type DetectedPath = {
  path: string;
  size: number;
  hasAssistant: boolean;
  hasUser: boolean;
};

function DetectedPaths({
  paths,
  onUseForBoth,
  onUseForInput,
  onUseForOutput,
}: {
  paths: DetectedPath[];
  onUseForBoth: (path: string) => void;
  onUseForInput: (path: string) => void;
  onUseForOutput: (path: string) => void;
}) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
      <p className="text-sm font-semibold text-blue-900">
        Found {paths.length}{" "}
        {paths.length === 1 ? "place" : "places"} in your file that look
        like message arrays. Click one to fill the fields below.
      </p>
      <ul className="space-y-2">
        {paths.map((p) => (
          <li
            key={p.path}
            className="rounded border border-blue-200 bg-white px-3 py-2 text-xs"
          >
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <code className="font-mono font-semibold text-blue-900">
                {p.path}
              </code>
              <span className="text-gray-600">
                {p.size} message{p.size === 1 ? "" : "s"}
              </span>
              {p.hasAssistant && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-800">
                  has assistant turn
                </span>
              )}
              {!p.hasAssistant && p.hasUser && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                  user only
                </span>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onUseForBoth(p.path)}
                title="Recommended for full-conversation arrays. Wizard splits the conversation at the last assistant turn."
                className="px-2 py-1 text-[11px] font-medium rounded bg-blue-600 text-white hover:bg-blue-700"
              >
                Use for both fields
              </button>
              <button
                type="button"
                onClick={() => onUseForInput(p.path)}
                className="px-2 py-1 text-[11px] font-medium rounded border border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                Use for input
              </button>
              <button
                type="button"
                onClick={() => onUseForOutput(p.path)}
                className="px-2 py-1 text-[11px] font-medium rounded border border-blue-300 text-blue-700 hover:bg-blue-100"
              >
                Use for output
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-blue-800">
        <strong>Tip:</strong> if a path has &ldquo;has assistant turn&rdquo;,
        it&apos;s the full conversation - &ldquo;Use for both&rdquo; is usually
        right.
      </p>
    </div>
  );
}

// Indented preview of the first row's structure, with each leaf labeled by
// type and value. Lets the user verify their data shape without opening the
// JSON file by hand. Bounded depth and length to stay usable on huge rows.
function StructurePreview({ firstRow }: { firstRow: Record<string, unknown> }) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-gray-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 list-none flex items-center gap-1 select-none">
        <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">
          &#9654;
        </span>
        First row structure (click to expand)
      </summary>
      <div className="mt-3 text-xs">
        <p className="text-gray-600 mb-2">
          Each line shows a path you can copy into the field boxes.
        </p>
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-gray-800 bg-white border border-gray-200 rounded px-3 py-2 max-h-80 overflow-auto">
          {renderStructure(firstRow)}
        </pre>
      </div>
    </details>
  );
}

function renderStructure(
  value: unknown,
  prefix = "",
  depth = 0,
): string {
  const indent = "  ".repeat(depth);
  if (value === null) return `${indent}${prefix || "(root)"}: null`;
  if (value === undefined) return `${indent}${prefix || "(root)"}: undefined`;
  if (Array.isArray(value)) {
    const sample = value[0];
    if (
      value.length > 0 &&
      sample !== null &&
      typeof sample === "object" &&
      !Array.isArray(sample) &&
      "role" in sample &&
      "content" in sample
    ) {
      return `${indent}${prefix}: [${value.length} message${value.length === 1 ? "" : "s"} with {role, content}]`;
    }
    return `${indent}${prefix}: [array of ${value.length}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    if (depth >= 4) {
      return `${indent}${prefix}: { ${keys.length} keys, deep nesting hidden }`;
    }
    const header = prefix ? `${indent}${prefix}:` : "(root):";
    const lines = [header];
    for (const k of keys) {
      lines.push(
        renderStructure(
          (value as Record<string, unknown>)[k],
          k,
          depth + 1,
        ),
      );
    }
    return lines.join("\n");
  }
  if (typeof value === "string") {
    const preview =
      value.length > 60 ? `"${value.slice(0, 60)}..."` : `"${value}"`;
    return `${indent}${prefix}: ${preview}`;
  }
  return `${indent}${prefix}: ${typeof value} (${JSON.stringify(value)})`;
}

type RoleAliasSectionProps = {
  userAlias: string;
  assistantAlias: string;
  onUserAlias: (v: string) => void;
  onAssistantAlias: (v: string) => void;
};

function RoleAliasSection({
  userAlias,
  assistantAlias,
  onUserAlias,
  onAssistantAlias,
}: RoleAliasSectionProps) {
  return (
    <details className="group">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 list-none flex items-center gap-1 select-none">
        <span className="text-gray-400 group-open:rotate-90 transition-transform inline-block">&#9654;</span>
        Role name mapping
        <span className="ml-1 text-xs font-normal text-gray-400">(optional)</span>
      </summary>
      <div className="mt-3 space-y-3 pl-4">
        <p className="text-xs text-gray-500">
          If your data uses different names for message roles - like &ldquo;human&rdquo; instead
          of &ldquo;user&rdquo;, or &ldquo;AI&rdquo; instead of &ldquo;assistant&rdquo; - enter your names here.
          Leave blank if your data already uses the standard names.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <AliasInput
            label='Your name for "user"'
            placeholder="e.g. human"
            value={userAlias}
            onChange={onUserAlias}
          />
          <AliasInput
            label='Your name for "assistant"'
            placeholder="e.g. AI"
            value={assistantAlias}
            onChange={onAssistantAlias}
          />
        </div>
      </div>
    </details>
  );
}

function AliasInput({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-700 mb-1">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      />
    </div>
  );
}

type FieldPickerProps = {
  label: string;
  helper: string;
  value: string;
  onChange: (v: string) => void;
  fields: string[];
  firstRow: Record<string, unknown>;
  required?: boolean;
  allowNone?: boolean;
};

function FieldPicker({
  label,
  helper,
  value,
  onChange,
  fields,
  firstRow,
  required,
  allowNone,
}: FieldPickerProps) {
  const inputId = useId();
  const helperId = useId();
  const datalistId = useId();
  // Compute the preview using getFieldByPath so dotted paths (e.g.
  // "request.messages") show the nested value, not undefined. Falls back
  // to no preview when the user has selected the "use row numbers" option.
  const isNone = value === NONE;
  const previewValue = !isNone && value
    ? preview(getFieldByPath(firstRow, value))
    : null;
  return (
    <div>
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-800"
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <p id={helperId} className="text-xs text-gray-500 mt-0.5">
        {helper} Pick a top-level field, or type a dotted path like{" "}
        <code className="font-mono">request.messages</code> to dig into
        nested objects.
      </p>
      <div className="mt-2 flex items-center gap-2">
        {allowNone && (
          <label className="inline-flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={isNone}
              onChange={(e) => onChange(e.target.checked ? NONE : "")}
              className="h-3.5 w-3.5"
            />
            <span>Use row numbers</span>
          </label>
        )}
        <input
          id={inputId}
          type="text"
          list={datalistId}
          aria-describedby={helperId}
          aria-required={required || undefined}
          disabled={isNone}
          value={isNone ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            isNone ? "Using row numbers" : "Choose or type a field path..."
          }
          className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <datalist id={datalistId}>
          {fields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
      {previewValue && (
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">First row:</span>{" "}
          <span className="font-mono">{previewValue}</span>
        </p>
      )}
    </div>
  );
}
