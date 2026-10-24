/**
 * Sanity check: the always-loaded agent contract must route to every
 * always-enforce protocol, by decision ID, and each protocol's authoritative
 * text must exist.
 *
 * Since the contract cut (DEC-20261024-A) the contract both tools load is
 * AGENTS.md: CLAUDE.md imports it with `@AGENTS.md`, and the protocol bodies
 * live in docs/governance/protocols/. The protocols are only enforced if a
 * session can find them from the contract at session start. If a future edit
 * drops a DEC ID from the reading map, breaks the import, or deletes a
 * protocol file, this test fails and forces the author to notice.
 *
 * Add the new DEC ID here when a new always-enforce protocol lands.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../../../..");
const AGENTS_MD = readFileSync(resolve(ROOT, "AGENTS.md"), "utf-8");
const CLAUDE_MD = readFileSync(resolve(ROOT, "CLAUDE.md"), "utf-8");

const REQUIRED_PROTOCOLS: Array<[string, string]> = [
  ["DEC-20260320-B", "CAPABILITY_ONBOARDING.md"], // Capability Onboarding Protocol
  ["DEC-20260422-A", "DISTRIBUTION_PR_INTEGRITY.md"], // Distribution PR Integrity Protocol
  ["DEC-20260504-A", "AUDIT_FOLLOWUP_TEST_COVERAGE.md"], // Audit-Follow-up Test Coverage Protocol
  ["DEC-20260504-B", "BULK_OPERATION_DEPLOY.md"], // Bulk-Operation Deploy Protocol
  ["DEC-20260504-C", "DEPLOY_MECHANISM_VERIFICATION.md"], // Deploy Mechanism Verification Protocol
];

describe("agent contract — always-enforce protocols", () => {
  it("CLAUDE.md imports AGENTS.md on its first line", () => {
    expect(CLAUDE_MD.split("\n")[0].trim()).toBe("@AGENTS.md");
  });

  for (const [decId, file] of REQUIRED_PROTOCOLS) {
    it(`AGENTS.md routes to ${decId} (${file}), and the file exists and names it`, () => {
      expect(AGENTS_MD).toContain(decId);
      expect(AGENTS_MD).toContain(file);
      const path = resolve(ROOT, "docs/governance/protocols", file);
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path, "utf-8")).toContain(decId);
    });
  }
});
