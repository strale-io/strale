/**
 * Domain-separated digests over RFC 8785 bytes (Phase 2, amendment 5).
 *
 *     digest = SHA-256( DOMAIN_TAG || 0x00 || RFC8785(payload) )
 *
 * Bare `SHA-256(canonical_bytes)` would let two different kinds of material
 * collide, and would let a payload valid under one schema be replayed as
 * another. The tag is US-ASCII and contains no NUL, so the separator is
 * unambiguous — no length prefix is needed and none is used.
 *
 * The version lives in the tag as well as inside the receipt body. That is
 * deliberate belt-and-braces: changing the schema changes the preimage even if
 * a caller forgets to bump the `version` member.
 */

import { createHash } from "node:crypto";
import { canonicalBytes } from "./jcs.js";

/**
 * Every domain in the system. Closed on purpose — a new kind of hashed material
 * is a decision, not a string literal someone passes at a call site.
 */
export const DOMAIN_TAGS = {
  /** A `strale.execution.v1` execution receipt payload. */
  executionReceipt: "strale.execution.v1",
  /** A normalized capability/solution declaration snapshot. */
  manifestSnapshot: "strale.manifest-snapshot.v1",
} as const;

export type DomainTag = (typeof DOMAIN_TAGS)[keyof typeof DOMAIN_TAGS];

const NUL = Buffer.from([0x00]);

/** The exact bytes that get hashed. Exported so tests can assert on the preimage. */
export function digestPreimage(domain: DomainTag, payload: unknown): Buffer {
  return Buffer.concat([Buffer.from(domain, "ascii"), NUL, canonicalBytes(payload)]);
}

/** `sha256:<64 lowercase hex>` — the prefixed form that gets persisted. */
export function domainDigest(domain: DomainTag, payload: unknown): string {
  return `sha256:${createHash("sha256").update(digestPreimage(domain, payload)).digest("hex")}`;
}
