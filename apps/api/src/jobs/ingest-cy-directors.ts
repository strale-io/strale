/**
 * Weekly ingest (skip-if-unchanged) — CY directors / officers.
 *
 * Pulls the monthly-refreshed CC BY 4.0 open-data CSV
 * `organisation_officials_83.csv` from data.gov.cy (Department of
 * Registrar of Companies and Intellectual Property, DRCIP) and populates
 * the `cy_directors` table. The handler (`capabilities/cypriot-company-
 * data.ts`) queries this table at request time to populate
 * `legal_representatives[]` for tier-2 KYB coverage. Implements DEC-20260518-E
 * exhaustive-enumeration outcome for CY and DEC-20260518-F attribution.
 *
 * Upstream:
 *   URL:    https://data.gov.cy/sites/default/files/organisation_officials_83.csv
 *   Size:   ~120 MB CSV (plain text, NOT zipped)
 *   Format: RFC-4180 CSV, UTF-8 with BOM, CRLF line endings, header row.
 *           Columns: ORGANISATION_NAME, REGISTRATION_NO, ORGANISATION_TYPE_CODE,
 *           ORGANISATION_TYPE, PERSON_OR_ORGANISATION_NAME, OFFICIAL_POSITION
 *   Refresh: monthly (last seen 2026-04-29 07:35 UTC)
 *   License: CC BY 4.0 (attribution preserved in handler provenance)
 *
 * GDPR caveat: DRCOR open data does not include personal identification
 * numbers or DOB at the row level — only names + roles + organisation
 * context. No additional redaction needed at ingest. The Cypriot UBO
 * register is a separate restricted system (out of scope for this job).
 *
 * Identifier mapping. DRCOR REGISTRATION_NO is pure numeric (e.g.
 * "290868", "11", "165"). The Strale CY handler accepts three input
 * shapes: CY-prefix VAT, bare-VAT, C-prefix company number. Only the
 * C-prefix maps cleanly to DRCOR (strip "C" → numeric lookup). The
 * Phase 6 enumeration partial documents this: VAT-format inputs cannot
 * be resolved against the DRCOR cache because DRCOR doesn't index by
 * VAT — the cache stores numeric registration_no only.
 *
 * Schedule. Weekly interval after a 10-minute startup delay (DRCOR
 * refreshes monthly but weekly + Last-Modified-skip is safer than
 * monthly-exact — covers the case where DRCOR refreshes off-schedule).
 * Advisory lock is session-scoped on a dedicated postgres connection
 * (DEC-20260504-B — long-running work cannot share the request pool).
 * Cross-instance dedup via pg_try_advisory_lock.
 *
 * Bounded-WAL pattern. UPSERT in batches of UPSERT_BATCH_SIZE rows per
 * statement, each batch in its own short transaction. After all rows
 * upserted, sweep deletes anything whose `last_synced_at < sync_start`
 * — bounded per-tick because the table is at most ~1.2 M rows and the
 * delta from the last sync is small.
 *
 * Idempotency. The upstream `Last-Modified` header is checked against
 * `cy_directors_sync.last_modified_upstream`. A re-run on the same
 * upstream version is a no-op (logged as `skipped-unchanged`).
 */

