/**
 * The charter's authorization vocabulary must bind to the code, not shadow it.
 *
 * CHARTER.md names three statuses and, for the one that means "settled but not
 * permitted", defers entirely to `lib/production-access.ts` for what
 * "authorized" means. That deferral is the whole design: a prose authorization
 * model beside a code one is two models to diverge, which is failure family F8
 * and the reason the daily-run documents exist at all.
 *
 * This test is the mechanism that makes the deferral real rather than polite.
 * It is deliberately written so that it **always asserts something** — the
 * hollow-gate family (F5) is a check that passes by doing nothing, and a test
 * that merely skipped while the module was absent would be exactly that:
 *
 *   module absent  → assert the charter still carries its PENDING RECONCILIATION
 *                    block, so an unlanded dependency cannot be forgotten
 *   module present → assert the binding is real: the pending block is gone, and
 *                    every founder-reserved action the operating documents name
 *                    is a member of FOUNDER_GATED_ACTIONS
 *
 * The flip is automatic. Landing the authorization boundary turns this from a
 * reminder into a conformance check without anybody remembering to convert it,
 * and it fails in the window between the module arriving and the charter being
 * reconciled — which is the window where the two models would silently diverge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const CHARTER = join(REPO, "docs", "company", "CHARTER.md");
const DAILY_RUN = join(REPO, "docs", "company", "DAILY-RUN.md");
const PRODUCTION_ACCESS = join(HERE, "production-access.ts");

const PENDING_MARKER = "PENDING RECONCILIATION";

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
    // The distinction is the point of the third status. If the charter ever
    // describes them as interchangeable, the status stops carrying information.
    const text = charter();
    // Markdown emphasis may wrap the token, so allow backticks/asterisks between.
    expect(text).toMatch(/AUTHORIZATION_UNAVAILABLE[`*\s]* is not a softer/i);
    expect(text, "moving to SYSTEM_ACTING must require the authority, not familiarity")
      .toMatch(/only because the authority actually arrived/i);
  });
});

describe("the charter defers to the code for what 'authorized' means", () => {
  it("names the code symbols rather than restating a model in prose", () => {
    const text = charter();
    for (const symbol of [
      "FOUNDER_GATED_ACTIONS",
      "assertFounderGatedWrite",
      "GrantVerifier",
      "production-access.ts",
    ]) {
      expect(text, `the charter must reference ${symbol}`).toContain(symbol);
    }
  });

  if (!existsSync(PRODUCTION_ACCESS)) {
    // The dependency has not landed. Assert the charter says so, loudly and in
    // the file itself, so the incompleteness is visible to a reader of the
    // charter rather than only to a reader of this test.
    it("records the unlanded dependency instead of pretending the binding exists", () => {
      const text = charter();
      expect(text, "an unlanded authorization model must be marked pending")
        .toContain(PENDING_MARKER);
      expect(text, "the pending block must name what it is waiting for")
        .toMatch(/production-authority\.ts/);
      expect(text, "and must forbid resolving it with more prose")
        .toMatch(/do not resolve this by writing more prose/i);
    });
  } else {
    // The dependency landed. The pending block must be gone and the binding real.
    it("has replaced the pending block with a concrete binding", () => {
      expect(
        charter(),
        "production-access.ts exists, so CHARTER.md's PENDING RECONCILIATION block " +
          "must be replaced by the real binding — see the block's own instructions",
      ).not.toContain(PENDING_MARKER);
    });

    it("names only actions that are members of FOUNDER_GATED_ACTIONS", async () => {
      const { FOUNDER_GATED_ACTIONS } = await import("./production-access.js");
      const named = new Set(
        [...charter().matchAll(/`([a-z][a-z0-9]*(?:-[a-z0-9]+)+)`/g)].map((m) => m[1]!),
      );
      // Only kebab-case tokens that LOOK like gated actions are checked: a
      // charter mentioning `read-only` should not be forced into the enum.
      const actionLike = [...named].filter((n) =>
        /^(?:close|issue|reverse|deactivate|edit|bulk)-/.test(n));
      for (const n of actionLike) {
        expect(
          FOUNDER_GATED_ACTIONS as readonly string[],
          `CHARTER.md names "${n}" as a founder-reserved action, but it is not in ` +
            "FOUNDER_GATED_ACTIONS. Add it to the enum or stop naming it as one.",
        ).toContain(n);
      }
    });
  }
});
