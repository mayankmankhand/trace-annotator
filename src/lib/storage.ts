"use client";

// IndexedDB storage primitive for v2.0.
//
// Why this exists: the v1 app routed label writes through Next.js API routes
// to a server-side file (`labels/session.jsonl`). That contradicted the
// "browser-based local app" framing in CLAUDE.md and made multi-tab use
// racy. v2.0 moves the source of truth into the browser via IndexedDB,
// keyed by a file fingerprint so the same file uploaded twice resumes.
// See docs/save-model.md for the full decision record.

import type { LabelRow } from "./labels/types";

const DB_NAME = "trace-annotator";
const DB_VERSION = 2;
const LABELS_STORE = "labels";
const STATE_STORE = "session-state";
const AUDIT_STORE = "audit";

// SessionState mirrors the v1 server-side schema so resume logic is unchanged.
export type SessionState = {
  fingerprint: string;
  filename: string;
  traceCount: number;
  lastIndex: number;
  savedAt: string;
};

// FileFingerprint identifies "the same file" across uploads. Filename alone is
// not enough (users re-export datasets with the same name). Trace count plus
// first/last trace IDs are a cheap, content-aware addition that avoids
// hashing the whole file (which would be slow on large files).
export function fingerprintFile(
  filename: string,
  traceCount: number,
  firstTraceId: string,
  lastTraceId: string,
): string {
  return `${filename}|${traceCount}|${firstTraceId}|${lastTraceId}`;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable in this environment"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LABELS_STORE)) {
        // Compound key: [fingerprint, trace_id]. Lets us read all labels for
        // one file via a range query, and update individual labels in place.
        db.createObjectStore(LABELS_STORE, {
          keyPath: ["fingerprint", "trace_id"],
        });
      }
      if (!db.objectStoreNames.contains(STATE_STORE)) {
        db.createObjectStore(STATE_STORE, { keyPath: "fingerprint" });
      }
      if (!db.objectStoreNames.contains(AUDIT_STORE)) {
        // Audit store: append-only log of label changes. Auto-incrementing
        // primary key; an index on `fingerprint` lets us scope a query to
        // one file's history. Used by Step 7's per-label version log.
        const audit = db.createObjectStore(AUDIT_STORE, {
          keyPath: "id",
          autoIncrement: true,
        });
        audit.createIndex("by-fingerprint", "fingerprint", { unique: false });
        audit.createIndex("by-trace", ["fingerprint", "trace_id"], {
          unique: false,
        });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function txAsPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));
  });
}

type StoredLabel = LabelRow & { fingerprint: string };

