import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const LABELS_DIR = path.join(process.cwd(), "labels");
const STATE_FILE = path.join(LABELS_DIR, "session-state.json");

export type SessionState = {
  filename: string;
  traceCount: number;
  lastIndex: number;
  savedAt: string;
};

export async function GET() {
  try {
    const raw = await readFile(STATE_FILE, "utf-8");
    const state = JSON.parse(raw) as SessionState;
    return NextResponse.json({ ok: true, state });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { state: SessionState };
    if (!body.state || typeof body.state !== "object") {
      return NextResponse.json({ ok: false, error: "state must be an object" }, { status: 400 });
    }
    await mkdir(LABELS_DIR, { recursive: true });
    await writeFile(STATE_FILE, JSON.stringify(body.state, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
