#!/usr/bin/env -S npx tsx
// Smoke test for every fixture in sample-data/. Runs the same parse +
// autoRecognize + applyMapping pipeline the wizard uses, but headlessly so
// we can verify all fixtures end-to-end without manually clicking through
// the UI. Satisfies the Step 5 DoD ("All Step 1 fixtures load through the
// wizard end-to-end").
//
// Usage: npx tsx scripts/test-fixtures.mjs

import { readFile, readdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  detectFormat,
  parseJSON,
  parseJSONL,
  parseCSV,
} from "../src/lib/trace/parse";
import {
  autoRecognize,
  collectFieldNames,
  applyMapping,
} from "../src/lib/trace/mapping";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const fixturesDir = join(repo, "sample-data");

const fixtures = (await readdir(fixturesDir)).filter(
  (f: string) => f.endsWith(".json") || f.endsWith(".jsonl") || f.endsWith(".csv"),
);

let pass = 0;
let fail = 0;

for (const name of fixtures) {
  const path = join(fixturesDir, name);
  const content = await readFile(path, "utf8");
  const fmt = detectFormat(name, content);
  let rows: unknown[];
  let envelope: string | null = null;
  if (fmt === "csv") {
    const r = parseCSV(content);
    if (!r.ok) {
      fail++;
      console.log(`FAIL  ${name}  parseCSV: ${r.error}`);
      continue;
    }
    rows = r.value.rows;
  } else {
    const r = fmt === "json" ? parseJSON(content) : parseJSONL(content);
    if (!r.ok) {
      fail++;
      console.log(`FAIL  ${name}  parse${fmt.toUpperCase()}: ${r.error}`);
      continue;
    }
    rows = r.value.rows;
    envelope = r.value.unwrappedFrom;
  }
  const objRows = rows.filter(
    (it): it is Record<string, unknown> =>
      it !== null && typeof it === "object" && !Array.isArray(it),
  );
  if (objRows.length === 0) {
    fail++;
    console.log(`FAIL  ${name}  no object rows`);
    continue;
  }
  const fields = collectFieldNames(objRows);
  const auto = autoRecognize(fields, objRows[0]);
  if (!auto) {
    if (name === "synthetic-ambiguous-fields.json") {
      pass++;
      console.log(
        `PASS  ${name}  envelope=${envelope ?? "-"}  auto=null (manual mapping expected)`,
      );
      continue;
    }
    fail++;
    console.log(`FAIL  ${name}  autoRecognize returned null`);
    continue;
  }
  const applied = applyMapping(objRows, auto.config);
  if (!applied.ok) {
    fail++;
    console.log(`FAIL  ${name}  applyMapping: ${applied.error}`);
    continue;
  }
  const traces = applied.value;
  const first = traces[0];
  pass++;
  console.log(
    `PASS  ${name}  envelope=${envelope ?? "-"}  nested=${auto.usedNestedMessages}  count=${traces.length}  first=in:${first.input.length},out:${first.output.length}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
