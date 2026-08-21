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

/** The authority itself, and the schema module that declares the tables. */
const ALLOWED = new Set([
  join("lib", "wallet-service.ts"),
  join("db", "schema.ts"),
]);

/**
 * Drizzle mutation calls against the wallet tables. Deliberately matches the
 * builder entry points rather than trying to parse statements: `update(wallets)`
 * and `insert(walletTransactions)` are the only ways drizzle writes them.
 */
const MUTATION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "update(wallets)", re: /\.update\(\s*wallets\s*\)/ },
  { label: "insert(wallets)", re: /\.insert\(\s*wallets\s*\)/ },
  { label: "delete(wallets)", re: /\.delete\(\s*wallets\s*\)/ },
  { label: "insert(walletTransactions)", re: /\.insert\(\s*walletTransactions\s*\)/ },
  { label: "update(walletTransactions)", re: /\.update\(\s*walletTransactions\s*\)/ },
  // Raw SQL, which would sidestep the builder patterns entirely.
  { label: "raw UPDATE wallets", re: /UPDATE\s+wallets\b/i },
  { label: "raw INSERT INTO wallets", re: /INSERT\s+INTO\s+wallets\b/i },
  { label: "raw INSERT INTO wallet_transactions", re: /INSERT\s+INTO\s+wallet_transactions\b/i },
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

    for (const file of sourceFiles(SRC)) {
      const rel = relative(SRC, file);
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
