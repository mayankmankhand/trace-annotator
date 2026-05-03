"use client";

import { useId, useMemo, useState } from "react";
import type { MappingConfig } from "@/lib/trace/types";

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
    }),
    [initial],
  );

  const [idField, setIdField] = useState<string | null>(initialValues.idField);
  const [inputField, setInputField] = useState(initialValues.inputField);
  const [outputField, setOutputField] = useState(initialValues.outputField);
  const [metadataPassthrough, setMetadataPassthrough] = useState(
    initialValues.metadataPassthrough,
  );

  const canConfirm = inputField !== "" && outputField !== "";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Map your fields
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          Tell us which field holds the user input and which holds the
          assistant&apos;s response. The first row of your file is shown as a
          preview.
        </p>
      </div>

      <FieldPicker
        label="User input field"
        helper="The field with what the user said or asked."
        value={inputField}
        onChange={setInputField}
        fields={fields}
        firstRow={firstRow}
        required
      />

      <FieldPicker
        label="Assistant output field"
        helper="The field with what the model said back."
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
          onClick={() =>
            onConfirm({
              idField,
              inputField,
              outputField,
              metadataPassthrough,
            })
          }
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          Preview
        </button>
      </div>
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
  const selectId = useId();
  const helperId = useId();
  const previewValue =
    value && value !== NONE ? preview(firstRow[value]) : null;
  return (
    <div>
      <label
        htmlFor={selectId}
        className="block text-sm font-medium text-gray-800"
      >
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <p id={helperId} className="text-xs text-gray-500 mt-0.5">
        {helper}
      </p>
      <select
        id={selectId}
        aria-describedby={helperId}
        aria-required={required || undefined}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 block w-full rounded border-gray-300 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <option value="" disabled>
          Choose a field...
        </option>
        {allowNone && <option value={NONE}>Use row numbers</option>}
        {fields.map((f) => (
          <option key={f} value={f}>
            {f}
          </option>
        ))}
      </select>
      {previewValue && (
        <p className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-700">First row:</span>{" "}
          <span className="font-mono">{previewValue}</span>
        </p>
      )}
    </div>
  );
}
