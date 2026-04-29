import { describe, expect, it } from "vitest";
import { computeIntegrityHash, GENESIS_HASH } from "./integrity-hash.js";

const baseRecord = {
  id: "txn_01HXXXXXXXXXXXXXXXXXXXXXXX",
  userId: "user_01HYYYYYYYYYYYYYYYYYYYYYYY",
  status: "completed",
  input: { name: "Acme Corp", country: "SE" },
  output: { ok: true, match_count: 0 },
  error: null,
  priceCents: 20,
  latencyMs: 437,
  provenance: { source: "dilisense.com", fetched_at: "2026-04-20T12:00:00.000Z" },
  auditTrail: null,
  transparencyMarker: "algorithmic",
  dataJurisdiction: "US",
};

describe("computeIntegrityHash", () => {
  describe("F-AUDIT-12 — date-serialization canonicalization", () => {
    it("hashes Date object and equivalent ISO string identically", () => {
      const isoMs = "2026-04-20T12:00:00.000Z";
      const date = new Date(isoMs);

      const fromDate = computeIntegrityHash(
        { ...baseRecord, createdAt: date, completedAt: date },
        GENESIS_HASH,
      );
      const fromString = computeIntegrityHash(
        { ...baseRecord, createdAt: isoMs, completedAt: isoMs },
        GENESIS_HASH,
      );

      expect(fromDate).toBe(fromString);
    });

    it("hashes ISO with and without milliseconds identically (canonicalizes both to ms form)", () => {
      const noMs = "2026-04-20T12:00:00Z";
      const withMs = "2026-04-20T12:00:00.000Z";

      const a = computeIntegrityHash(
        { ...baseRecord, createdAt: noMs, completedAt: noMs },
        GENESIS_HASH,
      );
      const b = computeIntegrityHash(
        { ...baseRecord, createdAt: withMs, completedAt: withMs },
        GENESIS_HASH,
      );

      expect(a).toBe(b);
    });

    it("hashes timezone-offset and Z-suffixed forms of the same instant identically", () => {
      // Same instant, two representations
      const z = "2026-04-20T12:00:00.000Z";
      const offset = "2026-04-20T14:00:00.000+02:00";

      const a = computeIntegrityHash(
        { ...baseRecord, createdAt: z, completedAt: z },
        GENESIS_HASH,
      );
      const b = computeIntegrityHash(
        { ...baseRecord, createdAt: offset, completedAt: offset },
        GENESIS_HASH,
      );

      expect(a).toBe(b);
    });

    it("treats null completedAt as null (not the string 'null')", () => {
      const hash1 = computeIntegrityHash(
        { ...baseRecord, createdAt: new Date("2026-04-20T12:00:00Z"), completedAt: null },
        GENESIS_HASH,
      );
      const hash2 = computeIntegrityHash(
        { ...baseRecord, createdAt: new Date("2026-04-20T12:00:00Z"), completedAt: null },
        GENESIS_HASH,
      );
      expect(hash1).toBe(hash2);
      // And: the hash must be different when completedAt is set vs null
      const hash3 = computeIntegrityHash(
        {
          ...baseRecord,
          createdAt: new Date("2026-04-20T12:00:00Z"),
          completedAt: new Date("2026-04-20T12:00:01Z"),
        },
        GENESIS_HASH,
      );
      expect(hash1).not.toBe(hash3);
    });

    it("preserves unparseable date strings verbatim (does not silently rewrite)", () => {
      // Garbage input must not be silently converted to a different hash.
      // Two equally-garbage inputs must hash equally; a real ISO must hash differently.
      const garbage = "not-a-date";
      const a = computeIntegrityHash(
        { ...baseRecord, createdAt: garbage, completedAt: null },
        GENESIS_HASH,
      );
      const b = computeIntegrityHash(
        { ...baseRecord, createdAt: garbage, completedAt: null },
        GENESIS_HASH,
      );
      const real = computeIntegrityHash(
        { ...baseRecord, createdAt: "2026-04-20T12:00:00.000Z", completedAt: null },
        GENESIS_HASH,
      );
      expect(a).toBe(b);
      expect(a).not.toBe(real);
    });
  });

  describe("hash determinism", () => {
    it("produces a stable hash for the same input twice in a row", () => {
      const date = new Date("2026-04-20T12:00:00Z");
      const a = computeIntegrityHash({ ...baseRecord, createdAt: date, completedAt: date }, GENESIS_HASH);
      const b = computeIntegrityHash({ ...baseRecord, createdAt: date, completedAt: date }, GENESIS_HASH);
      expect(a).toBe(b);
    });

    it("F-AUDIT-11 regression: empty-string and GENESIS_HASH produce different hashes", () => {
      // This is the divergence that made the auth-gated verify endpoint
      // disagree with the public one + the worker. Both endpoints now use
      // GENESIS_HASH; the test guards that the two values are NOT equivalent
      // and so a future regression to "" would change the hash.
      const date = new Date("2026-04-20T12:00:00Z");
      const withGenesis = computeIntegrityHash(
        { ...baseRecord, createdAt: date, completedAt: date },
        GENESIS_HASH,
      );
      const withEmpty = computeIntegrityHash(
        { ...baseRecord, createdAt: date, completedAt: date },
        "",
      );
      expect(withGenesis).not.toBe(withEmpty);
    });
  });
});
