/**
 * The integrity claims Petter approved removing stay removed.
 *
 * DQ-18 item 2: unsupported tamper-evidence and downstream-regulatory-
 * verification claims come off every public surface, with **no replacement
 * integrity claim** until one is independently substantiated. The reviewed
 * surface list is `docs/remediation/PUBLIC-COPY-CORRECTION.md`.
 *
 * Why a test and not a note: LESSONS.md F6 (stale or unsupported public claim)
 * is at four incidents with the investigation due, and its stated question is
 * "which public claims have no automated tie to the fact they assert". This is
 * that tie for the withdrawn vocabulary — the claims cannot come back by
 * someone re-typing a sentence that reads well.
 *
 * Scope, deliberately narrow: this asserts the *absence* of withdrawn wording
 * on the surfaces that serve it. It does not attempt to judge new wording —
 * inventing a replacement claim is founder-gated (CHARTER.md § Act first,
 * "narrowing only"), so a guard that approved replacements would be claiming
 * an authority this side does not have.
 *
 * F5 note: the empty-input failure mode this file has to avoid is a path that
 * silently stops existing, leaving the scan clean because it read nothing. Each
 * surface is therefore asserted to exist and to be non-empty before it is
 * scanned, and the phrase list is asserted non-empty.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");

/** Surfaces that serve public prose. Paths are repo-relative. */
const SURFACES = [
  "apps/api/src/routes/llms-txt.ts",
  "apps/api/src/routes/mcp-server-card.ts",
  "apps/api/src/routes/a2a.ts",
  "apps/api/src/openapi.ts",
  "apps/api/src/web3-assurance/methodology.ts",
  "packages/mcp-server/src/tools.ts",
  "README.md",
  "docs/x402-listing.md",
  "docs/dpia/sanctions-and-pep-check.md",
  "docs/dpia/adverse-media-check.md",
];

/**
 * The withdrawn vocabulary, as regexes over the served text.
 *
 * Each entry is a phrasing we actually published, not a guess at the space of
 * things someone might write — the same principle `populations.ts` applies to
 * monitor signatures. A phrasing nobody has produced is unguarded, and that
 * limit is real rather than hedged away.
 */
const WITHDRAWN: { pattern: RegExp; why: string }[] = [
  { pattern: /tamper[-\s]?evident/i, why: "not defensible for ordering or deletion (2026-05-04 → 2026-08-21)" },
  { pattern: /cryptographic(ally)?[-\s]chain[-\s]?hash/i, why: "withdrawn integrity claim" },
  { pattern: /chain[-\s]?hashed audit record/i, why: "withdrawn integrity claim" },
  { pattern: /audit record with cryptographic chain hashing/i, why: "withdrawn integrity claim" },
  { pattern: /downstream regulatory verification/i, why: "asserts fitness for regulatory use, not a mechanism" },
  { pattern: /backward to genesis/i, why: "the verifier is depth-capped and always truncates" },
  { pattern: /replay[_\s]capability/i, why: "impossible after the 90-day content redaction" },
  { pattern: /\bimmutable transaction record\b/i, why: "records are redacted at 90 days by design" },
];

describe("withdrawn integrity claims stay withdrawn", () => {
  it("has a non-empty surface list and phrase list", () => {
    expect(SURFACES.length).toBeGreaterThan(0);
    expect(WITHDRAWN.length).toBeGreaterThan(0);
  });

  it.each(SURFACES)("%s exists and is readable", (rel) => {
    const abs = resolve(repoRoot, rel);
    expect(existsSync(abs), `${rel} is missing — the scan below would pass by reading nothing`).toBe(true);
    expect(readFileSync(abs, "utf8").length).toBeGreaterThan(0);
  });

  it.each(SURFACES)("%s carries no withdrawn claim", (rel) => {
    const text = readFileSync(resolve(repoRoot, rel), "utf8");
    const hits = WITHDRAWN.filter((w) => w.pattern.test(text))
      .map((w) => `${w.pattern} — ${w.why}`);
    expect(hits, `${rel} re-introduced a withdrawn integrity claim:\n  ${hits.join("\n  ")}`).toEqual([]);
  });
});
