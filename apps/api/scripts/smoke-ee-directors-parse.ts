/**
 * Parse-only smoke for the EE-directors ingest building blocks.
 *
 * Runs `unzip -p` against the upstream ZIP (downloaded to /tmp by the
 * caller via curl, or by this script if missing), feeds bytes through
 * `JsonArrayObjectStreamer`, filters via `shapeRow`, and reports:
 *   - total entities streamed
 *   - total rows kept (representative-bearing)
 *   - per-role-code histogram
 *   - the rows for the smoke entities (Bolt Technology 12417834, Wise 10947145)
 *
 * No DB. No prod side-effects. Validates that the parse + filter chain
 * works against the actual 1 GB dump.
 *
 * Usage:
 *   npx tsx apps/api/scripts/smoke-ee-directors-parse.ts
 */

import { spawn } from "node:child_process";
import { promises as fsp, createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  JsonArrayObjectStreamer,
  shapeRow,
} from "../src/jobs/ingest-ee-directors.js";

const UPSTREAM_URL =
  "https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip";
const ZIP_ENTRY = "ettevotja_rekvisiidid__kaardile_kantud_isikud.json";
const SMOKE_ENTITIES = new Set(["12417834", "10947145", "11415592"]);

async function ensureLocalZip(): Promise<string> {
  const path = join(tmpdir(), "ee_persons.zip");
  try {
    const stat = await fsp.stat(path);
    if (stat.size > 1_000_000) {
      console.log(`[smoke] using cached ${path} (${stat.size} bytes)`);
      return path;
    }
  } catch {
    /* fall through to download */
  }
  console.log(`[smoke] downloading ${UPSTREAM_URL} → ${path}`);
  const res = await fetch(UPSTREAM_URL, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok || !res.body) {
    throw new Error(`download HTTP ${res.status}`);
  }
  await pipeline(
    Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream),
    createWriteStream(path),
  );
  return path;
}

async function main() {
  const zipPath = await ensureLocalZip();
  const startedAt = Date.now();
  const child = spawn("unzip", ["-p", zipPath, ZIP_ENTRY], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stderr?.on("data", (b: Buffer) => {
    process.stderr.write(`[unzip] ${b.toString("utf8")}`);
  });
  const stream = child.stdout;
  if (!stream) throw new Error("no stdout from unzip child");
  stream.setEncoding("utf8");

  const streamer = new JsonArrayObjectStreamer();
  let entitiesSeen = 0;
  let rowsKept = 0;
  const roleHistogram: Map<string, number> = new Map();
  const smokeRows: Record<string, unknown[]> = {};
  for (const id of SMOKE_ENTITIES) smokeRows[id] = [];

  for await (const chunk of stream) {
    for (const obj of streamer.push(chunk as string)) {
      const e = obj as {
        ariregistri_kood: number;
        nimi?: string;
        kaardile_kantud_isikud?: unknown[];
      };
      if (!e || typeof e.ariregistri_kood !== "number") continue;
      entitiesSeen++;
      if (entitiesSeen % 50_000 === 0) {
        console.log(
          `[smoke] entities streamed: ${entitiesSeen} (rows kept: ${rowsKept}) — ${Math.round(
            (Date.now() - startedAt) / 1000,
          )}s`,
        );
      }
      const code = String(e.ariregistri_kood);
      const persons = Array.isArray(e.kaardile_kantud_isikud)
        ? e.kaardile_kantud_isikud
        : [];
      for (const p of persons) {
        // p is typed loosely here — shapeRow returns null on filter-out.
        const row = shapeRow(code, p as never);
        if (!row) continue;
        rowsKept++;
        roleHistogram.set(row.role_code, (roleHistogram.get(row.role_code) ?? 0) + 1);
        if (SMOKE_ENTITIES.has(code)) {
          smokeRows[code].push({
            name: [row.first_name, row.last_name].filter(Boolean).join(" "),
            role: `${row.role_code} (${row.role_text})`,
            type: row.person_type,
            start_date: row.start_date,
            end_date: row.end_date,
          });
        }
      }
    }
  }

  const exitCode: number = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 0));
  });

  console.log("");
  console.log("──────────── EE directors parse smoke ────────────");
  console.log(`unzip exit code:       ${exitCode}`);
  console.log(`entities streamed:     ${entitiesSeen}`);
  console.log(`rows kept (post-filter): ${rowsKept}`);
  console.log(`elapsed:               ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log("");
  console.log("role-code histogram (top 10):");
  const sorted = [...roleHistogram.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [code, n] of sorted) console.log(`  ${code.padEnd(12)} ${n}`);
  console.log("");
  for (const id of SMOKE_ENTITIES) {
    console.log(`smoke entity ${id} — ${smokeRows[id].length} representative(s):`);
    for (const r of smokeRows[id]) console.log(`  ${JSON.stringify(r)}`);
    console.log("");
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error("[smoke] fatal:", err);
    process.exit(1);
  },
);
