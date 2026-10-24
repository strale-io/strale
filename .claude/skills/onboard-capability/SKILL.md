---
name: onboard-capability
description: Use when creating, modifying or onboarding a capability (a new executor in apps/api/src/capabilities/, a new or changed manifests/*.yaml, a new slug, or "add a capability"). Walks the manifest-driven pipeline (onboard.ts --discover), field reliability, validation, readiness and smoke test required by the Capability Onboarding Protocol (DEC-20260320-B), and refuses to call the work done until readiness passes.
---

# /onboard-capability — get a capability through the pipeline

The prompt says **what** the capability does. This skill is **how** it enters
the system, and that part is not optional because the prompt left it out.
Authority: `CLAUDE.md` → "Capability Onboarding Protocol (DEC-20260320-B)" and
"Adding New Capabilities (MANDATORY PIPELINE)". If this file and `CLAUDE.md`
disagree, `CLAUDE.md` wins; fix this file. The reviewer's checklist is in the
root `REVIEW.md`.

## 0. Before writing code

- Read the onboarding spec: Notion page `32467c87-082c-819a-a731-d8a5f7237b33`
  if Notion is reachable, otherwise the two `CLAUDE.md` sections above.
- **Data access** (DEC-20261023-A). Name the lane the upstream source is in:
  preferred (official API, licensed data, statutory registry), allowed with
  checks, or never. A "never" source stops here. Check that the host is **not**
  in `PROHIBITED_UPSTREAM_HOSTS` (`apps/api/src/lib/vendor-terms.ts`, the list
  of banned hosts) or `tos-blocklist.ts`. Record the terms verdict, meaning what
  permits per-call access or resale, with a link, in a `limitations` entry
  (category `coverage`). Declare the lane and method in the manifest's
  `data_access` block (step 2).
  For a new vendor, also add it to `config/vendors.yaml`. That register is a
  shadow only until M4; the Notion Vendor Roster is still the authority.
- If the slug is in `DEACTIVATED` in `apps/api/src/capabilities/auto-register.ts`,
  stop and find out why before you reverse it.
- A compliance data service (sanctions, PEP, UBO, adverse media, registry
  self-builds) must meet the DEC-20260428-B engineering bar. That is a build
  Petter decides on, not a routine onboarding.
- A new vendor credential needs a row in `config/env-manifest.yaml`
  (`npm run env:check`) and a zero-cost health probe in
  `apps/api/src/lib/dependency-manifest.ts` (`skipAuth: true` on paid APIs).

## 1. Executor — `apps/api/src/capabilities/<slug>.ts`

- `registerCapability(slug, handler)`. It is auto-registered at startup; do not
  import it in `app.ts`.
- Return `{ output, provenance: { source, fetched_at } }`, with the
  acquisition method in provenance.
- Every external call has `AbortSignal.timeout()`, and caller-supplied URLs go
  through `safeFetch` (CI lints both).
- On a paid upstream, reject empty, null or sub-2-character input **before**
  the call (Principle B).
- Errors are structured: never raw HTML or a stack trace.

## 2. Manifest — `manifests/<slug>.yaml`

Start from the template in `CLAUDE.md`. Required:

- `slug`, `name`, `description` (50–160 chars), `category`
- `input_schema`, `output_schema`
- `price_cents`, inside the €0.02–€1.00 band of DEC-20260302-A (outside it is
  Petter's call)
- `data_source`, `data_source_type`, `transparency_tag`, `freshness_category`
- `maintenance_class`: the gate refuses a manifest without it, and its error
  names the allowed values (`VALID_MAINTENANCE_CLASSES`)
- `test_fixtures.health_check_input`
- at least one honest `limitations` entry
- `data_access`: `lane` (`preferred`, `allowed_with_checks`, or
  `not_applicable` when nothing is fetched), `acquisition_method`, and
  `upstream_vendor` when a vendor sits in the path. Values and meanings are in
  `apps/api/src/lib/data-access.ts`; `data-access-manifests.test.ts` fails
  without it. The executor still sets its own method and vendor on any path
  that differs from this default, such as a fallback vendor.

Set `gdpr_art_22_classification` for screening or risk-synthesis output. The
description is a public claim: it must pass `npm run claims:check` and contain
no real person's data (`check-pii`).

You supply the known-answer input: a real entity you have verified works, not
a placeholder.

## 3. Pipeline

```bash
cd apps/api
npx tsx scripts/onboard.ts --manifest ../../manifests/<slug>.yaml --dry-run   # preview, no writes
npx tsx scripts/onboard.ts --discover --manifest ../../manifests/<slug>.yaml   # live: calls upstream, writes
```

`--discover` cannot be combined with `--dry-run`: the pipeline refuses the
pair, because `--discover` makes real (possibly paid) upstream calls and
rewrites the manifest. `--discover` executes the health-check input, writes `expected_fields` and
`output_field_reliability` back into the manifest, generates all five test
types (known_answer, schema_check, negative, edge_case, dependency_health) and
verifies the known answer. For an existing capability, use
`--backfill --discover --fix`.

**It writes the production database** through the operator write credential
under `autonomousAuthority("capability_onboarding", "DEC-20260812-A")`. The new
row starts invisible (`lifecycle_state='validating'`). If this session does not
hold the credential, the status is `AUTHORIZATION_UNAVAILABLE`: stop and
report. A missing permission is a stop, not something to work around.
Do not pass `--force-override-authority`: it resets admin-set fields such as
`price_cents` and `freshness_category`, which is a pricing change. Do not pass
`--skip-gates` either: it skips validation. If a gate blocks you, fix the
cause, or stop and report it.

## 4. Field reliability (review the generated manifest)

`--discover` marks every field `guaranteed`. Downgrade honestly:

- `guaranteed`: present in every successful response. Only these get
  `not_null` assertions.
- `common`: usually present, but absent for some inputs. Type-checked only.
- `rare`: present for specific inputs only. Never asserted.

Asserting an optional field broke eight EU registries at once. If in doubt,
choose the weaker level.

Set `avg_latency_ms` from the measured run. Without one, estimate from the
transparency tag: algorithmic 20 ms, ai_generated 3000 ms, mixed 2000 ms; for
an external API, use similar capabilities.

## 5. Verify

```bash
cd apps/api
npx tsx scripts/validate-capability.ts --slug <slug>
npx tsx scripts/smoke-test.ts --slug <slug>
curl -s -H "Authorization: Bearer $ADMIN_SECRET" "$STRALE_API_URL/v1/internal/onboarding/readiness?slug=<slug>"
```

The readiness response must be `ready: true` with zero issues. Use the internal
route: the public-ops route hides invisible capabilities, so a new one never
appears there. Then, from the repo root, run the repo checks the manifest
feeds:

```bash
node apps/api/scripts/check-manifest-guaranteed-consistency.mjs --strict
node apps/api/scripts/check-identity-fixture-shape.mjs --strict
node apps/api/scripts/check-tier-coverage.mjs --strict
node apps/api/scripts/check-cost-class-coherence.mjs
npm run claims:check && npm run env:check
```

## 6. Ship

- Dark launch (DEC-20260812-A): the capability stays invisible and off x402
  until its first green week. Do not flip `visible` or `x402_enabled` in the
  same PR.
- Check whether the frontend `llms.txt` needs a change. A new category does;
  a new slug in an existing category does not.
- Report at session end: the readiness result, any steps the prompt did not
  mention, and any step you could not complete, with the reason.

## Common rationalizations (all wrong)

| Thought | Why not |
|---|---|
| "The prompt didn't mention a manifest." | The protocol exists because prompts never do. |
| "I'll mark it all `guaranteed`; tests will tell me." | They tell you by failing in production. Downgrade now. |
| "Readiness failed on something cosmetic." | Then fix it. A capability is not done until readiness passes. |
| "I'll add the limitation later." | Every capability has one. Write it while you know it. |
| "The health probe needs a real key to prove anything." | A 401 proves connectivity at zero cost. Authenticated probes burn quota four times a day. |
| "It's public data, so any fetch is fine." | DEC-20261023-A: lane first, terms recorded, stop at blocks. |