export async function saveLabels(
  fingerprint: string,
  rows: LabelRow[],
): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(LABELS_STORE, "readwrite");
  const store = tx.objectStore(LABELS_STORE);
  // Clear this fingerprint's existing rows then re-insert. Simpler than diffing
  // and the row count for one file is small (hundreds, not millions).
  const range = IDBKeyRange.bound(
    [fingerprint, ""],
    [fingerprint, "￿"],
  );
  const cursorReq = store.openCursor(range);
  await new Promise<void>((resolve, reject) => {
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  for (const row of rows) {
    const stored: StoredLabel = { ...row, fingerprint };
    store.put(stored);
  }
  await txAsPromise(tx);
}

export async function loadLabels(fingerprint: string): Promise<LabelRow[]> {
  const db = await openDb();
  const tx = db.transaction(LABELS_STORE, "readonly");
  const store = tx.objectStore(LABELS_STORE);
  const range = IDBKeyRange.bound(
    [fingerprint, ""],
    [fingerprint, "￿"],
  );
  const out: LabelRow[] = [];
  await new Promise<void>((resolve, reject) => {
    const cursorReq = store.openCursor(range);
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const stored = cursor.value as StoredLabel;
        // Strip the internal fingerprint key before returning the public row shape.
        const { fingerprint: _fp, ...rest } = stored;
        void _fp;
        out.push(rest as LabelRow);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  return out;
}

export async function saveSessionState(state: SessionState): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STATE_STORE, "readwrite");
  tx.objectStore(STATE_STORE).put(state);
  await txAsPromise(tx);
}

export async function loadSessionState(
  fingerprint: string,
): Promise<SessionState | null> {
  const db = await openDb();
  const tx = db.transaction(STATE_STORE, "readonly");
  const store = tx.objectStore(STATE_STORE);
  const req = store.get(fingerprint);
  return new Promise<SessionState | null>((resolve, reject) => {
    req.onsuccess = () => resolve((req.result as SessionState | undefined) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Audit log entry. One row per label change. The labelBefore/labelAfter
// pair lets the version-log UI show "you changed Pass to Fail at 14:32".
export type AuditEntry = {
  fingerprint: string;
  trace_id: string;
  at: string; // ISO timestamp
  // Snapshot of the label before this change. null if this was a creation.
  before: LabelRow | null;
  // Snapshot after the change. null if this was a deletion.
  after: LabelRow | null;
};

export async function appendAuditEntry(entry: AuditEntry): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(AUDIT_STORE, "readwrite");
  tx.objectStore(AUDIT_STORE).add(entry);
  await txAsPromise(tx);
}

export async function loadAuditForTrace(
  fingerprint: string,
  trace_id: string,
): Promise<AuditEntry[]> {
  const db = await openDb();
  const tx = db.transaction(AUDIT_STORE, "readonly");
  const idx = tx.objectStore(AUDIT_STORE).index("by-trace");
  const out: AuditEntry[] = [];
  await new Promise<void>((resolve, reject) => {
    const cursorReq = idx.openCursor(IDBKeyRange.only([fingerprint, trace_id]));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        out.push(cursor.value as AuditEntry);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  return out;
}

// Wizard config - small enough for localStorage, kept here so all persistence
// goes through one module.
const WIZARD_CONFIG_KEY = "ta:wizard-config";

export type WizardConfigPayload = {
  idField: string | null;
  inputField: string;
  outputField: string;
  metadataPassthrough: boolean;
  savedAt: string;
};

export function saveWizardConfig(config: WizardConfigPayload): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIZARD_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage disabled or quota exceeded. Wizard works without remembered config;
    // the user just re-enters mappings next time.
  }
}

export function loadWizardConfig(): WizardConfigPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(WIZARD_CONFIG_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardConfigPayload;
  } catch {
    return null;
  }
}

// Template choice - the "what kind of app is this?" answer the user gives
// once. Drives which example failure-mode tags are suggested in the tag
// panel (see docs/coaching-arc.md). Stored in localStorage so the prompt
// only appears on first run.
export type TemplateChoice = "chatbot" | "rag" | "summarizer" | "generic";
const TEMPLATE_KEY = "ta:template:v1";

export function loadTemplate(): TemplateChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TEMPLATE_KEY);
    if (!raw) return null;
    if (
      raw === "chatbot" ||
      raw === "rag" ||
      raw === "summarizer" ||
      raw === "generic"
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveTemplate(choice: TemplateChoice): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TEMPLATE_KEY, choice);
  } catch {
    // No-op; template is a UX hint, not data.
  }
}

// Hotkey config. Maps an action name to the keyboard key that triggers it.
// Stored in localStorage so user remappings persist across sessions. The
// default values match the v1 documented hotkeys (P pass, F fail, etc.).
export type Hotkeys = {
  pass: string;
  fail: string;
  next: string; // Enter or ArrowRight
  prev: string; // ArrowLeft
  labelNext: string; // N
  skip: string; // S
};

export const DEFAULT_HOTKEYS: Hotkeys = {
  pass: "p",
  fail: "f",
  next: "Enter",
  prev: "ArrowLeft",
  labelNext: "n",
  skip: "s",
};

const HOTKEYS_KEY = "ta:hotkeys:v1";

export function loadHotkeys(): Hotkeys {
  if (typeof window === "undefined") return DEFAULT_HOTKEYS;
  try {
    const raw = localStorage.getItem(HOTKEYS_KEY);
    if (!raw) return DEFAULT_HOTKEYS;
    const parsed = JSON.parse(raw) as Partial<Hotkeys>;
    return { ...DEFAULT_HOTKEYS, ...parsed };
  } catch {
    return DEFAULT_HOTKEYS;
  }
}

export function saveHotkeys(keys: Hotkeys): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(HOTKEYS_KEY, JSON.stringify(keys));
  } catch {
    // No-op.
  }
}

// Example tags shown as ghost suggestions in the tag input. NOT pre-applied.
// Sourced from docs/coaching-arc.md.
export function exampleTagsForTemplate(choice: TemplateChoice): string[] {
  switch (choice) {
    case "chatbot":
      return [
        "wrong-answer",
        "ignored-context",
        "unsafe-content",
        "too-verbose",
        "refused-incorrectly",
      ];
    case "rag":
      return [
        "not-grounded",
        "cherry-picked-context",
        "missing-citation",
        "hallucinated-source",
        "confused-by-irrelevant-chunk",
      ];
    case "summarizer":
      return [
        "omitted-key-fact",
        "wrong-tone",
        "too-long",
        "paraphrased-incorrectly",
        "lost-numbers-or-names",
      ];
    case "generic":
    default:
      return ["factually-wrong", "off-task", "unclear", "unsafe", "low-quality"];
  }
}
