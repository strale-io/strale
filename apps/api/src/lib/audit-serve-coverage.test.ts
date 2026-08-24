/**
 * Every surface that serves a STORED audit body must redact it.
 *
 * The first cut of this fix covered `GET /v1/transactions/:id` and stopped
 * there, on the strength of a grep. A reviewer found two more: both
 * idempotency-replay paths hand back `existing.auditTrail` / `prior.auditTrail`
 * — a stored body, which for any row written before the sanitising write is
 * raw. That is precisely the "a serve-time filter has to be remembered at each
 * site" failure, and remembering is not a control.
 *
 * So the rule is checked instead of remembered. Fail-closed: a file that reads
 * a stored `auditTrail` and serves it must call `redactAuditTrail`, or say in
 * the exemption map why it does not.
 *
 * The write side (`buildFailureAudit` sanitising) is the real authority and
 * makes all of this a no-op for new rows. This exists for the rows already
 * written, which cannot be rewritten — `audit_trail` is inside the
 * integrity-chain payload, so editing one would invalidate its hash.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..");

/**
 * Files that read a stored audit body and legitimately do not redact it.
 * Key: path relative to `src/`, forward slashes.
 */
const EXEMPT: Record<string, string> = {
  "routes/audit.ts":
    "reads the stored body only through extractStoredStepLatencies, which pulls " +
    "step timings and never echoes error text. composeAuditRecord builds its own " +
    "record; the stored audit_trail is not passed through to the response.",
  "routes/verify.ts":
    "feeds the stored body into the INTEGRITY-HASH RECOMPUTATION. It must be the " +
    "bytes as stored, verbatim -- redacting here would change the hash input and " +
    "make every row fail verification. The single most important exemption in " +
    "this map, and the reason the rule is 'redact what you SERVE', not 'redact " +
    "every read'.",
  "routes/admin.ts":
    "reaches into audit_trail->'request_context' subfields inside SQL text " +
    "(userAgent, mcpClient, referer, ipHash) for an internal traffic view. The " +
    "body is never selected or served, and the error message is never read.",
  "lib/account-closure.ts":
    "names transactions.audit_trail as a retention-rule key and enumerates its " +
    "keys in SQL to report what erasure cleared. Nothing is served.",
  "lib/startup-migrations.ts":
    "a trigger body that NULLs audit_trail on redaction. A write, not a read.",
  "lib/integrity-hash.ts":
    "BUILDS the chain payload. The stored audit body is hashed material, not " +
    "served output -- same reason as verify.ts.",
  "jobs/integrity-hash-retry.ts":
    "the chain worker; hashes the stored body. Redacting would make the hash " +
    "disagree with every verifier.",
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, acc);
    } else if (entry.endsWith(".ts")) acc.push(full);
  }
  return acc;
}

const isTest = (p: string) => /\.(test|spec)\.ts$/.test(p) || p.includes("test-support");

/**
 * A stored audit body being read off a row: `row.auditTrail`, `prior.auditTrail`,
 * or served as `audit_trail: row.audit_trail`. Broad on purpose: a narrower
 * pattern missed the very file the fix started in. Files that only touch the
 * column inside SQL text are handled by the exemption map, which forces the
 * reason to be written down.
 *
 * `transactions.auditTrail` is excluded because that is the drizzle COLUMN
 * reference in a select, not a value. Bare `t.audit_trail->'...'` inside SQL
 * text is not matched either: admin.ts, account-closure.ts and the startup
 * migrations reach into request_context subfields that way and never serve
 * the body.
 */
const STORED_AUDIT_READ = /\b(\w+)\.(?:auditTrail|audit_trail)\b/g;
const DRIZZLE_TABLE = "transactions";

/**
 * OCCURRENCE-granular, not file-granular.
 *
 * The first version asked whether the file contained `redactAuditTrail`
 * anywhere. The mutation battery walked straight through it: removing the call
 * at a replay site left the import behind, so the file still "contained" the
 * word and the lint stayed green. A guard that a one-line revert defeats is
 * not a guard.
 *
 * Every read is now checked individually — it must be the argument of a
 * `redactAuditTrail(` call.
 */
