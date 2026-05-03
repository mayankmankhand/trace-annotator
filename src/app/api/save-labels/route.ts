import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import type { LabelRow } from "@/lib/labels/types";
import { toJSONL } from "@/lib/labels/serialize";

const LABELS_DIR = path.join(process.cwd(), "labels");
const LABELS_FILE = path.join(LABELS_DIR, "session.jsonl");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { rows: LabelRow[] };
    const rows = body.rows;
    if (!Array.isArray(rows)) {
      return NextResponse.json({ ok: false, error: "rows must be an array" }, { status: 400 });
    }
    await mkdir(LABELS_DIR, { recursive: true });
    await writeFile(LABELS_FILE, toJSONL(rows), "utf-8");
    return NextResponse.json({ ok: true, path: LABELS_FILE, count: rows.length });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
