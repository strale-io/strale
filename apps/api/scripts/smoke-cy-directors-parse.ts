/**
 * Parse-only smoke for the CY DRCOR open-data ingest.
 *
 * Streams the live 120 MB `organisation_officials_83.csv` via the same
 * CsvStreamer + shapeRow pipeline the production ingest uses, but DOES
 * NOT touch the DB. Validates:
 *   - end-to-end streaming completes without memory blow-up
 *   - row count is in the expected ~1.17M range
 *   - role histogram matches the Phase 6 enumeration partial
 *   - real entities (Wargaming 290868, Bank of Cyprus 165) return their
 *     known officer counts
 *
 * Usage: `npx tsx scripts/smoke-cy-directors-parse.ts`
 *
 * Network: 120 MB download. Expect ~30s on a fast EU/US link. The file
 * is consumed via stream; nothing is buffered whole in memory.
 */

import { createWriteStream, createReadStream, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  CsvStreamer,
  shapeRow,
  type CyDirectorRow,
} from "../src/jobs/ingest-cy-directors.js";

const UPSTREAM_URL =
  "https://data.gov.cy/sites/default/files/organisation_officials_83.csv";

const SPOTLIGHT_REG_CODES = new Set([
  "165", // Bank of Cyprus
  "290868", // Wargaming Group Limited
  "11", // The Sun Insurance Office Limited (first file row)
]);

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.log(`[smoke-cy] HEAD ${UPSTREAM_URL}`);
  const head = await fetch(UPSTREAM_URL, { method: "HEAD" });
  console.log(
    `[smoke-cy] HEAD HTTP ${head.status} Last-Modified=${head.headers.get("last-modified")} Content-Length=${head.headers.get("content-length")}`,
  );

  const tmpPath = join(tmpdir(), `cy_smoke_${Date.now()}.csv`);
  console.log(`[smoke-cy] downloading → ${tmpPath}`);
  const dl = await fetch(UPSTREAM_URL);
  if (!dl.ok || !dl.body) throw new Error(`Download HTTP ${dl.status}`);
  await pipeline(
    Readable.fromWeb(dl.body as unknown as import("node:stream/web").ReadableStream),
    createWriteStream(tmpPath),
  );
  const dlElapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`[smoke-cy] download complete in ${dlElapsedSec}s`);

  const parseStartedAt = Date.now();
  const stream = createReadStream(tmpPath, { encoding: "utf8" });
  const streamer = new CsvStreamer();

  let rowsSeen = 0;
  let rowsShaped = 0;
  const roleHist = new Map<string, number>();
  const spotlight = new Map<string, CyDirectorRow[]>();

  for await (const chunk of stream) {
    for (const cols of streamer.push(chunk as string)) {
      rowsSeen++;
      const row = shapeRow(cols);
      if (!row) continue;
      rowsShaped++;
      roleHist.set(
        row.role_standardized,
        (roleHist.get(row.role_standardized) ?? 0) + 1,
      );
      if (SPOTLIGHT_REG_CODES.has(row.entity_reg_code)) {
        const arr = spotlight.get(row.entity_reg_code) ?? [];
        arr.push(row);
        spotlight.set(row.entity_reg_code, arr);
      }
    }
  }
  for (const cols of streamer.flush()) {
    rowsSeen++;
    const row = shapeRow(cols);
    if (!row) continue;
    rowsShaped++;
  }

  const parseElapsedSec = ((Date.now() - parseStartedAt) / 1000).toFixed(1);
  console.log("");
  console.log(`[smoke-cy] parse complete in ${parseElapsedSec}s`);
  console.log(`[smoke-cy] rows seen:     ${rowsSeen}`);
  console.log(`[smoke-cy] rows shaped:   ${rowsShaped}`);
  console.log("");
  console.log("[smoke-cy] role_standardized histogram:");
  const sorted = [...roleHist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [role, count] of sorted) {
    console.log(`  ${role.padEnd(22)} ${count}`);
  }

  console.log("");
  for (const code of SPOTLIGHT_REG_CODES) {
    const rows = spotlight.get(code) ?? [];
    if (rows.length === 0) {
      console.log(`[smoke-cy] reg_code ${code}: NO ROWS FOUND`);
      continue;
    }
    const orgName = rows[0].organisation_name;
    const orgType = rows[0].organisation_type;
    console.log(
      `[smoke-cy] reg_code ${code} (${orgName}, ${orgType}): ${rows.length} officer rows`,
    );
    for (const r of rows) {
      console.log(
        `  - ${r.person_or_organisation_name.padEnd(50)} ${r.role_standardized.padEnd(20)} (${r.official_position})`,
      );
    }
  }

  await fsp.unlink(tmpPath).catch(() => {});
  console.log("");
  console.log(`[smoke-cy] total elapsed: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error("[smoke-cy] FAILED:", err);
  process.exit(1);
});
