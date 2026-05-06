"use client";

import { useRef, useState } from "react";

// DropZone (issue #53). Quiet Notebook restyle. Same drag/drop behavior;
// uses the wizard's `.wz-drop` tokens instead of raw Tailwind.

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
      className={`wz-drop${disabled ? " wz-drop--disabled" : ""}${dragging ? " wz-drop--dragging" : ""}`}
    >
      <p className="wz-drop__title">Drop a trace file, or click to choose</p>
      <p className="wz-drop__hint">
        Accepts .json, .jsonl, .ndjson, or .csv (up to 25 MB)
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".json,.jsonl,.ndjson,.csv,application/json,text/csv"
        className="wz-drop__input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
