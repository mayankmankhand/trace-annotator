import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import type { WizardConfig } from "@/lib/config/types";

const CONFIG_DIR = path.join(process.cwd(), "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "wizard.json");

export async function GET() {
  try {
    const raw = await readFile(CONFIG_FILE, "utf-8");
    const config = JSON.parse(raw) as WizardConfig;
    return NextResponse.json({ ok: true, config });
  } catch {
    return NextResponse.json({ ok: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { config: WizardConfig };
    if (!body.config || typeof body.config !== "object") {
      return NextResponse.json({ ok: false, error: "config must be an object" }, { status: 400 });
    }
    await mkdir(CONFIG_DIR, { recursive: true });
    await writeFile(CONFIG_FILE, JSON.stringify(body.config, null, 2), "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
