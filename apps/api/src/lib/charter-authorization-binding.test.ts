/**
 * The charter's authorization vocabulary must bind to the code, not shadow it.
 *
 * CHARTER.md names three statuses and defers entirely to the production
 * authority model for what "authorized" means. That deferral is the design: a
 * prose authorization model beside a code one is two models to diverge, which
 * is failure family F8. This test is what makes the deferral real rather than
 * polite — every symbol the charter names must exist, and the statuses must map
 * onto the shapes the module actually produces.
 *
 * ── Why this file was rewritten (worth reading before editing it) ───────────
 *
 * Its first version guarded `lib/production-access.ts` and required the charter
 * to name `FOUNDER_GATED_ACTIONS`, `assertFounderGatedWrite` and
 * `GrantVerifier`. Those were the symbols on PR #361's BRANCH. Review
 * reconciled the two competing models and the surviving module is
 * `lib/production-authority.ts`, with a different API — so `production-access
 * .ts` never landed, the "dependency absent" branch stayed selected, and the
 * test went on passing while the charter named four symbols that do not exist.
 *
 * A guard keyed to a filename that never arrives is a guard that reports
 * success for work it never looked at: the hollow-gate family (F5), shipped
 * inside the change that documents F5. The structural fix is below — this file
 * now keys on the CONCEPTS (does the charter name symbols the module actually
 * exports?) rather than on one path, and it imports the module statically so a
 * rename breaks compilation rather than silently disarming the check.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as authority from "./production-authority.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const CHARTER = join(REPO, "docs", "company", "CHARTER.md");
const DAILY_RUN = join(REPO, "docs", "company", "DAILY-RUN.md");

/** The statuses the charter defines. Named here so a rename breaks a test. */
const STATUSES = ["SYSTEM_ACTING", "FOUNDER_DECISION", "AUTHORIZATION_UNAVAILABLE"] as const;

const charter = () => readFileSync(CHARTER, "utf8");
const dailyRun = () => readFileSync(DAILY_RUN, "utf8");

