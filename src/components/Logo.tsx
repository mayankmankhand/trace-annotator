"use client";

// Brand wordmark used on the wizard landing screen and (eventually) the
// top bar after the user enters the labeling view. Two-tone "Trace
// Annotator" with a small triangle glyph; matches the favicon.

export function Logo({ size = "md" }: { size?: "sm" | "md" }) {
  const text =
    size === "sm"
      ? "text-base font-semibold"
      : "text-2xl font-semibold tracking-tight";
  const glyph = size === "sm" ? "h-4 w-4" : "h-6 w-6";
  return (
    <span className="inline-flex items-center gap-2 text-gray-900">
      <svg
        className={glyph}
        viewBox="0 0 32 32"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect width="32" height="32" rx="6" fill="#2563eb" />
        <path d="M8 22 L13 12 L18 22 Z" fill="white" />
        <path d="M19 22 L24 12 L24 22 Z" fill="white" opacity="0.7" />
      </svg>
      <span className={text}>Trace Annotator</span>
    </span>
  );
}
