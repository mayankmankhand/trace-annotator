"use client";

// Brand wordmark, restyled for the Quiet Notebook system (issue #53).
// Same triangle glyph but the type is Newsreader (serif) and ink is
// `var(--ink)` so it sits naturally next to the design-system tokens.

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span className={`ta-logo ta-logo--${size}`}>
      <svg
        className="ta-logo__glyph"
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="6" fill="var(--ink)" />
        <path d="M8 22 L13 12 L18 22 Z" fill="var(--paper)" />
        <path d="M19 22 L24 12 L24 22 Z" fill="var(--paper)" opacity="0.7" />
      </svg>
      <span className="ta-logo__text">Trace Annotator</span>
    </span>
  );
}
