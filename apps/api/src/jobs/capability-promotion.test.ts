/**
 * Round-2 fix (2026-08-16) — external (Codex) review of the "promotion
 * grace" fix found a TOCTOU gap in the promotion write (blocker #3): the
 * conditional UPDATE re-asserted isActive/visible/deactivation_reason/
 * breaker-state but not lifecycle_state, maintenance_class, or the identity
 * of the listing-state event the decision was evaluated against. A human
 * suspension, a maintenance_class change, or a fresh floor quarantine
 * landing between evidence collection and the write could be silently
 * overwritten back to active/visible.
 *
 * There is no Postgres-backed harness for jobs/capability-promotion.ts (the
 * evidence query and the write both run through a hand-built `postgres`
 * client / drizzle transaction, not a mockable call) — per the CLAUDE.md
 * test-harness exemption, coverage here is a structural pin on the source
 * text of the write's WHERE clause: it fails the instant any of the four
 * re-asserted preconditions (lifecycle_state, maintenance_class,
 * deactivation_reason, listing-event identity) is dropped, and it fails if
 * the listing-event re-check ever stops sharing LISTING_EVENT_MATCH_SQL with
 * the evidence query (the drift PROMOTION_EVIDENCE_SQL's own docstring warns
 * against).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Source with comments stripped — these assertions are about what the code
 * does, and the fix's own docstring names the bug pattern it replaces. */
const readCode = (rel: string) =>
  readFileSync(join(HERE, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("capability-promotion write — TOCTOU re-check (Codex blocker #3)", () => {
  const src = readCode("capability-promotion.ts");

  it("re-asserts lifecycle_state exactly as evaluated", () => {
    expect(src).toContain("eq(capabilities.lifecycleState, d.lifecycleState)");
  });

  it("re-asserts maintenance_class exactly as evaluated, null-safe", () => {
    expect(src).toContain("${capabilities.maintenanceClass} IS NOT DISTINCT FROM ${d.maintenanceClass}");
  });

  it("re-derives the latest listing-state event at write time and requires it to still be the one evaluated", () => {
    // Must reuse the SAME condition text the evidence query used — a
    // hand-copied second condition is exactly the drift PROMOTION_EVIDENCE_SQL
    // warns about pinning against.
    expect(src).toContain("dsql.raw(LISTING_EVENT_MATCH_SQL)");
    expect(src).toContain("IS NOT DISTINCT FROM ${d.lastListingEventId}::uuid");
    expect(src).toMatch(/ORDER BY e\.created_at DESC\s*\n\s*LIMIT 1\s*\n\s*\) IS NOT DISTINCT FROM/);
  });

  it("still re-asserts the three original preconditions (isActive, visible, deactivation_reason, breaker) — the hardening is additive", () => {
    expect(src).toContain("eq(capabilities.isActive, true)");
    expect(src).toContain("eq(capabilities.visible, false)");
    expect(src).toContain("isNull(capabilities.deactivationReason)");
    expect(src).toContain("h.state <> 'closed'");
  });

  it("any race still rolls back via PromotionRaced rather than silently overwriting", () => {
    expect(src).toMatch(/if \(affected !== 1\) \{[\s\S]*?throw new PromotionRaced/);
  });
});
