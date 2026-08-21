/**
 * WP4 bypass guard: no rail may decide billability on its own.
 *
 * WP2 shipped the same shape for wallet mutations and it earned its keep — it
 * caught a runbook telling an operator to run bare `UPDATE wallets`. The failure
 * this one guards against is quieter and was live for months: five rails each
 * answered "may we charge for this?" with their own predicate, and two of them
 * disagreed about a gated solution. Nobody chose that. It accumulated.
 *
 * A unit test proves the shared function is right today. Only a guard keeps a
 * sixth answer from appearing next quarter.
 *
 * Two checks, deliberately different in kind:
 *
 *   1. A denylist of the specific predicates WP4 retired. Precise, zero false
 *      positives, and catches a literal revert.
 *   2. A shape check: in a rail file, an identifier that names a billing
 *      decision must be assigned from the canonical module. Catches the case
 *      the denylist cannot — a NEW predicate under a NEW name.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname, "..");

/**
 * The files that move money. A rail added later and not listed here is the
 * obvious hole, so the list is asserted against the settlement/debit call sites
 * rather than maintained by hand — see the last test.
 */
const RAIL_FILES = [
  "routes/do.ts",
  "routes/solution-execute.ts",
  "routes/x402-gateway-v2.ts",
];

const CANONICAL = "lib/execution-outcome.ts";

function read(rel: string): string {
  return readFileSync(join(API_SRC, rel), "utf8");
}

/** Strip comments so prose describing a retired predicate is not a violation. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("no rail decides billability on its own", () => {
  it.each(RAIL_FILES)("%s reads the canonical outcome", (rel) => {
    expect(read(rel)).toMatch(/from "\.\.\/lib\/execution-outcome\.js"/);
  });

  it.each([
    // routes/x402-gateway-v2.ts settled full price on this while the wallet
    // rail refunded — the defect that motivated the package.
    ["anyStepSucceeded", /\banyStepSucceeded\b/],
    // The wallet rail's local rule, now folded into aggregateSolutionOutcome.
    ["refundRequired = allFailed ||", /refundRequired\s*=\s*allFailed\s*\|\|/],
    // The predecessor that counted skipped steps as billable successes.
    ["step_count - errors.length", /step_count\s*-\s*errors\.length/],
  ])("no rail reintroduces `%s`", (_label, pattern) => {
    for (const rel of RAIL_FILES) {
      expect(stripComments(read(rel)), `${rel} reintroduced a retired predicate`)
        .not.toMatch(pattern);
    }
  });

  it("the superseded step predicate is not imported by any rail", () => {
    // isSuccessfulStepOutput still exists and its own suite still pins its
    // behaviour — it is the historical record of the H-1 refinement. It just
    // may not be a billing authority any more.
    for (const rel of RAIL_FILES) {
      expect(read(rel), `${rel} still imports the superseded predicate`)
        .not.toMatch(/\bisSuccessfulStepOutput\b/);
    }
  });

  it("a billing-decision identifier is assigned from the canonical module", () => {
    // The check the denylist cannot do: catch a NEW predicate under a NEW name.
    // Any `const shouldCharge = …` / `let billable = …` in a rail must derive
    // from an ExecutionOutcome, not from a hand-rolled expression.
    const NAMES = /\b(?:const|let|var)\s+(billable|shouldCharge|shouldSettle|shouldRefund|refundRequired|chargeable|isBillable)\s*=\s*([^;]+);/g;
    const CANONICAL_SOURCE = /\boutcome\b|aggregateSolutionOutcome|outcomeFrom|\.billable\b/;

    const violations: string[] = [];
    for (const rel of RAIL_FILES) {
      const src = stripComments(read(rel));
      for (const match of src.matchAll(NAMES)) {
        const [, name, expression] = match;
        if (!CANONICAL_SOURCE.test(expression)) {
          violations.push(`${rel}: \`${name} = ${expression.trim().slice(0, 60)}\``);
        }
      }
    }

    expect(
      violations,
      "a rail computed a billing decision without reading the canonical outcome; " +
        `decide it in ${CANONICAL} instead`,
    ).toEqual([]);
  });

  it("RAIL_FILES still covers every file that settles or debits", () => {
    // The guard's own blind spot: a new rail nobody added to the list above.
    // Rather than trust the list, re-derive it. Money leaves the platform
    // through a wallet debit or an x402 settlement; any file doing either and
    // not listed here is unguarded.
    const MONEY = /walletService\.debit\(|settleX402Payment\(/;
    const candidates = ["routes", "lib", "jobs"].flatMap((dir) =>
      readdirRecursive(join(API_SRC, dir))
        .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
        .filter((f) => MONEY.test(readFileSync(f, "utf8")))
        .map((f) => f.slice(API_SRC.length + 1).replace(/\\/g, "/")),
    );

    // The canonical module and the wallet/reservation authorities themselves
    // move money by definition; they are the authority, not a rail consuming it.
    const EXEMPT = new Set([
      "lib/wallet-service.ts",
      "lib/wallet-reservations.ts",
      "lib/execution-outcome.ts",
      // Defines settleX402Payment. It performs the settlement a rail decides
      // on; it does not decide. WP4 deleted the one function here that DID
      // decide — verifyX402Payment, which settled before execution.
      "lib/x402-gateway.ts",
    ]);

    const unguarded = candidates.filter(
      (f) => !RAIL_FILES.includes(f) && !EXEMPT.has(f),
    );

    expect(
      unguarded,
      "a file debits a wallet or settles x402 but is not covered by this guard",
    ).toEqual([]);
  });
});

function readdirRecursive(dir: string): string[] {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...readdirRecursive(full));
    else out.push(full);
  }
  return out;
}
