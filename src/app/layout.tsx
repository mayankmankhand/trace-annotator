import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trace Annotator",
  description:
    "An open-source labeling tool that teaches LLM error analysis as you use it.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
