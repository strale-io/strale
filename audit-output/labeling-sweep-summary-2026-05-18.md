# Labeling sweep summary — Evidence Tier framework compliance
Date: 2026-05-18
Branch: feat/evidence-tier-labeling-sweep
Files modified: 31 (1 deferred — swiss-company-data throw-stub)

## Per-handler changes

| Handler | Pattern | tier_2_available | ubo_availability | Notes |
| --- | --- | --- | --- | --- |
| german-company-data | inline-literal | true | restricted | patched |
| greek-company-data | variable-output | true | unavailable_no_registry | patched |
| us-company-data-cobalt | inline-literal | true | unavailable_no_registry | patched |
| austrian-company-data | openapi | false | restricted | patched |
| bulgarian-company-data | openapi | false | unavailable_no_registry | patched |
| cypriot-company-data | openapi | false | unavailable_no_registry | patched |
| hungarian-company-data | openapi | false | restricted | patched |
| luxembourgish-company-data | openapi | false | restricted | patched |
| maltese-company-data | openapi | false | unavailable_no_registry | patched |
| dutch-company-data | openapi | false | restricted | patched |
| romanian-company-data | openapi | false | unavailable_no_registry | patched |
| italian-company-data | openapi | false | restricted | patched |
| spanish-company-data | openapi | false | restricted | patched |
| portuguese-company-data | openapi | false | restricted | patched |
| slovenian-company-data | variable-output | false | unavailable_no_registry | patched |
| singapore-company-data | variable-output | false | unavailable_no_registry | patched |
| danish-company-data | variable-output | false | available | patched |
| swiss-company-data | throw-stub | — | — | throw-only stub; real path via providers/ DataProvider chain (out of scope) |
| uk-company-data | variable-output | false | available | patched |
| belgian-company-data | variable-output | false | restricted | patched |
| cz-company-data | inline-literal | false | restricted | patched |
| estonian-company-data | variable-output | false | unavailable_no_registry | patched |
| finnish-company-data | variable-output | false | restricted | patched |
| french-company-data | variable-output | false | restricted | patched |
| croatian-company-data | variable-output | false | unavailable_no_registry | patched |
| irish-company-data | variable-output | false | restricted | patched |
| lithuanian-company-data | variable-output | false | unavailable_no_registry | patched |
| latvian-company-data | variable-output | false | unavailable_no_registry | patched |
| norwegian-company-data | variable-output | false | unavailable_no_registry | patched |
| polish-company-data | variable-output | false | restricted | patched |
| swedish-company-data | inline-literal | false | unavailable_no_registry | patched |
| slovak-company-data | inline-literal | false | unavailable_no_registry | patched |

## Aggregate counts

- Handlers patched: 31
- Handlers deferred (throw-only stubs): 1 — swiss-company-data
- Handlers with `tier_2_available: true`: 3 (german-company-data, greek-company-data, us-company-data-cobalt)
- Handlers with `tier_2_available: false`: 28
- Handlers with `ubo_availability: available`: 2 (danish-company-data, uk-company-data)
- Handlers with `ubo_availability: restricted`: 14
- Handlers with `ubo_availability: unavailable_no_registry`: 15

### Pattern distribution

- inline-literal: 5 handlers
- variable-output: 15 handlers
- openapi: 11 handlers

Edit semantics per pattern:

- **openapi** (11): wrapped `executeOpenapiCapability(...)` call with `const __etResult = await ...; return { ...__etResult, output: { ...__etResult.output, [canonical aliases + labels] } };` — labels live at the country-handler level; the shared resolver at `lib/openapi-resolver.ts` is untouched.
- **inline-literal** (5): injected canonical-alias key/value pairs (mirroring the original value expression) + labels into the existing `output: { ... }` literal block.
- **variable-output** (15): inserted a runtime-resolver block before `return { output, provenance }` that conditionally sets canonical aliases (only if not already present) plus the two label flags.

## Follow-up flagged

### v1.1 verification — `ubo_availability` values marked "verification pending public-source confirmation"

The following countries' UBO availability values are chat-side estimates and should be verified against the jurisdiction's official source within the v1.1 cycle. Capture as a Notion to-do:

- `greek-company-data`
- `bulgarian-company-data`
- `cypriot-company-data`
- `maltese-company-data`
- `romanian-company-data`
- `estonian-company-data`
- `croatian-company-data`
- `lithuanian-company-data`
- `latvian-company-data`
- `swedish-company-data`
- `slovak-company-data`

Total: 11 countries.

### Follow-up — handler-side `legal_representatives` extraction where upstream registry exposes data

The following handlers carry `tier_2_available: false` with reason "handler does not currently extract legal representatives from upstream registry". Many of these registries DO expose director data upstream (e.g. Companies House Officers API, INSEE dirigeants, PRH ytj.fi managers). A separate follow-up sweep should add per-handler extraction logic:

- `belgian-company-data`
- `cz-company-data`
- `estonian-company-data`
- `finnish-company-data`
- `french-company-data`
- `croatian-company-data`
- `irish-company-data`
- `lithuanian-company-data`
- `latvian-company-data`
- `norwegian-company-data`
- `polish-company-data`
- `swedish-company-data`
- `slovak-company-data`

Total: 13 handlers.

Plus `uk-company-data` (separate reason citing Companies House Officers extraction as the specific follow-up): the Officers API exists; current handler implementation doesn't extract it.

### Throw-stub deferral — `swiss-company-data`

`apps/api/src/capabilities/swiss-company-data.ts` is a throw-only stub. The real CH runtime path is via `apps/api/src/capabilities/providers/swiss-company-data.ts` (DataProvider chain). The chain provider builds the actual output object. Labeling the chain provider is OUT OF SCOPE for this sweep per the prompt's explicit scope statement.

Follow-up: extend the labeling sweep to cover `providers/swiss-company-data.ts` so CH gains Evidence Tier compliance via the runtime path it actually uses.

### OpenAPI spec regeneration

If `apps/api/openapi.json` or equivalent is generated from the handler return types, it may need a regen pass to reflect the new fields. Verify after merge.

### YAML rescore against new 6/3/3 rubric

Coverage-matrix YAML rows still encode the legacy 7/5/6 BR rubric in `tier_1_coverage` / `tier_2_coverage` / `tier_3_coverage` strings. A separate sweep should rescore against the Evidence Tier 6/3/3 framework. Not blocking for v1 launch.
