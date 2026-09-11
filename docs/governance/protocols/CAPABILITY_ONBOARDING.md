---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Capability Onboarding Protocol (DEC-20260320-B)"
---

# Capability Onboarding Protocol (DEC-20260320-B)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 6b). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

> [!NOTE]
> The "Adding New Capabilities (MANDATORY PIPELINE)" section of `CLAUDE.md`
> is the how-to this protocol governs. It is a separate section and is not
> part of this mirror.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Capability Onboarding Protocol (DEC-20260320-B)

**MANDATORY — applies to ANY session that creates, modifies, or onboards a capability.**

**Trigger:** Claude Code detects that the session involves any of: new executor file in `src/capabilities/`, new or modified DB row in `capabilities` table, new capability slug, manifest file, seed entry, or the prompt mentions adding/creating a capability.

**Rule:** The Capability Onboarding Pipeline spec is the authority on HOW capabilities enter the system. The prompt describes WHAT to build. These are separate concerns. A prompt that says "add pep-check capability" without mentioning manifests, field reliability, or validation does NOT mean those steps are optional.

**Required steps (non-negotiable):**

1. **Read the spec first.** Before writing any code, read the Capability Onboarding Pipeline design spec. If Notion is accessible, fetch page `32467c87-082c-819a-a731-d8a5f7237b33`. If not, the key requirements are listed below.
2. **Create/update onboarding manifest** (YAML file in repo) with: slug, name, description, category, schemas, pricing, data_source, transparency_tag, test_fixtures (known_answer + health_check_input), output_field_reliability for ALL output fields, and at least 1 limitation.
3. **Declare output_field_reliability** for every output field: `guaranteed` (always present), `common` (usually present), or `rare` (sometimes present). Only `guaranteed` fields get `not_null` test assertions.
4. **Set avg_latency_ms** — measure from test execution or estimate from transparency_tag (algorithmic=20ms, ai_generated=3000ms, mixed=2000ms, external API=check similar capabilities).
5. **Run structural validation**: `npx tsx scripts/validate-capability.ts --slug <slug>`
6. **Run readiness check**: Verify `checkReadiness(slug)` returns `ready: true` with zero issues.
7. **Run smoke test** (if available): `npx tsx scripts/smoke-test.ts --slug <slug>`

**At session end, report:**
- Readiness check result (pass/fail + any issues)
- Steps completed that the prompt didn't mention
- Steps that couldn't be completed and why

**Do NOT mark a capability task as done if the readiness check fails.** Report what's missing.

**This rule does NOT override:**
- The prompt's specification of what the capability does (slug, schemas, pricing, implementation logic)
- The DEACTIVATED list in `src/capabilities/auto-register.ts`
<!-- END VERBATIM FROM CLAUDE.md -->
