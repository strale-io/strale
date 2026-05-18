/**
 * Nightly ingest — EE directors / representatives.
 *
 * Pulls the daily-refreshed CC BY 4.0 open-data dump
 * `ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip` from RIK
 * Ariregister and populates the `ee_directors` table. The handler
 * (`capabilities/estonian-company-data.ts`) queries this table at
 * request time to populate `legal_representatives[]` for tier-2
 * KYB coverage. Implements DEC-20260518-E exhaustive-enumeration outcome
 * for EE and DEC-20260518-F attribution requirements.
 *
 * Upstream:
 *   URL:    https://avaandmed.ariregister.rik.ee/sites/default/files/
 *           avaandmed/ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip
 *   Size:   ~45 MB compressed, ~1 GB uncompressed JSON (single file in ZIP)
 *   Format: top-level array of entity objects, each carrying a nested
 *           `kaardile_kantud_isikud[]` array of person-on-card filings
 *   Refresh: daily, typically ~10:37 UTC
 *   License: CC BY 4.0 (attribution preserved in handler provenance)
 *
 * GDPR caveat: since 2024-11-01 RIK redacts personal-ID codes from the
 * open-data files. `isikukood_registrikood` and `synniaeg` (DOB) are
 * always null in the dump; the hashed UUID lands in `isikukood_hash`.
 * Names, roles, addresses, start/end dates remain.
 *
 * Schedule. 24h interval after a 10-minute startup delay so a redeploy
 * doesn't trigger a 1 GB pull during boot rush. The advisory lock is
 * session-scoped on a dedicated postgres connection (DEC-20260504-B
 * bulk-operation pattern — long-running work cannot share the request
 * pool connection because lock-held-while-busy would starve customer
 * traffic). Cross-instance dedup: only one replica's pull lands per
 * cycle even if many are scheduled to fire simultaneously.
 *
 * Bounded-WAL pattern. UPSERT in batches of UPSERT_BATCH_SIZE rows per
 * statement, each batch in its own short transaction. After all rows
 * upserted, sweep deletes anything whose `last_synced_at < sync_start`
 * — bounded per-tick because the table doesn't grow without bound. This
 * matches DEC-20260504-B (no single transaction can blow WAL).
 *
 * Idempotency. The upstream `Last-Modified` header is checked against
 * `ee_directors_sync.last_modified_upstream`. A re-run on the same
 * upstream version is a no-op (logged as `skipped-unchanged`).
 */

