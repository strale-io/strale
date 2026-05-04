/**
 * Sanity check: CLAUDE.md must list every always-enforce protocol DEC by ID.
 *
 * Per DEC-20260504-A this file is documentation-only (no new code path), so
 * no behavioural regression test is required. But the protocols are only
 * enforced if Claude Code can find them in CLAUDE.md at session start. If a
 * future edit drops a DEC ID by accident (rebase conflict, file rewrite),
 * this test fails and forces the author to notice.
 *
 * Add the new DEC ID here when a new always-enforce protocol lands.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLAUDE_MD_PATH = resolve(__dirname, "../../../../CLAUDE.md");

const REQUIRED_DEC_IDS = [
  "DEC-20260320-B", // Capability Onboarding Protocol
  "DEC-20260422-A", // Distribution PR Integrity Protocol
  "DEC-20260504-A", // Audit-Follow-up Test Coverage Protocol
  "DEC-20260504-B", // Bulk-Operation Deploy Protocol
  "DEC-20260504-C", // Deploy Mechanism Verification Protocol
];

describe("CLAUDE.md — always-enforce protocol DEC IDs", () => {
  const contents = readFileSync(CLAUDE_MD_PATH, "utf-8");

  for (const decId of REQUIRED_DEC_IDS) {
    it(`contains ${decId}`, () => {
      expect(contents).toContain(decId);
    });
  }
});
