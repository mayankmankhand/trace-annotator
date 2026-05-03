"use client";

import { useRef, useState } from "react";

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
};

export function DropZone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  function activate() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Choose a trace file"
      aria-disabled={disabled || undefined}
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
      }}
      onDragLeave={() => {
        if (disabled) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
      onClick={activate}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        disabled
          ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-60"
          : dragging
            ? "border-blue-500 bg-blue-50 cursor-pointer"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50 cursor-pointer"
      }`}
    >
      <p className="text-base font-medium text-gray-800">
        Drop a trace file here, or click to choose
      </p>
      <p className="text-sm text-gray-500">
        Accepts .json, .jsonl, .ndjson, or .csv (up to 25 MB)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.jsonl,.ndjson,.csv,application/json,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
