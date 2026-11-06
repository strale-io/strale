Intent: stop publishing example inputs that the executors refuse for `aml-risk-score`, `country-tax-rates` and `ens-resolve` (probe402 thread, OUTBOX row `probe402-refusals`), and pin it with tests.

Branch `fix/x402-example-inputs`, cut from `origin/main` at `5412e926`. Not opened as a PR (the orchestrator decides).

## What was wrong (measured, not assumed)

Production on 2026-11-06 (plain unauthenticated GETs of `/x402/v2/<slug>`, `/x402/catalog`, `/.well-known/x402.json`, `/v1/capabilities/ens-resolve`):

| slug | example in the 402 challenge (`extensions.bazaar.info.input`) |
|---|---|
| `country-tax-rates` | `queryParams: {country_code: "US"}`, a real code the executor accepts |
| `aml-risk-score` | none. The input privacy screen withholds it (compliance category, and `entity_name` reads as a personal-data field). |
| `ens-resolve` | none. Withheld (`processes_personal_data: true`, field `name`). The only example is prose in the schema description (`e.g., 'vitalik.eth'`). |

Neither discovery file nor catalogue carries an example input. So a client had nothing to copy for two of the three tools. The one place that did publish a value for every tool was the 400 body: `schemaBadRequest` built `example` with `generateExampleFromSchema`, which emitted `example_<field>` for every string and `0` for every number. Agents treat that as a request template. Production failures already in the repo show it: `'Invalid label "example_name": underscore allowed only at start'` (ENS) and `'Invalid ABN format: "example_abn"'` in `transaction-failure-taxonomy.test.ts`. The executors refuse these values: `country-tax-rates` has no `example_country_code`, `aml-risk-score` needs a 2-letter country, ENS `normalize()` rejects underscores. Before PR #819 (2026-10-29) the Bazaar `info.input` was built from the same generator, which fits probe402's September refusals.

## Change

- `manifests/aml-risk-score.yaml`: `health_check_input` was `{Test Company, SE}`, now `{entity_name: "Spotify AB", entity_type: "company", country_code: "SE"}`.
- `manifests/ens-resolve.yaml`: had no `health_check_input`; now `{name: "vitalik.eth"}`.
- `manifests/country-tax-rates.yaml`: unchanged. `US` was already a real, accepted code and is published.
- `apps/api/src/lib/x402-discovery-metadata.ts`: new `REVIEWED_PUBLIC_INPUT_EXAMPLES` (two rows, each with a reason). It lets exactly those two input examples through the tool-level and field-name screens, only while the manifest `health_check_input` equals the row. Size limit, placeholder check and input-schema check still run. Output examples of both tools stay withheld. New `publishedInputExample()` is the one reader for the challenge and the 400 body.
- `apps/api/src/routes/x402-gateway-v2.ts`: `generateExampleFromSchema` deleted. The 400 `example` is now the screened published example, else a request built only from `enum`/`default` values and only when it validates, else the key is omitted. It no longer invents values. The three `schemaBadRequest` call sites pass the slug.
- `apps/api/src/routes/__snapshots__/x402-settlement-characterization.test.ts.snap`: the one characterization snapshot that pinned `"example":{"value":"example_value"}` is updated to the body without `example`. That is the intended change; no assertion was loosened.
- New `apps/api/src/lib/x402-example-inputs.test.ts` : the three examples are published and the executors accept them (aml-risk-score and country-tax-rates run offline; ens-resolve is checked through viem `normalize`/`namehash`, its pre-network step); the old placeholders are refused by the same executors; every one of the 358 manifests is screened for placeholder-looking published input strings (112 publish one today, all pass); the 400 body never carries `example_*`; the reviewed-example exception stays narrow. Fail-before: with the two manifest edits reverted, 5 of these fail.

## Needs an independent reviewer (tier 2: privacy screen)

`REVIEWED_PUBLIC_INPUT_EXAMPLES` is a deliberate hole in the public-example privacy screen, for two tools the screen withholds by class. The alternative is to publish no example for them and keep refusals. The choice of "Spotify AB" as the AML example name is the orchestrator's/Petter's to confirm; the tool only scores the flags and country it is given and looks nothing up.

## What reaches production on deploy

- The challenge example and the 400 example both read `manifests/*.yaml` from disk at runtime (`getDiscoveryMetadata`, `x402-discovery-metadata.ts`; image copies it at `Dockerfile:59`). A deploy of this branch changes them with no DB step.
- `isReportOnly` (`manifest-publication-policy.ts:4`, `compliance|methodology|kyb|kyc` category) only gates the boot-time text sync of `TEXT_COLUMNS` (name, description, category, data_source, input_schema, output_schema, output_field_reliability). `health_check_input` is not one of them, so `aml-risk-score` being compliance does not hold the example back. An edit to aml's description or schemas would not sync.
- Does not reach production by itself: DB `test_suites` inputs (aml's `dependency_health` suite still stores "Test Company" until a `onboard.ts --backfill`; it passes, so `fixtures:drift` does not flag it), the `output_schema.example` shown at `/v1/capabilities/ens-resolve` (an unresolved-name sample, left as is), and the published `country-tax-rates` output example, withheld because `country_name` trips the `name` field screen (a false positive, not fixed here).

## Verified

`npx vitest run` in `apps/api`: all files pass, none failing. `npm run typecheck` 0, `claims:check`, `models:check`, `env:check`, `context:check` ok, `check-manifest-guaranteed-consistency` 0 findings. `validate-capability.ts` needs the production DB and was not run. No production-side verification was possible before deploy.

After deploy, verify with: `curl -si https://api.strale.io/x402/v2/ens-resolve` and decode `payment-required`: `extensions.bazaar.info.input.queryParams` must be `{"name":"vitalik.eth"}`; same for `aml-risk-score` (`entity_name`, `entity_type`, `country_code`).

Next authorised action: independent review of this branch, then PR and merge by the orchestrator | Owner: Strale orchestrator | Blocker: none
