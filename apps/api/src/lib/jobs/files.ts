/**
 * File output for async jobs (portfolio plan 2.11).
 *
 * A capability that produces a file (a transcript, an OCR'd document) returns
 * it next to its JSON output as `files`. The bytes are stored in Postgres —
 * Strale has no object store, and the caps below keep that honest — and are
 * only ever served through a signed URL that expires within the hour.
 *
 * Lifecycle, in one place:
 *  - Validated before the success transaction; a result over the caps is an
 *    execution failure, so the reservation is released and nothing is charged.
 *  - Inserted inside the success transaction, alongside the completed status
 *    and the capture. A file write that fails rolls the capture back.
 *  - Listed in `provenance.output_files` (name, type, size, sha256), which is
 *    inside the integrity-hash payload, so the chain covers the bytes.
 *  - Served while the transaction is neither redacted nor deleted.
 *  - Deleted by jobs/async-jobs.ts once its transaction's content is redacted
 *    (the 90-day sweep, a DELETE, account closure) or PII_RETENTION_DAYS after
 *    creation, whichever is first, unless the transaction is on legal hold.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";

import { jobFiles, transactions } from "../../db/schema.js";
import { deriveSubkey } from "../audit-token.js";
import { PII_RETENTION_DAYS } from "../data-retention.js";

/** Largest single file. Postgres holds the bytes, so this stays modest. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Largest total per execution. */
export const MAX_TOTAL_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_JOB = 10;
/** How long a minted download URL works. Every poll mints a fresh one. */
export const FILE_URL_TTL_SECONDS = 60 * 60;

/** What an executor may return under `files`. */
export interface CapabilityFile {
  name: string;
  content_type: string;
  data: Buffer | Uint8Array;
}

/** The public description of a stored file; no bytes, no URL. */
export interface OutputFileManifestEntry {
  file_id: string;
  name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
}

export interface PreparedFile extends OutputFileManifestEntry {
  data: Buffer;
}

/** A file result Strale will not store. Classified as an execution failure. */
export class FileOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileOutputError";
  }
}

const CONTENT_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,127}$/i;

/** A download filename: no path, no control characters, bounded. */
export function sanitizeFileName(name: unknown): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(0, 128);
  return cleaned || "file";
}

/**
 * Validate an executor's `files` and compute their manifest. Throws
 * FileOutputError on anything over the caps or malformed; returns [] when the
 * executor returned none.
 */
export function prepareFiles(files: unknown): PreparedFile[] {
  if (files === undefined || files === null) return [];
  if (!Array.isArray(files)) throw new FileOutputError("Capability returned 'files' that is not an array.");
  if (files.length > MAX_FILES_PER_JOB) {
    throw new FileOutputError(`Capability returned ${files.length} files; the limit is ${MAX_FILES_PER_JOB}.`);
  }
  let total = 0;
  return files.map((f: Partial<CapabilityFile>) => {
    if (!f || !(f.data instanceof Uint8Array)) {
      throw new FileOutputError("Capability returned a file without binary data.");
    }
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data);
    if (data.length > MAX_FILE_BYTES) {
      throw new FileOutputError(`Capability returned a ${data.length}-byte file; the limit is ${MAX_FILE_BYTES} bytes.`);
    }
    total += data.length;
    if (total > MAX_TOTAL_FILE_BYTES) {
      throw new FileOutputError(`Capability returned ${total}+ bytes of files; the limit is ${MAX_TOTAL_FILE_BYTES} bytes per job.`);
    }
    const contentType = typeof f.content_type === "string" && CONTENT_TYPE.test(f.content_type)
      ? f.content_type.toLowerCase()
      : "application/octet-stream";
    return {
      file_id: randomUUID(),
      name: sanitizeFileName(f.name),
      content_type: contentType,
      size_bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
      data,
    };
  });
}

export function manifestOf(files: PreparedFile[]): OutputFileManifestEntry[] {
  return files.map(({ data: _data, ...entry }) => entry);
}

/** Insert prepared files. Call inside the success transaction. */
export async function insertJobFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a db or a transaction
  tx: { insert: (...args: any[]) => any },
  files: PreparedFile[],
  owner: { transactionId: string; userId: string },
): Promise<void> {
  if (files.length === 0) return;
  await tx.insert(jobFiles).values(files.map((f) => ({
    id: f.file_id,
    transactionId: owner.transactionId,
    userId: owner.userId,
    name: f.name,
    contentType: f.content_type,
    sizeBytes: f.size_bytes,
    sha256: f.sha256,
    data: f.data,
  })));
}

