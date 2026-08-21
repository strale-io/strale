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
 * ── What the first version of this guard got wrong ──────────────────────────
 *
 * It was green while an entire rail was unwired. Three holes, all found by
 * adversarial review rather than by the guard itself, all closed below:
 *
 *   1. The import check was FILE-scoped. One handler importing the module
 *      satisfied it, so x402-gateway-v2.ts passed while its capability handler
 *      settled on any resolution 250 lines from the solutions handler that did
 *      the importing. The check is now handler-scoped.
 *   2. The name denylist listed seven identifiers, so `const mustRefund = …`
 *      walked past it — and its "canonical source" test was satisfied by the
 *      bare substring `outcome`, so `const refundRequired = outcome ? local : true`
 *      passed too.
 *   3. The "derived" rail list did not derive the rails. Its regex matched
 *      `walletService.debit(` and `settleX402Payment(`, neither of which
 *      appears in routes/solution-execute.ts — that rail moves money through
 *      `reservations.reserve/capture/release`, one indirection inside the
 *      exempt wallet-reservations.ts. The list it claimed to derive was in
 *      fact hand-maintained.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const API_SRC = join(import.meta.dirname, "..");

const RAIL_FILES = [
  "routes/do.ts",
  "routes/solution-execute.ts",
  "routes/x402-gateway-v2.ts",
];

const CANONICAL = "lib/execution-outcome.ts";

/**
 * Money leaves the platform through one of these.
 *
 * Note `reservations.capture(` rather than `reserve(`. A WP3 reservation is
 * PROVISIONAL by design — reserve happens before execution, and the decision to
 * keep the money is capture. Keying on reserve flagged `executeAsync`, which
 * reserves in one function and assesses in the background executor, which is
 * the architecture working rather than a defect.
 */
