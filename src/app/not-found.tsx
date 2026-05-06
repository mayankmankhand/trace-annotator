import Link from "next/link";
import { Logo } from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12 text-center">
      <h1 className="sr-only">Trace Annotator - page not found</h1>
      <Logo />
      <p
        style={{
          fontFamily: "var(--serif)",
          fontSize: 22,
          fontWeight: 500,
          color: "var(--ink)",
          marginTop: 24,
          marginBottom: 8,
        }}
      >
        That page is not here.
      </p>
      <p
        style={{
          fontSize: 13.5,
          color: "var(--ink-2)",
          maxWidth: 420,
          lineHeight: 1.55,
          marginBottom: 20,
        }}
      >
        The URL did not match a known route. Head back to the wizard to load a
        trace file.
      </p>
      <Link href="/" className="wz-link" style={{ fontSize: 13 }}>
        Back to the wizard
      </Link>
    </main>
  );
}
