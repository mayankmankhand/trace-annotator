import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import type { LabelRow } from "@/lib/labels/types";

const LABELS_FILE = path.join(process.cwd(), "labels", "session.jsonl");

export async function GET() {
  try {
    const raw = await readFile(LABELS_FILE, "utf-8");
    const rows: LabelRow[] = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LabelRow);
    return NextResponse.json({ ok: true, rows });
  } catch {
    return NextResponse.json({ ok: false, rows: [] });
  }
}
