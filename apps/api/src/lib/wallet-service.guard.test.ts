/**
 * Bypass guard for the wallet authority (WP2).
 *
 * Consolidating the ten balance-write sites is only half the package. The
 * refactor-deletion policy is explicit that an authority is incomplete until CI
 * prevents reintroduction — otherwise the eleventh site gets added next month
 * and the invariant quietly stops holding.
 *
 * What this enforces: no module other than the wallet service may write to the
 * `wallets` or `wallet_transactions` tables. Both matter. Writing a balance
 * without its ledger row is the closure bug; writing a ledger row without the
 * balance is the same divergence from the other side.
 *
 * Runs as an ordinary unit test so it fails in the normal CI job rather than
 * needing a separate lint step.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));
/**
 * Scripts are production write paths too. The first version of this guard
 * scanned only src/, and scripts/topup-test.ts was mutating balances directly
 * the whole time — Codex found it, and it is why the roots list exists.
 */
const SCRIPTS = fileURLToPath(new URL("../../scripts", import.meta.url));
const ROOTS = [SRC, SCRIPTS];

/** The authority itself, and the schema module that declares the tables. */
const ALLOWED = new Set([
  join("lib", "wallet-service.ts"),
  join("db", "schema.ts"),
]);

/**
 * Ways a wallet table can be written.
 *
 * The first version of this list only covered the verbs the codebase happened
 * to use. Codex pointed out the gaps — DELETE on either table, UPDATE on
 * wallet_transactions, schema-qualified and quoted identifiers, and the table
 * object interpolated into raw SQL — so the patterns are now written per verb
 * rather than per known call site.
 */
const MUTATION_PATTERNS: { label: string; re: RegExp }[] = [
  // Drizzle builders: any mutating verb against either table.
  {
    label: "drizzle mutation on a wallet table",
    re: /\.(update|insert|delete)\(\s*(wallets|walletTransactions)\s*\)/,
  },
  // Raw SQL, allowing `public.` qualification and quoted identifiers.
  {
    label: "raw SQL mutation on a wallet table",
    re: /(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+(public\.)?"?(wallets|wallet_transactions)"?\b/i,
  },
  // The table object interpolated into a template — sql`UPDATE ${wallets} ...`
  // — which is neither a builder call nor a literal table name.
  {
    label: "wallet table interpolated into raw SQL",
    re: /(UPDATE|DELETE\s+FROM|INSERT\s+INTO)\s+\$\{\s*(wallets|walletTransactions)/i,
  },
];

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, found);
    } else if (entry.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

describe("wallet mutation authority", () => {
  it("is the only module that writes wallet tables", () => {
    const offenders: string[] = [];

    const files = ROOTS.flatMap((root) =>
      sourceFiles(root).map((full) => ({ full, root })),
    );

    for (const { full: file, root } of files) {
      const rel = relative(root, file);
      if (ALLOWED.has(rel)) continue;
      // Tests seed and clean up their own fixtures directly; they are not
      // production paths and blocking them would make the lane unwritable.
      if (rel.includes(".test.ts")) continue;

      const source = readFileSync(file, "utf8");
      for (const { label, re } of MUTATION_PATTERNS) {
        if (re.test(source)) {
          offenders.push(`${rel}: ${label}`);
        }
      }
    }

    // If this fails, the fix is to route the write through
    // src/lib/wallet-service.ts — not to add the file to ALLOWED. The whole
    // point is that there is one place a balance can change.
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
