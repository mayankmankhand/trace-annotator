import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

// Inter is the de-facto SaaS UI font - tight letterforms at small sizes,
// looks at home alongside the Tailwind palette. Loaded via next/font so
// it's self-hosted and doesn't add a render-blocking <link>.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Trace Annotator",
  description:
    "A keyboard-first labeling tool that teaches LLM error analysis as you use it.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
