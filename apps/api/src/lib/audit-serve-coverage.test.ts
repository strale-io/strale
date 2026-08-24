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
  "lib/integrity-hash.ts":
    "BUILDS the chain payload. The stored audit body is hashed material, not " +
    "served output -- same reason as verify.ts.",
  "jobs/integrity-hash-retry.ts":
    "the chain worker; hashes the stored body. Redacting would make the hash " +
    "disagree with every verifier.",
  "routes/auth.ts":
    "uses transactions.auditTrail inside a SQL predicate " +
    "(->'request_context'->>'ipHash') to count free-tier usage by IP. Nothing is " +
    "served.",
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

/** Reads a stored audit body: `.auditTrail` off a row, or `audit_trail` off one. */
const READS_STORED_AUDIT = /\.auditTrail\b|\baudit_trail:\s*row\./;

export function classify(
  rel: string,
  source: string,
): "not-a-reader" | "exempt" | "offender" | "redacts" {
  if (!READS_STORED_AUDIT.test(source)) return "not-a-reader";
  if (EXEMPT[rel]) return "exempt";
  return source.includes("redactAuditTrail") ? "redacts" : "offender";
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

    it("does not flag a file that never touches a stored body", () => {
      expect(classify("lib/whatever.ts", "export const x = 1;")).toBe("not-a-reader");
    });

    it("honours an exemption, and only for the exact path", () => {
      expect(classify("routes/audit.ts", "const x = txn.auditTrail;")).toBe("exempt");
      expect(classify("routes/audit2.ts", "const x = txn.auditTrail;")).toBe("offender");
    });
  });
});