const MOVES_MONEY =
  /walletService\.debit\(|\bdebit\(|settleX402Payment\(|reservations\.capture\(/;

/** Evidence that the enclosing handler asked the canonical module first. */
const CONSULTS_BILLABILITY =
  /assertBillableOutput\(|\.billable\b|aggregateSolutionOutcome\(|outcomeFrom\w*\(/;

function read(rel: string): string {
  return readFileSync(join(API_SRC, rel), "utf8");
}

/** Strip comments so prose describing a retired predicate is not a violation. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Split a source file into handler-sized regions.
 *
 * Deliberately crude — a top-level function, route registration, or arrow
 * binding starts a new region. It only has to be fine-grained enough that a
 * money call and its billability consult must be neighbours, which is the
 * property a file-level check cannot express at all.
 */
function handlerRegions(
  src: string,
): Array<{ name: string; line: number; body: string }> {
  const lines = src.split("\n");
  const BOUNDARY =
    /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(|^\w+\.(?:on|post|get|put|all)\(/;

  const regions: Array<{ name: string; line: number; body: string }> = [];
  let current = { name: "<module>", line: 1, body: [] as string[] };

  lines.forEach((line, i) => {
    const m = BOUNDARY.exec(line);
    if (m) {
      regions.push({ ...current, body: current.body.join("\n") });
      current = {
        name: m[1] ?? m[2] ?? line.trim().slice(0, 40),
        line: i + 1,
        body: [],
      };
    }
    current.body.push(line);
  });
  regions.push({ ...current, body: current.body.join("\n") });
  return regions;
}

function readdirRecursive(dir: string): string[] {
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

describe("no rail decides billability on its own", () => {
  it.each(RAIL_FILES)("%s reads the canonical outcome", (rel) => {
    expect(read(rel)).toMatch(/from "\.\.\/lib\/execution-outcome\.js"/);
  });

  it.each(RAIL_FILES)(
    "%s consults billability in EVERY handler that moves money",
    (rel) => {
      // Hole 1. This is the assertion that would have caught an entire rail
      // being left unwired, which the file-level check above cannot.
      const violations = handlerRegions(stripComments(read(rel)))
        .filter((region) => MOVES_MONEY.test(region.body))
        .filter((region) => !CONSULTS_BILLABILITY.test(region.body))
        .map((region) => `${rel}:${region.line} (${region.name})`);

      expect(
        violations,
        `a handler moves money without consulting the canonical outcome; decide it in ${CANONICAL}`,
      ).toEqual([]);
    },
  );

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
    // Hole 2. Widened from a seven-name list that `const mustRefund = …` or
    // `const noCharge = …` walked straight past: ANY identifier whose name is
    // about charging, billing, refunding or settling.
    const NAMES =
      /\b(?:const|let|var)\s+(\w*(?:[Bb]illable|[Cc]harge|[Rr]efund|[Ss]ettle)\w*)\s*=\s*([^;]+);/g;
    // And tightened: the bare substring `outcome` used to satisfy this, so
    // `const refundRequired = outcome ? localPredicate : true;` passed while
    // reintroducing the defect. The expression must actually READ the decision.
    const CANONICAL_SOURCE =
      /\.billable\b|aggregateSolutionOutcome\(|outcomeFrom\w*\(|assertBillableOutput\(/;

    const violations: string[] = [];
    for (const rel of RAIL_FILES) {
      const src = stripComments(read(rel));

      // Names already shown to derive from the canonical outcome. A decision
      // may be computed in steps — `refundRequired = !outcome.billable` and
      // then `chargedPrice = refundRequired ? 0 : price` — and the second step
      // is validated by the first. Without this the guard demands every
      // downstream expression re-read `.billable`, which is noise, not safety.
      const derived = new Set<string>();

      for (const match of src.matchAll(NAMES)) {
        const [, name, expression] = match;

        // `const settled = await settleX402Payment(…)` holds the RESULT of
        // moving money, not a decision about whether to. Matching it conflates
        // the act with the choice.
        if (MOVES_MONEY.test(expression)) continue;

        const derivesFromValidated = [...derived].some((d) =>
          new RegExp(`\\b${d}\\b`).test(expression),
        );

        if (CANONICAL_SOURCE.test(expression) || derivesFromValidated) {
          derived.add(name);
          continue;
        }

        violations.push(`${rel}: \`${name} = ${expression.trim().slice(0, 60)}\``);
      }
    }

    expect(
      violations,
      "a rail computed a billing decision without reading the canonical outcome; " +
        `decide it in ${CANONICAL} instead`,
    ).toEqual([]);
  });

  it("RAIL_FILES still covers every file that settles or debits", () => {
    // Hole 3. The original regex matched neither of the ways
    // routes/solution-execute.ts actually moves money, so this "derivation"
    // silently agreed with a hand-written list. It now covers the post-WP3
    // reservation pattern — the natural way a new rail would be built — and a
    // bare `debit(` from a direct import rather than the `walletService.`
    // namespace.
    const MONEY =
      /walletService\.debit\(|\bdebit\(|settleX402Payment\(|reservations\.(reserve|capture|release)\(/;

    const candidates = ["routes", "lib", "jobs"].flatMap((dir) =>
      readdirRecursive(join(API_SRC, dir))
        .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
        .filter((f) => MONEY.test(readFileSync(f, "utf8")))
        .map((f) => f.slice(API_SRC.length + 1).replace(/\\/g, "/")),
    );

    // These MOVE money by definition — they are the authority a rail consumes,
    // not a rail deciding anything.
    const EXEMPT = new Set([
      "lib/wallet-service.ts",
      "lib/wallet-reservations.ts",
      "lib/execution-outcome.ts",
      // Defines settleX402Payment. WP4 deleted the one function here that DID
      // decide — verifyX402Payment, which settled before execution.
      "lib/x402-gateway.ts",
      // The WP3 reconciler releases abandoned reservations. It refunds; it
      // never charges, so there is no billability question for it to answer.
      "jobs/reservation-reconciler.ts",
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
