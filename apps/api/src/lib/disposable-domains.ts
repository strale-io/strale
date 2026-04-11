/**
 * 5,361 disposable email domains — loaded from the community-maintained
 * disposable-email-domains list (github.com/disposable-email-domains).
 *
 * Shared between email-validate capability and agent self-signup (DEC-20260410-A).
 * Updated 2026-04-11 from 28 → 5,361 domains after competitive analysis.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Resolve relative to source directory — works both in dev (src/lib/) and
// production (dist/lib/ → reads from src/lib/ via relative path).
let listPath: string;
try {
  listPath = resolve(import.meta.dirname, "disposable-domains.txt");
  readFileSync(listPath, "utf-8"); // test read
} catch {
  // In compiled mode, import.meta.dirname is dist/lib/ but the txt is in src/lib/
  listPath = resolve(import.meta.dirname, "../../src/lib/disposable-domains.txt");
}

const lines = readFileSync(listPath, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean);

export const DISPOSABLE_DOMAINS = new Set(lines);