import { spawn } from "node:child_process";
import { createWriteStream, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { getDb } from "../db/index.js";
import { fireAndForget } from "../lib/fire-and-forget.js";
import { log, logError, logWarn } from "../lib/log.js";
import { isShuttingDown } from "../lib/shutdown.js";

const INGEST_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 10 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260518; // unique across job files; matches DEC date
const UPSERT_BATCH_SIZE = 1000;
const UPSTREAM_URL =
  "https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__kaardile_kantud_isikud.json.zip";
const ZIP_ENTRY_NAME = "ettevotja_rekvisiidid__kaardile_kantud_isikud.json";

// Role-code allow-list — what counts as a "legal representative".
// Excluded: OSAN (osanik / shareholder), ASUTAJA / FOOMETS (founders, historical
// not currently-active). Anything else passes — forward-compat with RIK
// adding new representation role codes. The handler can refine per its
// own rules; ingest stays permissive.
const EXCLUDED_ROLE_CODES = new Set(["OSAN", "ASUTAJA", "FOOMETS"]);

// ─── Types matching the upstream JSON shape ──────────────────────────────────

interface UpstreamPerson {
  kirje_id: number;
  isiku_tyyp: string; // "F" (natural) | "J" (legal entity)
  isiku_roll: string;
  isiku_roll_tekstina: string;
  eesnimi: string | null;
  nimi_arinimi: string | null;
  isikukood_hash: string | null;
  isikukood_registrikood: string | null;
  valis_kood: string | null;
  valis_kood_riik: string | null;
  valis_kood_riik_tekstina: string | null;
  algus_kpv: string | null;
  lopp_kpv: string | null;
  aadress_ads__ads_normaliseeritud_taisaadress: string | null;
  aadress_riik: string | null;
}

interface UpstreamEntity {
  ariregistri_kood: number;
  nimi: string;
  kaardile_kantud_isikud: UpstreamPerson[];
}

interface EeDirectorRow {
  kirje_id: number;
  entity_reg_code: string;
  person_type: string;
  role_code: string;
  role_text: string;
  first_name: string | null;
  last_name: string | null;
  isikukood_hash: string | null;
  foreign_code: string | null;
  foreign_country_code: string | null;
  foreign_country_text: string | null;
  address_text: string | null;
  address_country_code: string | null;
  start_date: string | null; // ISO date
  end_date: string | null;
}

// ─── Date conversion ─────────────────────────────────────────────────────────

/** Upstream emits "DD.MM.YYYY" or "" (empty string means null). Convert
 *  to ISO YYYY-MM-DD or null. Anything that doesn't match the shape
 *  returns null rather than throwing — bad data should not crash ingest. */
export function parseEeDate(s: string | null | undefined): string | null {
  if (!s || typeof s !== "string") return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ─── Streaming JSON tokenizer ────────────────────────────────────────────────

/**
 * Streams a top-level JSON array of objects, yielding one object at a time.
 *
 * The upstream file is ~1 GB and cannot be JSON.parse'd whole — that would
 * spike Node's heap to ~3 GB and likely OOM on Railway. This walks the
 * byte stream maintaining brace depth + string state and yields each
 * top-level object as soon as its closing brace is seen.
 *
 * Constraint: assumes a top-level array of objects (matches the RIK file).
 * Will throw on malformed JSON via the inner `JSON.parse`.
 */
export class JsonArrayObjectStreamer {
  private buf = "";
  private pos = 0;
  private depth = 0;
  private inString = false;
  private escape = false;
  private objStart = -1;

  *push(chunk: string): IterableIterator<unknown> {
    this.buf += chunk;
    while (this.pos < this.buf.length) {
      const c = this.buf[this.pos];
      if (this.escape) {
        this.escape = false;
      } else if (this.inString) {
        if (c === "\\") this.escape = true;
        else if (c === '"') this.inString = false;
      } else if (c === '"') {
        this.inString = true;
      } else if (c === "{") {
        if (this.depth === 0) this.objStart = this.pos;
        this.depth++;
      } else if (c === "}") {
        this.depth--;
        if (this.depth === 0 && this.objStart >= 0) {
          const objStr = this.buf.slice(this.objStart, this.pos + 1);
          let parsed: unknown;
          try {
            parsed = JSON.parse(objStr);
          } catch (err) {
            throw new Error(
              `JsonArrayObjectStreamer: parse failure near byte ${this.pos}: ${(err as Error).message}`,
            );
          }
          yield parsed;
          const trimAt = this.pos + 1;
          this.buf = this.buf.slice(trimAt);
          this.pos = -1; // ++'d to 0 below
          this.objStart = -1;
        }
      }
      this.pos++;
    }
  }
}

// ─── HEAD probe for Last-Modified ────────────────────────────────────────────

async function headLastModified(): Promise<string | null> {
  const res = await fetch(UPSTREAM_URL, {
    method: "HEAD",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`HEAD ${UPSTREAM_URL} returned HTTP ${res.status}`);
  }
  return res.headers.get("last-modified");
}

// ─── ZIP entry → Readable stream ─────────────────────────────────────────────

/**
 * Extract the single JSON entry from the downloaded ZIP via `unzip -p`,
 * returning a Readable stream over the JSON bytes. Streams to stdout, so
 * the 1 GB uncompressed JSON never lands on disk (only the 45 MB ZIP).
 *
 * Why unzip and not a Node ZIP lib: avoids adding a new dependency tree.
 * `node:20-slim` Dockerfile would need `apt-get install unzip` — see the
 * `unzip` line added to the Dockerfile in this PR.
 *
 * The spawn returns the child process; the caller is responsible for
 * awaiting `exit` (the `pipeline` in `runIngestOnce` does that via its
 * stdout consumption).
 */
function extractJsonStream(zipPath: string): { child: ReturnType<typeof spawn>; stdout: Readable } {
  const child = spawn("unzip", ["-p", zipPath, ZIP_ENTRY_NAME], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (!child.stdout) {
    throw new Error("unzip child has no stdout stream");
  }
  child.stderr?.on("data", (chunk: Buffer) => {
    logWarn(
      "ingest-ee-directors-unzip-stderr",
      "unzip emitted stderr",
      { chunk: chunk.toString("utf8").slice(0, 400) },
    );
  });
  return { child, stdout: child.stdout as Readable };
}

// ─── Row shaping + filter ────────────────────────────────────────────────────

/** Convert an upstream person record + parent entity reg code into the row
 *  we persist. Returns null when the row should be skipped (excluded role
 *  code, no name, missing kirje_id). */
export function shapeRow(
  entityRegCode: string,
  p: UpstreamPerson,
): EeDirectorRow | null {
  if (!p || typeof p.kirje_id !== "number") return null;
  const roleCode = (p.isiku_roll ?? "").trim();
  if (!roleCode) return null;
  if (EXCLUDED_ROLE_CODES.has(roleCode)) return null;
  const firstName = (p.eesnimi ?? "").trim() || null;
  const lastName = (p.nimi_arinimi ?? "").trim() || null;
  if (!firstName && !lastName) return null; // no name → no representative we can surface
  return {
    kirje_id: p.kirje_id,
    entity_reg_code: entityRegCode,
    person_type: (p.isiku_tyyp ?? "").trim() || "F",
    role_code: roleCode,
    role_text: (p.isiku_roll_tekstina ?? roleCode).trim(),
    first_name: firstName,
    last_name: lastName,
    isikukood_hash: p.isikukood_hash ?? null,
    foreign_code: p.valis_kood ?? null,
    foreign_country_code: p.valis_kood_riik ?? null,
    foreign_country_text: p.valis_kood_riik_tekstina ?? null,
    address_text: p.aadress_ads__ads_normaliseeritud_taisaadress ?? null,
    address_country_code: p.aadress_riik ?? null,
    start_date: parseEeDate(p.algus_kpv),
    end_date: parseEeDate(p.lopp_kpv),
  };
}

// ─── Batched UPSERT ──────────────────────────────────────────────────────────

async function upsertBatch(
  client: postgres.Sql,
  rows: EeDirectorRow[],
  syncStartIso: string,
): Promise<void> {
  if (rows.length === 0) return;
  // postgres.js tagged-template + helper() handles parameter binding for
  // bulk inserts. ON CONFLICT (kirje_id) DO UPDATE keeps the table at
  // upstream-current; the SET clause references EXCLUDED.* (the would-be
  // insert) which is the standard upsert idiom.
  await client`
    INSERT INTO ee_directors ${client(
      rows.map((r) => ({
        kirje_id: r.kirje_id,
        entity_reg_code: r.entity_reg_code,
        person_type: r.person_type,
        role_code: r.role_code,
        role_text: r.role_text,
        first_name: r.first_name,
        last_name: r.last_name,
        isikukood_hash: r.isikukood_hash,
        foreign_code: r.foreign_code,
        foreign_country_code: r.foreign_country_code,
        foreign_country_text: r.foreign_country_text,
        address_text: r.address_text,
        address_country_code: r.address_country_code,
        start_date: r.start_date,
        end_date: r.end_date,
        last_synced_at: syncStartIso,
      })),
    )}
    ON CONFLICT (kirje_id) DO UPDATE SET
      entity_reg_code = EXCLUDED.entity_reg_code,
      person_type = EXCLUDED.person_type,
      role_code = EXCLUDED.role_code,
      role_text = EXCLUDED.role_text,
      first_name = EXCLUDED.first_name,
      last_name = EXCLUDED.last_name,
      isikukood_hash = EXCLUDED.isikukood_hash,
      foreign_code = EXCLUDED.foreign_code,
      foreign_country_code = EXCLUDED.foreign_country_code,
      foreign_country_text = EXCLUDED.foreign_country_text,
      address_text = EXCLUDED.address_text,
      address_country_code = EXCLUDED.address_country_code,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      last_synced_at = EXCLUDED.last_synced_at
  `;
}

// ─── Sync-marker helpers (dedicated client; tiny rows; no advisory lock here) ─

async function readSyncMarker(client: postgres.Sql): Promise<{
  last_modified_upstream: string | null;
  row_count: number | null;
} | null> {
  const rows = await client<
    { last_modified_upstream: string | null; row_count: number | null }[]
  >`
    SELECT last_modified_upstream, row_count
      FROM ee_directors_sync WHERE id = 1
  `;
  return rows[0] ?? null;
}

async function recordSyncAttempt(client: postgres.Sql): Promise<void> {
  await client`
    INSERT INTO ee_directors_sync (id, last_attempt_at)
    VALUES (1, NOW())
    ON CONFLICT (id) DO UPDATE SET last_attempt_at = NOW()
  `;
}

async function recordSyncSuccess(
  client: postgres.Sql,
  lastModified: string | null,
  rowCount: number,
): Promise<void> {
  await client`
    INSERT INTO ee_directors_sync (id, last_modified_upstream, last_success_at, last_attempt_at, row_count)
    VALUES (1, ${lastModified}, NOW(), NOW(), ${rowCount})
    ON CONFLICT (id) DO UPDATE SET
      last_modified_upstream = EXCLUDED.last_modified_upstream,
      last_success_at = EXCLUDED.last_success_at,
      last_attempt_at = EXCLUDED.last_attempt_at,
      row_count = EXCLUDED.row_count
  `;
}

// ─── Ingest orchestration (single tick) ──────────────────────────────────────

export interface IngestResult {
  outcome:
    | "skipped-unchanged"
    | "skipped-lock-busy"
    | "skipped-shutting-down"
    | "completed"
    | "errored";
  detail?: string;
  rows_upserted?: number;
  rows_deleted?: number;
  last_modified?: string | null;
  duration_ms: number;
}

export async function runIngestOnce(): Promise<IngestResult> {
  const startedAt = Date.now();

  if (isShuttingDown()) {
    return { outcome: "skipped-shutting-down", duration_ms: 0 };
  }

  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    return {
      outcome: "errored",
      detail: "DATABASE_URL not set",
      duration_ms: Date.now() - startedAt,
    };
  }

  // Dedicated session-scoped connection for the advisory lock + the long
  // batched UPSERT loop. Pool max=1 so we definitely don't fan out and
  // step on customer-traffic connections. Idle timeout is short so the
  // connection releases promptly after the job ends.
  const sqlClient = postgres(connStr, { max: 1, idle_timeout: 30 });
  let tmpZipPath: string | null = null;

  try {
    // Cross-instance dedup. Session-scoped (not xact-scoped) because the
    // work runs across many short transactions; xact-scoped would release
    // on the first commit.
    const [{ acquired }] = await sqlClient<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired
    `;
    if (!acquired) {
      return { outcome: "skipped-lock-busy", duration_ms: Date.now() - startedAt };
    }

    try {
      const upstreamLastModified = await headLastModified();
      const prior = await readSyncMarker(sqlClient);

      if (
        upstreamLastModified &&
        prior?.last_modified_upstream === upstreamLastModified &&
        (prior.row_count ?? 0) > 0
      ) {
        return {
          outcome: "skipped-unchanged",
          last_modified: upstreamLastModified,
          duration_ms: Date.now() - startedAt,
        };
      }

      await recordSyncAttempt(sqlClient);

      // Download to /tmp. Streams through pipeline so we don't buffer the
      // full 45 MB body in memory.
      tmpZipPath = join(tmpdir(), `ee_persons_${Date.now()}.zip`);
      const dlRes = await fetch(UPSTREAM_URL, { signal: AbortSignal.timeout(120_000) });
      if (!dlRes.ok || !dlRes.body) {
        throw new Error(`Download HTTP ${dlRes.status} (no body=${!dlRes.body})`);
      }
      await pipeline(
        Readable.fromWeb(dlRes.body as unknown as import("node:stream/web").ReadableStream),
        createWriteStream(tmpZipPath),
      );

      // Stream the embedded JSON through the array tokenizer.
      const syncStartIso = new Date().toISOString();
      const streamer = new JsonArrayObjectStreamer();
      const { child, stdout } = extractJsonStream(tmpZipPath);
      let entitiesSeen = 0;
      let rowsUpserted = 0;
      let pending: EeDirectorRow[] = [];

      stdout.setEncoding("utf8");
      for await (const chunk of stdout) {
        for (const obj of streamer.push(chunk as string)) {
          const e = obj as UpstreamEntity;
          if (!e || typeof e.ariregistri_kood !== "number") continue;
          entitiesSeen++;
          const entityRegCode = String(e.ariregistri_kood);
          const persons = Array.isArray(e.kaardile_kantud_isikud)
            ? e.kaardile_kantud_isikud
            : [];
          for (const p of persons) {
            const row = shapeRow(entityRegCode, p);
            if (!row) continue;
            pending.push(row);
            if (pending.length >= UPSERT_BATCH_SIZE) {
              await upsertBatch(sqlClient, pending, syncStartIso);
              rowsUpserted += pending.length;
              pending = [];
              if (isShuttingDown()) {
                throw new Error("shutdown-during-ingest");
              }
            }
          }
        }
      }
      if (pending.length > 0) {
        await upsertBatch(sqlClient, pending, syncStartIso);
        rowsUpserted += pending.length;
        pending = [];
      }

      // Drain the child. unzip exits 0 on clean extract.
      const childCode: number = await new Promise((resolve, reject) => {
        child.on("exit", (code) => resolve(code ?? 0));
        child.on("error", reject);
      });
      if (childCode !== 0) {
        throw new Error(`unzip exited with code ${childCode}`);
      }

      // Sweep rows no longer present upstream. Bounded — the table is at
      // most ~10 M rows and only the delta from the last sync deletes.
      const delRes = await sqlClient`
        DELETE FROM ee_directors
         WHERE last_synced_at < ${syncStartIso}
      `;
      const rowsDeleted = (delRes as unknown as { count?: number }).count ?? 0;

      await recordSyncSuccess(sqlClient, upstreamLastModified, rowsUpserted);

      log.info(
        {
          label: "ingest-ee-directors-success",
          entities_seen: entitiesSeen,
          rows_upserted: rowsUpserted,
          rows_deleted: rowsDeleted,
          duration_ms: Date.now() - startedAt,
          last_modified: upstreamLastModified,
        },
        "ingest-ee-directors-success",
      );

      return {
        outcome: "completed",
        rows_upserted: rowsUpserted,
        rows_deleted: rowsDeleted,
        last_modified: upstreamLastModified,
        duration_ms: Date.now() - startedAt,
      };
    } finally {
      await sqlClient`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`.catch(() => {});
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("ingest-ee-directors-failed", err, {
      duration_ms: Date.now() - startedAt,
    });
    return {
      outcome: "errored",
      detail: message,
      duration_ms: Date.now() - startedAt,
    };
  } finally {
    if (tmpZipPath) {
      await fsp.unlink(tmpZipPath).catch(() => {});
    }
    await sqlClient.end({ timeout: 5 }).catch(() => {});
  }
}

// ─── Lifecycle wiring ────────────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;

export function startEeDirectorsIngest(): void {
  if (intervalHandle || startupTimeout) return;
  startupTimeout = setTimeout(() => {
    fireAndForget(() => runIngestOnce(), { label: "ingest-ee-directors-tick" });
    intervalHandle = setInterval(() => {
      if (isShuttingDown()) return;
      fireAndForget(() => runIngestOnce(), { label: "ingest-ee-directors-tick" });
    }, INGEST_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopEeDirectorsIngestForTest(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