// ─── Signed URLs ────────────────────────────────────────────────────────────

/** Absolute origin for minted file links. */
export function apiOrigin(): string {
  return (process.env.API_BASE_URL ?? "https://api.strale.io").replace(/\/$/, "");
}

let urlKey: Buffer | null = null;
function fileUrlKey(): Buffer {
  return (urlKey ??= deriveSubkey("job-file-url/v1"));
}

function signature(fileId: string, expiresAt: number, key: Buffer): string {
  return createHmac("sha256", key).update(`${fileId}:${expiresAt}`).digest("hex");
}

/** A relative URL; the caller prefixes the API origin. */
export function signFileUrl(
  fileId: string,
  nowMs: number = Date.now(),
  ttlSeconds: number = FILE_URL_TTL_SECONDS,
): { url: string; expiresAt: string } {
  const expires = Math.floor(nowMs / 1000) + ttlSeconds;
  const sig = signature(fileId, expires, fileUrlKey());
  return {
    url: `/v1/files/${fileId}?expires=${expires}&sig=${sig}`,
    expiresAt: new Date(expires * 1000).toISOString(),
  };
}

export type FileUrlCheck = "ok" | "expired" | "invalid";

export function verifyFileUrl(
  fileId: string,
  expires: string | undefined,
  sig: string | undefined,
  nowMs: number = Date.now(),
): FileUrlCheck {
  if (!expires || !sig || !/^\d{1,12}$/.test(expires) || !/^[0-9a-f]{64}$/.test(sig)) return "invalid";
  const expected = Buffer.from(signature(fileId, Number(expires), fileUrlKey()), "hex");
  const given = Buffer.from(sig, "hex");
  if (!timingSafeEqual(expected, given)) return "invalid";
  // Checked after the signature, so an expiry answer is never given for a
  // forged URL.
  if (Number(expires) * 1000 <= nowMs) return "expired";
  return "ok";
}

// ─── Reads ──────────────────────────────────────────────────────────────────

type ReadDb = {
  select: (...args: any[]) => any;
};

/** Files of one transaction, with freshly minted URLs. For the poll response. */
export async function listFilesWithUrls(db: ReadDb, transactionId: string, apiOrigin: string) {
  const rows: Array<{ id: string; name: string; contentType: string; sizeBytes: number; sha256: string }> = await db
    .select({
      id: jobFiles.id,
      name: jobFiles.name,
      contentType: jobFiles.contentType,
      sizeBytes: jobFiles.sizeBytes,
      sha256: jobFiles.sha256,
    })
    .from(jobFiles)
    .where(eq(jobFiles.transactionId, transactionId))
    .orderBy(jobFiles.createdAt, jobFiles.name);
  return rows.map((r) => {
    const signed = signFileUrl(r.id);
    return {
      file_id: r.id,
      name: r.name,
      content_type: r.contentType,
      size_bytes: r.sizeBytes,
      sha256: r.sha256,
      url: `${apiOrigin}${signed.url}`,
      url_expires_at: signed.expiresAt,
    };
  });
}

/**
 * The bytes of a file, or null when it is gone or its transaction's content
 * is no longer servable (redacted or deleted). The purge removes such rows on
 * its next tick; this check makes the download stop immediately.
 */
export async function readServableFile(db: ReadDb, fileId: string) {
  const [row] = await db
    .select({
      name: jobFiles.name,
      contentType: jobFiles.contentType,
      sha256: jobFiles.sha256,
      data: jobFiles.data,
    })
    .from(jobFiles)
    .innerJoin(transactions, eq(transactions.id, jobFiles.transactionId))
    .where(and(
      eq(jobFiles.id, fileId),
      isNull(transactions.redactedAt),
      isNull(transactions.deletedAt),
      // Past the content window a file is gone even if the daily sweep has not
      // reached its transaction yet; legal hold keeps it, as it keeps content.
      sql`(${jobFiles.createdAt} > now() - make_interval(days => ${PII_RETENTION_DAYS}) OR ${transactions.legalHold})`,
    ))
    .limit(1);
  return (row as { name: string; contentType: string; sha256: string; data: Buffer } | undefined) ?? null;
}