import { createWriteStream, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import postgres from "postgres";
import { fireAndForget } from "../lib/fire-and-forget.js";
import { log, logError } from "../lib/log.js";
import { isShuttingDown } from "../lib/shutdown.js";

const INGEST_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // weekly + skip-if-unchanged
const STARTUP_DELAY_MS = 10 * 60 * 1000;
const ADVISORY_LOCK_ID = 20260519; // unique across job files; CY ingest
const UPSERT_BATCH_SIZE = 1000;
const UPSTREAM_URL =
  "https://data.gov.cy/sites/default/files/organisation_officials_83.csv";

// Role normalization — Greek role label → English standardized code. Keys are
// the verbatim DRCOR OFFICIAL_POSITION values. Anything not listed falls
// through to "other" (forward-compat for DRCOR adding new positions).
// Source: data.gov.cy OFFICIAL_POSITION uniq histogram, 2026-05-18 probe.
export const ROLE_STANDARDIZATION: Record<string, string> = {
  "Διευθυντής": "director",
  "Γραμματέας": "secretary",
  "Ιδιοκτήτης": "owner",
  "Ομόρρυθμος Συνέταιρος": "general_partner",
  "Αντικαταστάτης Διευθυντής": "alternate_director",
  "Βοηθός Γραμματέας": "assistant_secretary",
  "Εξουσιοδοτημένο Πρόσωπο": "authorised_person",
  "Ετερόρρυθμος Συνέταιρος": "limited_partner",
  "Αναπληρωτής Γραμματέας": "deputy_secretary",
};

export function standardizeRole(officialPosition: string): string {
  return ROLE_STANDARDIZATION[officialPosition.trim()] ?? "other";
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CyDirectorRow {
  entity_reg_code: string;
  person_or_organisation_name: string;
  official_position: string;
  organisation_name: string | null;
  organisation_type_code: string | null;
  organisation_type: string | null;
  role_standardized: string;
}

// ─── Streaming CSV parser (RFC 4180) ─────────────────────────────────────────

/**
 * Streaming CSV tokenizer. Handles RFC-4180 quoted fields with doubled-
 * quote escaping (e.g. `"foo ""bar"" baz"`), CRLF or LF line endings,
 * and a leading UTF-8 BOM. Emits one row at a time as `string[]` whenever
 * an unquoted row terminator is consumed.
 *
 * Constraint: assumes the CSV is well-formed. Trailing newline optional.
 * Empty fields are emitted as empty strings, not null. The caller decides
 * how to map row arrays to its shape.
 *
 * Why a hand-rolled parser: avoids adding a dep tree for a single use
 * site (parallel to the EE JSON tokenizer choice). The grammar is small
 * (4 states); the test suite below covers the edge cases.
 */
export class CsvStreamer {
  private buf = "";
  private state: "FIELD_START" | "UNQUOTED" | "QUOTED" | "QUOTED_QUOTE" =
    "FIELD_START";
  private fieldStart = 0;
  private fieldParts: string[] = []; // accumulator for the current field
  private row: string[] = [];
  private sawBom = false;

  *push(chunk: string): IterableIterator<string[]> {
    if (!this.sawBom) {
      this.sawBom = true;
      if (chunk.charCodeAt(0) === 0xfeff) {
        chunk = chunk.slice(1);
      }
    }
    this.buf += chunk;
    while (this.fieldStart < this.buf.length) {
      const c = this.buf[this.fieldStart];
      switch (this.state) {
        case "FIELD_START":
          if (c === '"') {
            this.state = "QUOTED";
            this.fieldStart++;
            this.markFieldRestart();
          } else if (c === ",") {
            this.row.push("");
            this.fieldStart++;
            this.markFieldRestart();
          } else if (c === "\r" || c === "\n") {
            this.row.push("");
            yield* this.emitRow(c);
          } else {
            this.state = "UNQUOTED";
            this.fieldStart++;
          }
          break;
        case "UNQUOTED":
          if (c === ",") {
            this.flushUnquoted();
            this.fieldStart++;
            this.state = "FIELD_START";
            this.markFieldRestart();
          } else if (c === "\r" || c === "\n") {
            this.flushUnquoted();
            yield* this.emitRow(c);
          } else {
            this.fieldStart++;
          }
          break;
        case "QUOTED":
          if (c === '"') {
            this.state = "QUOTED_QUOTE";
            // Flush whatever was accumulated for the field so far (between
            // the opening quote and this potential closing quote).
            this.fieldParts.push(this.buf.slice(this.fieldRestart, this.fieldStart));
            this.fieldStart++;
          } else {
            this.fieldStart++;
          }
          break;
        case "QUOTED_QUOTE":
          if (c === '"') {
            // Escaped quote inside quoted field — emit one literal `"`
            // and resume quoted mode.
            this.fieldParts.push('"');
            this.state = "QUOTED";
            this.fieldStart++;
            this.markFieldRestart();
          } else if (c === ",") {
            this.row.push(this.fieldParts.join(""));
            this.fieldParts = [];
            this.state = "FIELD_START";
            this.fieldStart++;
            this.markFieldRestart();
          } else if (c === "\r" || c === "\n") {
            this.row.push(this.fieldParts.join(""));
            this.fieldParts = [];
            yield* this.emitRow(c);
          } else {
            // Per RFC-4180 strict, an unescaped " mid-quoted-field is
            // invalid. We accept and treat as literal for resilience.
            this.fieldParts.push('"');
            this.fieldParts.push(c);
            this.state = "QUOTED";
            this.fieldStart++;
            this.markFieldRestart();
          }
          break;
      }
    }
    // Slide the buffer so we don't grow it across chunks. Anything
    // unconsumed belongs to a field-in-progress.
    this.trimBuffer();
  }

  /** Flush at EOF: emit any pending field/row that didn't end with a newline. */
  *flush(): IterableIterator<string[]> {
    if (this.state === "UNQUOTED") {
      this.flushUnquoted();
    } else if (this.state === "QUOTED_QUOTE") {
      this.row.push(this.fieldParts.join(""));
      this.fieldParts = [];
    } else if (this.state === "QUOTED") {
      // Unterminated quoted field — emit what we have rather than throwing.
      this.fieldParts.push(this.buf.slice(this.fieldRestart, this.fieldStart));
      this.row.push(this.fieldParts.join(""));
      this.fieldParts = [];
    }
    if (this.row.length > 0 || this.state !== "FIELD_START") {
      yield this.row;
      this.row = [];
    }
    this.state = "FIELD_START";
  }

  // Restart point inside the buffer for the field currently being read.
  // Used by both UNQUOTED (one contiguous slice) and QUOTED (one or more
  // slices separated by escaped quotes).
  private fieldRestart = 0;

  private markFieldRestart(): void {
    this.fieldRestart = this.fieldStart;
  }

  private flushUnquoted(): void {
    this.row.push(this.buf.slice(this.fieldRestart, this.fieldStart));
  }

  private *emitRow(c: string): IterableIterator<string[]> {
    yield this.row;
    this.row = [];
    this.fieldStart++;
    // Consume the LF half of a CRLF as part of the same terminator.
    if (c === "\r" && this.buf[this.fieldStart] === "\n") {
      this.fieldStart++;
    }
    this.state = "FIELD_START";
    this.markFieldRestart();
  }

  private trimBuffer(): void {
    if (this.state === "FIELD_START") {
      this.buf = this.buf.slice(this.fieldStart);
      this.fieldStart = 0;
      this.fieldRestart = 0;
    } else if (this.state === "UNQUOTED") {
      // Keep from fieldRestart onwards — the field is mid-flight.
      this.buf = this.buf.slice(this.fieldRestart);
      this.fieldStart -= this.fieldRestart;
      this.fieldRestart = 0;
    } else {
      // QUOTED / QUOTED_QUOTE — fieldParts already holds prior slices,
      // so we can safely drop everything before the current cursor.
      this.buf = this.buf.slice(this.fieldRestart);
      this.fieldStart -= this.fieldRestart;
      this.fieldRestart = 0;
    }
  }
}

// ─── Row shaping ─────────────────────────────────────────────────────────────

/** Map a raw CSV row (string[]) into the persistence shape. Returns null for
 *  rows that can't be persisted (header row, missing required fields,
 *  blank REGISTRATION_NO). The header is detected by exact column-name
 *  match, not by row index — a defensive choice in case DRCOR ever adds
 *  metadata rows before the header. */
export function shapeRow(cols: string[]): CyDirectorRow | null {
  if (cols.length < 6) return null;
  const [
    organisationName,
    registrationNo,
    organisationTypeCode,
    organisationType,
    personOrOrganisationName,
    officialPosition,
  ] = cols.map((c) => (c ?? "").trim());

  // Skip the header row (defensive — could appear once at file start or
  // never if BOM was already consumed by the streamer).
  if (
    organisationName === "ORGANISATION_NAME" &&
    registrationNo === "REGISTRATION_NO"
  ) {
    return null;
  }

  if (!registrationNo || !personOrOrganisationName || !officialPosition) {
    return null;
  }

  return {
    entity_reg_code: registrationNo,
    person_or_organisation_name: personOrOrganisationName,
    official_position: officialPosition,
    organisation_name: organisationName || null,
    organisation_type_code: organisationTypeCode || null,
    organisation_type: organisationType || null,
    role_standardized: standardizeRole(officialPosition),
  };
}

// ─── HEAD probe ──────────────────────────────────────────────────────────────

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

// ─── Batched UPSERT ──────────────────────────────────────────────────────────

async function upsertBatch(
  client: postgres.Sql,
  rows: CyDirectorRow[],
  syncStartIso: string,
): Promise<number> {
  if (rows.length === 0) return 0;

  // Pre-dedupe within the batch on the composite PK to avoid the
  // "ON CONFLICT cannot affect the same row twice" postgres error that
  // fires when the same (entity, name, position) appears more than once
  // within a single batch. Last occurrence wins (matches the natural
  // semantics — DRCOR doesn't repeat semantically, but defensive vs
  // upstream typos that yield two near-identical rows).
  const dedup = new Map<string, CyDirectorRow>();
  for (const r of rows) {
    dedup.set(
      `${r.entity_reg_code}\x00${r.person_or_organisation_name}\x00${r.official_position}`,
      r,
    );
  }
  const unique = Array.from(dedup.values());

  await client`
    INSERT INTO cy_directors ${client(
      unique.map((r) => ({
        entity_reg_code: r.entity_reg_code,
        person_or_organisation_name: r.person_or_organisation_name,
        official_position: r.official_position,
        organisation_name: r.organisation_name,
        organisation_type_code: r.organisation_type_code,
        organisation_type: r.organisation_type,
        role_standardized: r.role_standardized,
        last_synced_at: syncStartIso,
      })),
    )}
    ON CONFLICT (entity_reg_code, person_or_organisation_name, official_position)
    DO UPDATE SET
      organisation_name = EXCLUDED.organisation_name,
      organisation_type_code = EXCLUDED.organisation_type_code,
      organisation_type = EXCLUDED.organisation_type,
      role_standardized = EXCLUDED.role_standardized,
      last_synced_at = EXCLUDED.last_synced_at
  `;
  return unique.length;
}

// ─── Sync-marker helpers ─────────────────────────────────────────────────────

async function readSyncMarker(client: postgres.Sql): Promise<{
  last_modified_upstream: string | null;
  row_count: number | null;
} | null> {
  const rows = await client<
    { last_modified_upstream: string | null; row_count: number | null }[]
  >`
    SELECT last_modified_upstream, row_count
      FROM cy_directors_sync WHERE id = 1
  `;
  return rows[0] ?? null;
}

async function recordSyncAttempt(client: postgres.Sql): Promise<void> {
  await client`
    INSERT INTO cy_directors_sync (id, last_attempt_at)
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
    INSERT INTO cy_directors_sync (id, last_modified_upstream, last_success_at, last_attempt_at, row_count)
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

  const sqlClient = postgres(connStr, { max: 1, idle_timeout: 30 });
  let tmpCsvPath: string | null = null;

  try {
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
      // 120 MB body in memory.
      tmpCsvPath = join(tmpdir(), `cy_officials_${Date.now()}.csv`);
      const dlRes = await fetch(UPSTREAM_URL, {
        signal: AbortSignal.timeout(180_000),
      });
      if (!dlRes.ok || !dlRes.body) {
        throw new Error(`Download HTTP ${dlRes.status} (no body=${!dlRes.body})`);
      }
      await pipeline(
        Readable.fromWeb(dlRes.body as unknown as import("node:stream/web").ReadableStream),
        createWriteStream(tmpCsvPath),
      );

      // Re-open the file as a stream for parsing — gives us controlled
      // chunked reads without loading the whole 120 MB into memory.
      const { createReadStream } = await import("node:fs");
      const csvStream = createReadStream(tmpCsvPath, { encoding: "utf8" });
      const streamer = new CsvStreamer();
      const syncStartIso = new Date().toISOString();
      let rowsSeen = 0;
      let rowsUpserted = 0;
      let pending: CyDirectorRow[] = [];

      for await (const chunk of csvStream) {
        for (const cols of streamer.push(chunk as string)) {
          rowsSeen++;
          const row = shapeRow(cols);
          if (!row) continue;
          pending.push(row);
          if (pending.length >= UPSERT_BATCH_SIZE) {
            rowsUpserted += await upsertBatch(sqlClient, pending, syncStartIso);
            pending = [];
            if (isShuttingDown()) {
              throw new Error("shutdown-during-ingest");
            }
          }
        }
      }
      for (const cols of streamer.flush()) {
        rowsSeen++;
        const row = shapeRow(cols);
        if (!row) continue;
        pending.push(row);
      }
      if (pending.length > 0) {
        rowsUpserted += await upsertBatch(sqlClient, pending, syncStartIso);
        pending = [];
      }

      const delRes = await sqlClient`
        DELETE FROM cy_directors
         WHERE last_synced_at < ${syncStartIso}
      `;
      const rowsDeleted = (delRes as unknown as { count?: number }).count ?? 0;

      await recordSyncSuccess(sqlClient, upstreamLastModified, rowsUpserted);

      log.info(
        {
          label: "ingest-cy-directors-success",
          rows_seen: rowsSeen,
          rows_upserted: rowsUpserted,
          rows_deleted: rowsDeleted,
          duration_ms: Date.now() - startedAt,
          last_modified: upstreamLastModified,
        },
        "ingest-cy-directors-success",
      );

      return {
        outcome: "completed",
        rows_upserted: rowsUpserted,
        rows_deleted: rowsDeleted,
        last_modified: upstreamLastModified,
        duration_ms: Date.now() - startedAt,
      };
    } finally {
      await sqlClient`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`.catch((err) =>
        logError("ingest-cy-directors-unlock-failed", err),
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError("ingest-cy-directors-failed", err, {
      duration_ms: Date.now() - startedAt,
    });
    return {
      outcome: "errored",
      detail: message,
      duration_ms: Date.now() - startedAt,
    };
  } finally {
    if (tmpCsvPath) {
      await fsp.unlink(tmpCsvPath).catch((err) =>
        logError("ingest-cy-directors-tmp-unlink-failed", err, { tmpCsvPath }),
      );
    }
    await sqlClient.end({ timeout: 5 }).catch((err) =>
      logError("ingest-cy-directors-client-end-failed", err),
    );
  }
}

// ─── Lifecycle wiring ────────────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let startupTimeout: ReturnType<typeof setTimeout> | null = null;

export function startCyDirectorsIngest(): void {
  if (intervalHandle || startupTimeout) return;
  startupTimeout = setTimeout(() => {
    fireAndForget(() => runIngestOnce(), { label: "ingest-cy-directors-tick" });
    intervalHandle = setInterval(() => {
      if (isShuttingDown()) return;
      fireAndForget(() => runIngestOnce(), { label: "ingest-cy-directors-tick" });
    }, INGEST_INTERVAL_MS);
  }, STARTUP_DELAY_MS);
}

export function stopCyDirectorsIngestForTest(): void {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
