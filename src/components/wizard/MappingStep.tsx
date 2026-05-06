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
    <div className="wz-step">
      <div className="wz-step__head">
        <h2 className="wz-step__title">Map your fields</h2>
        <p className="wz-step__hint">
          Tell us where the conversation lives in your file. If you&apos;ve
          never opened a trace file before, that&apos;s fine - the detected
          paths and structure preview below will get you there.
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

      <label className="wz-passthrough">
        <input
          type="checkbox"
          checked={metadataPassthrough}
          onChange={(e) => setMetadataPassthrough(e.target.checked)}
        />
        <span>
          Keep the other fields as metadata on each trace.
          <span className="wz-passthrough__sub">
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

      <div className="wz-step__foot">
        <button type="button" onClick={onBack} className="lv-nav">
          back
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
          className="lv-nav lv-nav--primary"
        >
          preview
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
    <div className="wz-banner wz-banner--info wz-detected">
      <p className="wz-banner__title">
        Found {paths.length}{" "}
        {paths.length === 1 ? "place" : "places"} in your file that look
        like message arrays. Click one to fill the fields below.
      </p>
      <ul className="wz-detected__list">
        {paths.map((p) => (
          <li key={p.path} className="wz-detected__item">
            <div className="wz-detected__head">
              <code className="wz-detected__path">{p.path}</code>
              <span className="wz-detected__size">
                {p.size} message{p.size === 1 ? "" : "s"}
              </span>
              {p.hasAssistant && (
                <span className="ta-chip wz-detected__chip wz-detected__chip--ok">
                  has assistant turn
                </span>
              )}
              {!p.hasAssistant && p.hasUser && (
                <span className="ta-chip wz-detected__chip">user only</span>
              )}
            </div>
            <div className="wz-detected__actions">
              <button
                type="button"
                onClick={() => onUseForBoth(p.path)}
                title="Recommended for full-conversation arrays. Wizard splits the conversation at the last assistant turn."
                className="lv-nav lv-nav--primary"
              >
                use for both
              </button>
              <button
                type="button"
                onClick={() => onUseForInput(p.path)}
                className="lv-nav"
              >
                use for input
              </button>
              <button
                type="button"
                onClick={() => onUseForOutput(p.path)}
                className="lv-nav"
              >
                use for output
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="wz-banner__body">
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
    <details className="wz-structure">
      <summary className="wz-structure__summary">
        First row structure (click to expand)
      </summary>
      <div className="wz-structure__body">
        <p className="wz-structure__hint">
          Each line shows a path you can copy into the field boxes.
        </p>
        <pre className="wz-structure__pre">{renderStructure(firstRow)}</pre>
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
    <details className="wz-aliases">
      <summary className="wz-aliases__summary">
        Role name mapping
        <span className="wz-aliases__optional">(optional)</span>
      </summary>
      <div className="wz-aliases__body">
        <p className="wz-aliases__hint">
          If your data uses different names for message roles - like
          &ldquo;human&rdquo; instead of &ldquo;user&rdquo;, or &ldquo;AI&rdquo;
          instead of &ldquo;assistant&rdquo; - enter your names here. Leave
          blank if your data already uses the standard names.
        </p>
        <div className="wz-aliases__grid">
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
    <div className="wz-field">
      <label htmlFor={id} className="wz-field__label">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="wz-field__input"
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
    <div className="wz-field">
      <label htmlFor={inputId} className="wz-field__label">
        {label}
        {required && <span className="wz-field__required"> *</span>}
      </label>
      <p id={helperId} className="wz-field__helper">
        {helper} Pick a top-level field, or type a dotted path like{" "}
        <code>request.messages</code> to dig into nested objects.
      </p>
      <div className="wz-field__row">
        {allowNone && (
          <label className="wz-field__checkbox">
            <input
              type="checkbox"
              checked={isNone}
              onChange={(e) => onChange(e.target.checked ? NONE : "")}
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
          className="wz-field__input wz-field__input--mono"
        />
        <datalist id={datalistId}>
          {fields.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </div>
      {previewValue && (
        <p className="wz-field__preview">
          <span className="wz-field__previewLabel">First row:</span>{" "}
          <span>{previewValue}</span>
        </p>
      )}
    </div>
  );
}
