"use client";

import type { TemplateChoice } from "@/lib/storage";

// One-time "what kind of app is this?" prompt. Shown only on the user's
// first session (saved choice persists in localStorage).  Drives which
// example failure-mode tags get suggested in the tag panel; the teaching
// arc itself is shared across all template choices. See docs/coaching-arc.md.

type Props = {
  onChoose: (choice: TemplateChoice) => void;
};

const OPTIONS: {
  id: TemplateChoice;
  title: string;
  blurb: string;
}[] = [
  {
    id: "chatbot",
    title: "Chatbot",
    blurb:
      "A conversational assistant. Examples: customer support bot, character chatbot, voice assistant.",
  },
  {
    id: "rag",
    title: "RAG (Retrieval-augmented)",
    blurb:
      "Answers grounded in retrieved documents. Examples: docs Q&A, internal knowledge search, support over a help center.",
  },
  {
    id: "summarizer",
    title: "Summarizer",
    blurb:
      "Compresses long input into shorter output. Examples: meeting notes, article TL;DRs, ticket triage.",
  },
  {
    id: "generic",
    title: "Other / not sure",
    blurb: "Use a general-purpose set of failure modes.",
  },
];

export function TemplateStep({ onChoose }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          What kind of app is this?
        </h2>
        <p className="text-sm text-gray-600 mt-1">
          We&apos;ll suggest a few example failure-mode tags that match - you
          can use them, ignore them, or write your own. This question is asked
          once.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChoose(opt.id)}
            className="text-left rounded-lg border border-gray-200 p-4 hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <div className="text-sm font-semibold text-gray-900">{opt.title}</div>
            <div className="text-xs text-gray-600 mt-1 leading-relaxed">
              {opt.blurb}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
