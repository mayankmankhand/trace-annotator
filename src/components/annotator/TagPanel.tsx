"use client";

import { useRef, useState } from "react";
import type { Annotation } from "./TraceView";

type Props = {
  annotation: Annotation;
  allTags: string[];
  onUpdate: (a: Annotation) => void;
  onTagCreated: (tag: string) => void;
};

export function TagPanel({ annotation, allTags, onUpdate, onTagCreated }: Props) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const tag = raw.trim();
    if (!tag) return;
    if (!annotation.tags.includes(tag)) {
      onUpdate({ ...annotation, tags: [...annotation.tags, tag] });
    }
    onTagCreated(tag);
    setInput("");
    inputRef.current?.focus();
  }

  function removeTag(tag: string) {
    onUpdate({ ...annotation, tags: annotation.tags.filter((t) => t !== tag) });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Escape") {
      setInput("");
    }
  }

  return (
    <div className="mt-6 space-y-3 border-t pt-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide">
            Failure mode tags
          </label>
          {annotation.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {annotation.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-800"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remove tag: ${tag}`}
                    className="ml-0.5 text-violet-500 hover:text-violet-800 focus-visible:outline-none"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              list="tag-suggestions"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a failure mode and press Enter..."
              className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => addTag(input)}
              disabled={!input.trim()}
              className="px-3 py-1.5 text-sm font-medium rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Add
            </button>
            <datalist id="tag-suggestions">
              {allTags.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div>
        <label
          htmlFor="trace-note"
          className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1"
        >
          Note
        </label>
        <textarea
          id="trace-note"
          value={annotation.note}
          onChange={(e) => onUpdate({ ...annotation, note: e.target.value })}
          placeholder="Optional note about this trace..."
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        />
      </div>
    </div>
  );
}