export function classify(
  rel: string,
  source: string,
): "not-a-reader" | "exempt" | "offender" | "redacts" {
  const reads = [...source.matchAll(STORED_AUDIT_READ)].filter(
    (m) => (m[1] ?? m[2]) !== DRIZZLE_TABLE,
  );
  if (reads.length === 0) return "not-a-reader";
  if (EXEMPT[rel]) return "exempt";

  for (const m of reads) {
    const before = source.slice(Math.max(0, m.index! - 20), m.index!);
    if (!before.endsWith("redactAuditTrail(")) return "offender";
  }
  return "redacts";
}

describe("stored audit bodies are redacted wherever they are served", () => {
  const offenders: string[] = [];
  const seenExempt = new Set<string>();
  const readers: string[] = [];

  for (const abs of walk(SRC)) {
    if (isTest(abs)) continue;
    const rel = abs.slice(SRC.length + 1).split("\\").join("/");
    const source = readFileSync(abs, "utf8");
    const verdict = classify(rel, source);
    if (verdict === "not-a-reader") continue;
    readers.push(rel);
    if (verdict === "exempt") seenExempt.add(rel);
    if (verdict === "offender") offenders.push(rel);
  }

  it("every file that serves a stored audit body redacts it, or is exempt", () => {
    expect(
      offenders,
      "These read a stored audit_trail and never call redactAuditTrail. Either " +
        "redact it, or add it to EXEMPT with the reason it cannot leak:\n" +
        offenders.map((o) => `  - ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("every exemption still corresponds to a file that reads one", () => {
    const stale = Object.keys(EXEMPT).filter((k) => !seenExempt.has(k));
    expect(stale, `Stale exemptions: ${stale.join(", ")}`).toEqual([]);
  });

  it("found the surfaces we know about, so it cannot pass vacuously", () => {
    // The two replay paths are named explicitly because they are the ones a
    // grep for `audit_trail:` missed.
    for (const expected of [
      "routes/transactions.ts",
      "routes/do.ts",
      "routes/solution-execute.ts",
      "routes/audit.ts",
    ]) {
      expect(readers, `${expected} was not scanned; the file walk is broken`).toContain(expected);
    }
  });

  describe("the rule itself, on inputs we control", () => {
    // Without these the lint proves only that the repository is currently
    // clean — which it would also "prove" if the detection did nothing.
    it("flags a file that serves a stored body without redacting", () => {
      expect(classify("routes/new.ts", "return c.json({ audit: row.auditTrail });")).toBe(
        "offender",
      );
    });

    it("flags the snake_case serve shape too", () => {
      expect(classify("routes/new.ts", "audit_trail: row.audit_trail,")).toBe("offender");
    });

    it("does not flag a file that redacts", () => {
      expect(
        classify("routes/new.ts", "return c.json({ audit: redactAuditTrail(row.auditTrail) });"),
      ).toBe("redacts");
    });

    it("FLAGS A FILE WITH ONE WRAPPED READ AND ONE BARE ONE", () => {
      // The case that separates occurrence-granular from file-granular, and
      // it was missing — so reverting this file's own reason for existing
      // (`before.endsWith("redactAuditTrail(")` back to
      // `source.includes("redactAuditTrail")`) passed all eight tests.
      // Reviewer-found. Every other case here has a single read, where the two
      // rules are indistinguishable.
      expect(
        classify(
          "routes/new.ts",
          "const a = redactAuditTrail(row.auditTrail); const b = other.auditTrail;",
        ),
      ).toBe("offender");
    });

    it("does not flag a file that never touches a stored body", () => {
      expect(classify("lib/whatever.ts", "export const x = 1;")).toBe("not-a-reader");
    });

    it("honours an exemption, and only for the exact path", () => {
      expect(classify("routes/audit.ts", "const x = txn.auditTrail;")).toBe("exempt");
      expect(classify("routes/audit2.ts", "const x = txn.auditTrail;")).toBe("offender");
    });
  });
});
