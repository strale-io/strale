/**
 * Bypass guard for the wallet authority (WP2).
 *
 * Consolidating the ten balance-write sites is only half the package. The
 * refactor-deletion policy is explicit that an authority is incomplete until CI
 * prevents reintroduction — otherwise the eleventh site gets added next month
 * and the invariant quietly stops holding.
 *
 * What this enforces: nothing outside the wallet service writes the `wallets`
 * or `wallet_transactions` tables. Both matter. Writing a balance without its
 * ledger row is the closure bug; writing a ledger row without the balance is
 * the same divergence from the other side.
 *
 * Three write surfaces are covered, and each was added because a real bypass
 * was found on it:
 *   - src/      — the original ten call sites;
 *   - scripts/  — topup-test.ts was mutating balances directly;
 *   - docs/     — the smoke-test runbook told an operator to run bare SQL.
 *
 * Runs as an ordinary unit test so it fails in the normal CI job rather than
 * needing a separate lint step.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const SCRIPTS = fileURLToPath(new URL("../../scripts", import.meta.url));
const CODE_ROOTS = [SRC, SCRIPTS];

/**
 * Runbooks are a write path too — one executed by a human at a psql prompt.
 * Code guards cannot see documentation, so the documentation is scanned too.
 */
const DOCS = fileURLToPath(new URL("../../../../docs", import.meta.url));

/** The authority itself, and the schema module that declares the tables. */
const ALLOWED = new Set([
  join("lib", "wallet-service.ts"),
  join("db", "schema.ts"),
]);

/**
 * Raw SQL that writes a wallet table, allowing `public.` qualification and
 * quoted identifiers. Shared by the code and docs scans so the two cannot
 * drift apart.
 */
const RAW_SQL_WALLET_WRITE =
  /(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+("?public"?\.)?"?(wallets|wallet_transactions)"?\b/i;

/**
 * Ways a wallet table can be written from code.
 *
 * The first version of this list only covered the verbs the codebase happened
 * to use. The gaps — DELETE on either table, UPDATE on wallet_transactions,
 * schema-qualified and quoted identifiers, and the table object interpolated
 * into raw SQL — are why the patterns are now written per verb rather than per
 * known call site.
 */
const MUTATION_PATTERNS: { label: string; re: RegExp }[] = [
  {
    label: "drizzle mutation on a wallet table",
    re: /\.(update|insert|delete)\(\s*(wallets|walletTransactions)\s*\)/,
  },
  { label: "raw SQL mutation on a wallet table", re: RAW_SQL_WALLET_WRITE },
  {
    // sql`UPDATE ${wallets} ...` — neither a builder call nor a literal name.
    label: "wallet table interpolated into raw SQL",
    re: /(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+\$\{\s*(wallets|walletTransactions)/i,
  },
];

function filesUnder(dir: string, ext: RegExp, found: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return found; // the directory is optional from this package's point of view
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      filesUnder(full, ext, found);
    } else if (ext.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("wallet mutation authority", () => {
  it("is the only module that writes wallet tables", () => {
    const offenders: string[] = [];

    for (const root of CODE_ROOTS) {
      // .mjs and .js too: scripts/ holds plain-JS tooling, and a bypass in a
      // .mjs helper is as reachable as one in TypeScript.
      for (const file of filesUnder(root, /\.(ts|mjs|js)$/)) {
        const rel = relative(root, file);
        if (ALLOWED.has(rel)) continue;
        // Tests seed and clean up their own fixtures directly; they are not
        // production paths and blocking them would make the lane unwritable.
        if (rel.includes(".test.ts")) continue;

        const source = readFileSync(file, "utf8");
        for (const { label, re } of MUTATION_PATTERNS) {
          if (re.test(source)) offenders.push(`${rel}: ${label}`);
        }
      }
    }

    // If this fails, the fix is to route the write through
    // src/lib/wallet-service.ts — not to add the file to ALLOWED. The whole
    // point is that there is one place a balance can change.
    expect(offenders).toEqual([]);
  });

  it("is not bypassed by a runbook telling an operator to write SQL", () => {
    const offenders = filesUnder(DOCS, /\.(md|sql)$/i)
      // The remediation ledger quotes these statements while describing the
      // defects. Quoting a bug is not instructing anyone to reproduce it.
      .filter((file) => !file.includes(join("docs", "remediation")))
      .filter((file) => RAW_SQL_WALLET_WRITE.test(readFileSync(file, "utf8")))
      .map((file) => relative(DOCS, file));

    // Route the operator through scripts/topup-test.ts, which uses the service.
    expect(offenders).toEqual([]);
  });

  it("keeps the service itself free of absolute balance assignment", () => {
    // Every mutation must be a delta. An absolute write is what made the
    // solutions refund clobber concurrent debits, and it is the one shape that
    // cannot be made safe by holding a lock alone.
    const service = readFileSync(join(SRC, "lib", "wallet-service.ts"), "utf8");

    // Only inspect what is actually written to the column — the payload of a
    // `.set({ ... })` on an update. Scanning every mention of balanceCents
    // would flag reads and returned values, which say nothing about safety.
    const setPayloads = [...service.matchAll(/\.set\(\{([\s\S]*?)\}\)/g)].map(
      (m) => m[1]!,
    );
    expect(setPayloads.length).toBeGreaterThan(0);

    for (const payload of setPayloads) {
      if (!/balanceCents:/.test(payload)) continue;
      expect(
        /balanceCents:\s*sql`/.test(payload),
        `wallet-service.ts assigns balanceCents without a SQL delta: ${payload.trim()}`,
      ).toBe(true);
    }

    // The opening balance is the one literal, and it must be zero — a wallet
    // that starts non-zero has a balance with no ledger entry behind it.
    const insertPayloads = [
      ...service.matchAll(/\.values\(\{([\s\S]*?)\}\)/g),
    ].map((m) => m[1]!);
    for (const payload of insertPayloads) {
      if (!/balanceCents:/.test(payload)) continue;
      expect(
        /balanceCents:\s*0\b/.test(payload),
        `wallet-service.ts opens a wallet at a non-zero balance: ${payload.trim()}`,
      ).toBe(true);
    }
  });
});
