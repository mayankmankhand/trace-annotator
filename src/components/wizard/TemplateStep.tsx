"use client";

import type { TemplateChoice } from "@/lib/storage";

// TemplateStep (issue #53). Quiet Notebook restyle.

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
    <div className="wz-step">
      <div className="wz-step__head">
        <h2 className="wz-step__title">What kind of app is this?</h2>
        <p className="wz-step__hint">
          We&apos;ll suggest a few example failure-mode tags that match. You
          can use them, ignore them, or write your own. This question is
          asked once.
        </p>
      </div>
      <div className="wz-template__grid">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChoose(opt.id)}
            className="wz-template__card"
          >
            <span className="wz-template__cardTitle">{opt.title}</span>
            <span className="wz-template__cardBlurb">{opt.blurb}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
