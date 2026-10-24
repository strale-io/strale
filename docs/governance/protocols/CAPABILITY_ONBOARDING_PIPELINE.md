---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Adding New Capabilities (MANDATORY PIPELINE)"
moved_at: 2026-10-24
---

# Adding New Capabilities (MANDATORY PIPELINE)

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

**All new capabilities MUST go through the manifest-driven pipeline.** (The historical seed.ts file was deleted in PR #79; it duplicated manifest content and only generated 2 of 5 required test types via its onboarding hook. The canonical pipeline is `apps/api/scripts/onboard.ts` — it generates all 5 test types and is the only sanctioned path for capability creation.)

The `/onboard-capability` skill (`.claude/skills/onboard-capability/SKILL.md`) walks this pipeline and the Capability Onboarding Protocol step by step.

#### Recommended workflow (--discover):

1. **Write the executor** at `apps/api/src/capabilities/{slug}.ts`
   - Register via `registerCapability(slug, handler)`
   - Handler returns `{ output, provenance: { source, fetched_at } }`
   - All external calls must have `AbortSignal.timeout()`
   - Errors must be structured, never raw HTML or stack traces

2. **Auto-registered** — executors are auto-imported at startup by `src/capabilities/auto-register.ts`. No manual import in `app.ts` needed.

3. **Create minimal manifest** at `manifests/{slug}.yaml`
   Required fields:
   - `slug`, `name`, `description`, `category`, `price_cents`
   - `data_source`, `data_source_type`, `transparency_tag`, `freshness_category`
   - `test_fixtures.health_check_input` — simple input that always works
   - `limitations` — at least 1 (every capability has limitations)
   **No need to write `expected_fields` or `output_field_reliability` — the pipeline generates them.**

4. **Run the pipeline with --discover:**
   `cd apps/api && npx tsx scripts/onboard.ts --discover --manifest ../../manifests/{slug}.yaml`
   The pipeline:
   - Executes the capability with health_check_input
   - Auto-generates expected_fields from the actual output
   - Auto-generates output_field_reliability (all fields marked guaranteed initially)
   - Writes the updated manifest back to disk
   - Generates all 5 test types (known_answer, schema_check, negative, edge_case, dependency_health)
   - Verifies the known_answer test passes against live output

5. **Review:** Check the auto-generated expected_fields in the manifest. Adjust reliability levels (guaranteed/common/rare) as needed.

6. **Verify:** `npx tsx scripts/smoke-test.ts --slug {slug}`

#### Pipeline flags:
```
--manifest <path>    Path to YAML manifest (required)
--dry-run            Preview without inserting to DB
--backfill           Update existing capability (add missing tests, update fixtures)
--discover           Auto-generate expected_fields from live execution output
--fix                Auto-correct high-confidence fixture mismatches (field name typos, case, type coercion)
--strict             Abort if execute-and-verify fails
```

Combine flags for existing capabilities: `--backfill --discover --fix`

#### For backfilling existing capabilities:
`cd apps/api && npx tsx scripts/onboard.ts --manifest ../../manifests/{slug}.yaml --backfill`
Skips capability creation, adds only missing test types, updates field reliability + limitations.

Use `--backfill --discover --fix` to auto-correct fixture mismatches on existing capabilities.

#### Field reliability rules:
- `guaranteed` — always present in successful responses. Safe to assert on.
- `common` — usually present, may be absent for some inputs. Type-checked only.
- `rare` — only present for specific inputs. Never asserted on.

Only `guaranteed` fields are used in known_answer test assertions. This prevents the "expected non-null on optional field" problem that broke 8 EU registries.

#### What the pipeline does NOT do (human must provide):
- The known_answer test input (a real entity you've verified works)
- Field reliability annotations (which fields are truly guaranteed)
- Limitations (honest assessment of coverage gaps)
- The executor code itself

Everything else is auto-generated. This is how the platform scales to third-party providers.

#### Quick reference — manifest template:
```yaml
slug: "example-capability"
name: "Example Capability"
description: "What it does (50-160 chars for SEO)"
category: "validation"
price_cents: 5
data_source: "Example API"
data_source_type: "api"  # api | scrape | computed | reference
transparency_tag: "algorithmic"  # algorithmic | ai_generated | mixed
freshness_category: "live-fetch"  # live-fetch | reference-data | computed