describe("the three statuses are defined once and used consistently", () => {
  it("defines all three in the charter", () => {
    for (const s of STATUSES) {
      expect(charter(), `${s} must be defined in CHARTER.md`).toContain(s);
    }
  });

  it("uses the same three names in the daily-run spec, with no fourth", () => {
    const used = new Set(dailyRun().match(/\b[A-Z][A-Z_]{6,}\b/g) ?? []);
    const statusLike = [...used].filter((w) => STATUSES.includes(w as never)
      || /^(?:SYSTEM|FOUNDER|AUTHORI[SZ]ATION|EXECUTION|BLOCKED|PENDING)_[A-Z_]+$/.test(w));
    for (const w of statusLike) {
      expect(STATUSES, `"${w}" is a status-shaped name the charter does not define`)
        .toContain(w as never);
    }
    for (const s of STATUSES) expect(dailyRun()).toContain(s);
  });

  it("keeps the settled-but-unpermitted status distinct from the judgement one", () => {
    const text = charter();
    expect(text).toMatch(/AUTHORIZATION_UNAVAILABLE[`*\s]* is not a softer/i);
    expect(text, "moving to SYSTEM_ACTING must require the authority, not familiarity")
      .toMatch(/only because the authority actually arrived/i);
  });

  it("states that the settled-but-unpermitted status is never authority to act", () => {
    // The whole point of the third status. If the charter ever softens this,
    // the status becomes a waiting room that a session can talk itself out of.
    expect(charter()).toMatch(/never (?:a licence|authority to act)/i);
  });

  it("excludes anything already executed from the settled-but-unpermitted status", () => {
    // Reporting a completed mutation as pending is the same misreporting as an
    // unapproved execution, pointing the other way (F10 incident 3).
    // `\s+` rather than a literal space: the charter is hard-wrapped, and the
    // first version of this assertion failed only because the sentence it was
    // checking happened to break across a line.
    expect(charter().replace(/\s+/g, " "))
      .toMatch(/already carried out without authority is \*?\*?not\*?\*? ?`?AUTHORIZATION_UNAVAILABLE/i);
  });
});

describe("the charter binds to the authority model that actually landed", () => {
  /**
   * Vocabulary the charter uses in backticks that is deliberately NOT an export
   * of the authority module. Listed explicitly rather than pattern-excluded,
   * because a pattern is how the first version of this check swept the three
   * status names in and then failed on them.
   */
  const NOT_MODULE_EXPORTS = new Set([
    // Our own status vocabulary — names for shapes, not symbols.
    "SYSTEM_ACTING", "FOUNDER_DECISION", "AUTHORIZATION_UNAVAILABLE",
    // Discriminants and fields of the exported `Authority` union, not exports.
    "AUTONOMOUS_POLICY", "FOUNDER_GATED", "kind",
    // A column the charter says does NOT exist. Named so the absence is
    // checkable by a reader; if it is ever created, this entry should go and
    // the charter sentence with it.
    "authority_kind",
    // Decision-queue classes.
    "approval_required", "preauthorized_notice", "your_call",
    // Environment and other modules.
    "DATABASE_URL", "isInternalAccountEmail", "INTERNAL_EMAIL_LIKE_PATTERNS",
    "failed_requests", "translate",
  ]);

  /**
   * Runtime exports the charter must name. Checked against `Object.keys`.
   */
  const REQUIRED_RUNTIME = [
    "AUTONOMOUS_PURPOSES", "autonomousAuthority", "requireFounderGrant",
    "productionWriteUrl", "FOUNDER_GRANT_PUBLIC_KEY_PEM", "assertCannotMintGrants",
  ] as const;

  /**
   * Type-only exports the charter names.
   *
   * These are erased at runtime, so `Object.keys` cannot see them. The obvious
   * fix — a compile-time reference like `type _X = authority.Authority` — is
   * WORTHLESS here and the first version of this file used it anyway while
   * claiming in a comment that "a rename breaks compilation". It does not:
   * test files under `src/lib` are typechecked by no tsconfig project in this
   * repo — `tsconfig.json` excludes test files, and `tsconfig.scripts.json`
   * covers only the scripts and test directories — and vitest transpiles
   * without checking types. Deleting the type would have left every gate green.
   *
   * That is F5 incident 6 — a hollow assertion shipped inside the F5
   * remediation, the second consecutive attempt to get this file right. So the
   * check is done the only way that actually holds here: read the module's
   * source and look for the export.
   */
  const REQUIRED_TYPES = ["Authority"] as const;
  const MODULE_SOURCE = readFileSync(join(HERE, "production-authority.ts"), "utf8");

  it("names the authority model's real symbols", () => {
    for (const n of REQUIRED_RUNTIME) {
      expect(charter(), `CHARTER.md must reference \`${n}\``).toMatch(new RegExp(`\`${n}\\(?\\)?\``));
      expect(Object.keys(authority), `${n} must be exported`).toContain(n);
    }
    for (const n of REQUIRED_TYPES) {
      expect(charter(), `CHARTER.md must reference \`${n}\``).toMatch(new RegExp(`\`${n}\``));
      expect(
        MODULE_SOURCE,
        `${n} must be a type exported by lib/production-authority.ts`,
      ).toMatch(new RegExp(`^export type ${n}\\b`, "m"));
    }
  });

  it("names no symbol the module does not export", () => {
    // The check whose absence let four non-existent symbols sit in the charter
    // for a day. Any backticked identifier that is not documented above as
    // non-module vocabulary must really be exported.
    const named = [...charter().matchAll(/`([A-Za-z_][A-Za-z0-9_]*)\(?\)?`/g)]
      .map((m) => m[1]!)
      // Type-only exports are erased at runtime; they are held instead by the
      // compile-time reference above.
      .filter((n) => !NOT_MODULE_EXPORTS.has(n) && !REQUIRED_TYPES.includes(n as never));
    for (const n of named) {
      expect(
        Object.keys(authority),
        `CHARTER.md names \`${n}\`, which lib/production-authority.ts does not export. ` +
          "Either the charter is describing an authorization model the code does not " +
          "have, or the name belongs in NOT_MODULE_EXPORTS with a reason.",
      ).toContain(n);
    }
  });

  it("no longer carries a pending-reconciliation placeholder", () => {
    expect(
      charter(),
      "the authority model has landed, so the charter must carry the concrete binding",
    ).not.toContain("PENDING RECONCILIATION");
  });

  it("names the module that actually landed, not the one that did not", () => {
    expect(charter()).toContain("production-authority.ts");
    expect(charter(), "production-access.ts was not the module review kept")
      .not.toContain("production-access.ts");
  });
});

describe("the statuses map onto shapes the module can actually produce", () => {
  it("SYSTEM_ACTING corresponds to a delegated purpose the module accepts", () => {
    // Not a doc assertion: build the real Authority value. If AUTONOMOUS_PURPOSES
    // is emptied or the constructor tightens, this fails.
    const purpose = authority.AUTONOMOUS_PURPOSES[0]!;
    const a = authority.autonomousAuthority(purpose, "DEC-20260815-A");
    expect(a.kind).toBe("AUTONOMOUS_POLICY");
    expect(authority.describeAuthority(a).authority_kind).toBe("AUTONOMOUS_POLICY");
  });

  it("a purpose outside the delegated list is refused, not assumed", () => {
    // The charter's claim that anything not delegated is founder-gated BY
    // OMISSION rests on this being fail-closed.
    expect(() =>
      authority.autonomousAuthority("close_stranded_executing_rows" as never, "DEC-20260815-A"),
    ).toThrow(authority.ProductionAuthorityError);
  });

  it("AUTHORIZATION_UNAVAILABLE is the state the module is in right now", () => {
    // While no founder public key is installed, every founder-gated action is
    // refused. That IS the freeze, and the charter says so; this asserts the
    // code agrees rather than trusting the sentence.
    expect(authority.FOUNDER_GRANT_PUBLIC_KEY_PEM.trim()).toBe("");
    expect(() => authority.requireFounderGrant("close_stranded_executing_rows"))
      .toThrow(authority.ProductionAuthorityError);
  });

  it("the legitimate route to a founder-gated authority yields nothing while frozen", () => {
    // Deliberately NOT phrased as "no Authority can be constructed". It can —
    // `Authority` is a structural type and an object literal satisfies it. What
    // is closed is the sanctioned route: requireFounderGrant() returns nothing.
    // The charter says the same, and says which barrier actually does the work.
    let built: unknown = null;
    try {
      built = authority.requireFounderGrant("close_stranded_executing_rows");
    } catch {
      built = null;
    }
    expect(built, "a settled-but-unpermitted action must yield no Authority").toBeNull();
  });

  it("a production write credential cannot be obtained without an Authority", () => {
    expect(() => (authority.productionWriteUrl as (a: unknown) => string)(undefined))
      .toThrow(authority.ProductionAuthorityError);
  });
});
