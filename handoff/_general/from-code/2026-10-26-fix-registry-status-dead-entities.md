Intent: Correct existing paid NO/PL/CZ/GR/FI registry status outputs and their narrative consumer; local implementation, recorded public-registry evidence and regression checks are complete. Production validation/readiness, deployment, push, PR and merge remain with the orchestrator. No production writes were made.

Branch: `fix/registry-status-dead-entities` (isolated clone supplied by orchestrator).
Full session. Explicit build-agent instructions override repository push/PR/merge,
branch-switching and trunk/worktree-closeout instructions. No stash used.

## Changes and observed registry responses

Recorded live response projections are in
`apps/api/src/capabilities/__fixtures__/registry-status/`; each has its URL,
HTTP status, timestamp and full-response SHA-256. Unused personal details were
removed; the Norwegian deleted-unit personal name is omitted.

| Lookup | Trimmed official signals | Corrected executor output |
|---|---|---|
| NO 930663530 | HTTP 200, `respons_klasse=SlettetEnhet`, `slettedato=2026-10-20`; live booleans absent | `status=deleted`; bankruptcy companion `is_deleted=true`, `deletion_date=2026-10-20`, `has_any_distress_signal=true`, bankruptcy false |
| NO 923609016, Equinor (known-answer) | `respons_klasse=Enhet`, bankruptcy/dissolution booleans false | `active`; companion deletion/distress false |
| PL 0000106150, Grupa Lotos | `odpis.naglowekP.wpis`, entry 148, registry-deletion description, `dataWpisu=12.08.2022` | `deregistered` |
| PL 0000033945, MARTOM (previous known-answer) | same deletion description, entry 25, `dataWpisu=27.04.2022` | `deregistered` |
| PL 0000028860, ORLEN (replacement known-answer) | registry registration event; no later registry-deletion event | `active` |
| CZ 01485377, TIKA | ROS/VR `AKTIVNI`; current VR `typOrganu=LIKVIDATOR`, non-deleted membership | `liquidation` |
| CZ 01819062 | current VR liquidator appointment | `liquidation` |
| CZ 00177041 (known-answer) | ROS/VR active; no current liquidator or active IR signal | `active` |
| FI 0101279-1, FC Honka ry | `status=2`, `tradeRegisterStatus=3`, no dissolution `endDate`, no situations | `active` |
| FI 0112038-9, Nokia (known-answer) | `status=2`, `tradeRegisterStatus=1`, no dissolution `endDate`, no situations | `active` |
| Greece | No live request: GEMI key unavailable | Synthetic tests cover active/inactive, deletion/dissolution, bankruptcy, liquidation, unknown, accented and uppercase strings |

Norway additionally handles compulsory dissolution. Finnish current situation
codes distinguish KONK (bankrupt), SELTILA (liquidation), SANE (restructuring);
Business ID status 1 is pending, 5 inactive, unknown codes unknown. Ended
situations do not determine current status. Czech status becomes unknown when
VR is expected but its status evidence cannot be retrieved; IR active is an
insolvency-register signal, not an adjudication of bankruptcy. Historical
liquidator appointments and name suffixes do not establish current liquidation.

Poland's official API documentation describes legal-form-specific semantic JSON,
without a complete field schema. The real header event field is evidenced by
captured official responses. No undocumented boolean or numeric stanPozycji
mapping is assumed. The newest registration/deletion event wins; historical
field-removal markers are not entity deletion. This change does not classify
Polish liquidation/bankruptcy; the manifest says so.

Manifests document status interpretation, enumerate closed output vocabularies,
add the Norwegian bankruptcy deletion fields/reliability and record terms links.
Greek unrecognised status descriptions remain strings, so its schema is open.
Norwegian nullable/empty live-unit fields are now common rather than guaranteed,
because deleted tombstones need not carry them. The MARTOM example stays MARTOM
and now says deregistered; the active known-answer changes to ORLEN.

## Consumers checked

Whole-repository searches covered every changed slug, company_status, active
comparisons and distress readers. The unmerged company-status-check branch was
not inspected or used.

- `apps/api/src/db/solution-catalogue.ts`: historical KYC Norway/Finland steps
  forward registry output; no active-only condition or lifecycle enum.
- `apps/api/scripts/seed-kyb-solutions.ts`: KYB Essentials/Complete and
  Invoice Verify country factories. Existing NO/FI/PL/GR mappings (and the
  generic company-data path) pass registry outputs through; Complete/Invoice
  feed `$all_results` to risk-narrative-generate, including Norway bankruptcy.
  There is no separate checked-in CZ factory entry in this seed file.
- `apps/api/src/lib/solution-executor.ts`: `$steps[N]`, `$all_results`, optional
  gates, enrichment and outcome aggregation preserve lifecycle strings.
- `apps/api/src/capabilities/risk-narrative-generate.ts`: FIXED. Previously any
  populated company result passed in the algorithmic fallback. Nonactive or
  unfamiliar registry strings and Norwegian distress now preserve source-cited
  findings deterministically, even with an AI key. Critical sanctions remain
  critical alongside lifecycle findings. Accurate note/provenance distinguish
  this route from unavailable AI. No LLM was called during verification.
- `apps/api/src/capabilities/providers/norwegian-company-data.ts` and
  `providers/finnish-company-data.ts`, plus `lib/data-provider.ts` /
  `capabilities/index.ts`: wrappers delegate and preserve output.
- `apps/api/src/capabilities/website-to-company.ts`: embeds returned company
  object intact; no lifecycle coercion.
- `apps/api/src/capabilities/lib/enrich-company-output.ts`: derives VAT only;
  preserves status. `lib/execution-outcome.ts` and `isSuccessfulStepOutput`
  correctly treat a dead-company registry answer as a successful purchased
  lookup, distinct from passing a KYB check.
- `apps/api/src/routes/solutions.ts`, `routes/do.ts`, `routes/x402-gateway-v2.ts`
  and `lib/audit-helpers.ts`: transport/transaction status and source handling;
  no company-lifecycle enum or active coercion.
- SDK Python/TypeScript, MCP and framework package consumers: generic output
  transport; status checks found there concern HTTP or transaction status.
  No `apps/web` exists in this clone; sibling frontend not available here.
- Other `=== "active"` company readers (`beneficial-ownership-lookup.ts`,
  `austrian-company-data.ts`, `lib/openapi-resolver.ts`) consume their own
  upstream records, not these executors.
- Brreg VAT provider (`capabilities/lib/vat-providers/brreg.ts`, used by
  `vat-validate`) checks deletion date independently; does not consume the
  changed status vocabulary. New terms tests trace this existing shared adapter
  and the company-data wrapper explicitly.

Specific solution plumbing tests exercise new values through references,
enrichment and outcomes. Narrative tests cover KYB and invoice contexts.

## Verification and evidence

Evidence receipt: [registry status verification](../../../archive/receipts/2026-10-26-test-run-registry-status-dead-entities.json).

- Final targeted Vitest run: 189 passed, 4 existing skipped, zero failures in
  seven files: registry-status, registry-status.consumers,
  risk-narrative-generate.registry-status, finnish-company-data, vendor-terms,
  solution-executor and execution-outcome.
- Each of the six registry executors and risk-narrative-generate was separately
  replaced with `git show HEAD:<path>`; its regression run failed. Each fixed
  file was restored in `finally`, and the final complete run passed. The receipt
  records failing cases and counts. No stash or branch switching.
- `npm --workspace=packages/mcp-server run build`: passed (once).
- `cd apps/api && npx tsc --noEmit`: passed, including after review changes.
- `npm run claims:check`, `models:check`, `env:check`, `docs:check`,
  `programs:check`, `receipts:check`: passed. Receipts check reports existing
  bare-test-count warnings in historical handoffs.
- Strict manifest-guaranteed consistency, strict identity-fixture shape,
  strict tier coverage, cost-class coherence: passed. Existing allowlisted
  findings remain. `git diff --check`: passed.
- Initial vendor-terms test run exposed two existing shared Brreg adapters not
  traced by the new record; fixed explicit caller coverage and reran green.
- `onboard.ts --manifest ../../manifests/<slug>.yaml --backfill --dry-run`,
  `validate-capability.ts --slug <slug>` and `smoke-test.ts --slug <slug> --dry-run`
  were attempted for all seven changed executors. They could not complete:
  no production write credential for backfill, no DATABASE_URL for validation
  and smoke. The existing dry-run implementation opens an operator write
  handle even before preview. No write occurred; authority was not bypassed.
- `checkReadiness(slug)` attempted for all seven: unavailable (DATABASE_URL
  required). No claim of production `ready:true`.
- `npm run handoff:orient`: passed. `npm run handoff:check`: cannot fully pass
  under the orchestrator's restrictions (isolated clone is classified as trunk
  on a feature branch; upstream push and unrelated remote branch deletion are
  prohibited; origin fetch unavailable). Local dirty/resume findings are
  addressed by this handoff and commit; remaining findings belong to orchestrator.
- `/go` local verification, scope/simplification inspection and independent
  technical/product reviews completed. Separate read-only contexts returned GO
  and GO with nits in two rounds; all findings/nits resolved, including narrative
  mixed-signal severity, source citations, provenance and manifest documentation.
  No standalone simplify skill is installed; a manual simplification pass retained
  direct mappings without adding a new abstraction. No PR/push/merge attempted.

## Cost and upstream access

`external_cost_cents` remains unchanged in code/config. Existing registry-ID /
health-fixture path: norwegian-company-data=0, no-bankruptcy-check=0,
polish-company-data=0, cz-company-data=0, greek-company-data=0,
finnish-company-data=0. Existing conditional name/free-text LLM paths in NO/CZ/FI
are unchanged; do not read this as a promise all name resolution is free.
Risk-narrative-generate's configured external-cost estimate remains 3 cents
(`apps/api/src/lib/llm-capability-costs.ts`); registry preservation bypasses AI,
so that route costs zero upstream. Actual production DB cost columns could not
be read here. No paid upstream call was made.

No new upstream host or endpoint was introduced. Existing hosts: data.brreg.no,
api-krs.ms.gov.pl, ares.gov.cz, avoindata.prh.fi,
opendata-api.businessportal.gr. ARES VR was already called before this fix.
The only added URL in fetch headers is the Strale User-Agent contact URL, not
an upstream request. Terms pages were actually read before executor edits and
recorded in VENDOR_TERMS_RECORDS with date 2026-10-26; manifests link them.

## Environment closeout limitation

The supplied clone's `.git` directory is mounted read-only. `git add` failed
with `Unable to create .git/index.lock: Read-only file system`; even a temporary
worktree cannot be registered there. No approval escalation is available.
Therefore the supplied checkout must retain its unstaged diff. A separate
writable clone and batch worktree are used only to package this same reviewed
change as a local commit and portable Git bundle; no remote is written.
The orchestrator can import that bundle rather than reauthoring the diff.
`npm run context:generate` initially refused this primary clone; generation in
the separate isolated worktree is used for the final commit. The handoff gate
cannot pass in the supplied read-only Git checkout.

## Remaining orchestrator / production work

1. Review and push local commit(s), open/merge PR, deploy through the normal
   mechanism. This build agent did none of those actions.
2. In an operator-authorised environment, review current DB/manifest drift and
   run the following from `apps/api` for slugs listed below. Commands require
   credentials unavailable in this clone. `--force` acknowledges the existing
   backfill banner after drift review; never use `--force-override-authority`.
   Backfill does not synchronise every schema column: if production schemas
   enumerate status, apply the exact manifest vocabularies/deletion fields via
   the authorised catalogue-update workflow before smoke/readiness. Preserve
   live pricing, cost, visibility, lifecycle and x402 settings.

```bash
for slug in norwegian-company-data no-bankruptcy-check polish-company-data cz-company-data greek-company-data finnish-company-data risk-narrative-generate; do
  npx tsx scripts/onboard.ts --manifest "../../manifests/$slug.yaml" --backfill --fix --dry-run
  # Only after reviewing preview/drift, in the authorised operator process:
  npx tsx scripts/onboard.ts --manifest "../../manifests/$slug.yaml" --backfill --fix --force
  npx tsx scripts/validate-capability.ts --slug "$slug"
  npx tsx scripts/smoke-test.ts --slug "$slug"
  curl --fail --silent --show-error -H "Authorization: Bearer $ADMIN_SECRET" "https://api.strale.io/v1/internal/onboarding/readiness?slug=$slug"
done
```

3. Confirm each readiness result is `ready:true` with zero issues; do not infer
   readiness from local tests. Greek live smoke requires the existing GEMI key;
   narrative smoke may use paid AI. Preserve existing test-cost policy.
4. After deployment, repeat the supplied registry lookups through the paid API
   with an authorised API key and verify KYB/Invoice outputs retain status and
   narrative findings. These production API calls were not made here.
5. [BACKFILL] Orchestrator may file the session Journal entry; this local-only
   build did not write to Notion or send external messages.

## Changed files

- `apps/api/src/capabilities/__fixtures__/registry-status/README.md`
- `apps/api/src/capabilities/__fixtures__/registry-status/cz-01819062.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/cz-active.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/cz-liquidation.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/cz-vr-01819062.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/cz-vr-active.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/cz-vr-liquidation.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/fi-active.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/fi-association.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/no-active.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/no-deleted.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/pl-active.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/pl-deleted.json`
- `apps/api/src/capabilities/__fixtures__/registry-status/pl-orlen.json`
- `apps/api/src/capabilities/cz-company-data.ts`
- `apps/api/src/capabilities/finnish-company-data.ts`
- `apps/api/src/capabilities/greek-company-data.ts`
- `apps/api/src/capabilities/no-bankruptcy-check.ts`
- `apps/api/src/capabilities/norwegian-company-data.ts`
- `apps/api/src/capabilities/polish-company-data.ts`
- `apps/api/src/capabilities/registry-status.consumers.test.ts`
- `apps/api/src/capabilities/registry-status.test.ts`
- `apps/api/src/capabilities/risk-narrative-generate.registry-status.test.ts`
- `apps/api/src/capabilities/risk-narrative-generate.ts`
- `apps/api/src/lib/brreg-fetch.ts`
- `apps/api/src/lib/vendor-terms.test.ts`
- `apps/api/src/lib/vendor-terms.ts`
- `archive/README.md`
- `archive/receipts/2026-10-26-test-run-registry-status-dead-entities.json`
- `docs/project/legacy-authority-inventory.json`
- `handoff/README.md`
- `handoff/_general/from-code/2026-10-26-fix-registry-status-dead-entities.md`
- `manifests/cz-company-data.yaml`
- `manifests/finnish-company-data.yaml`
- `manifests/greek-company-data.yaml`
- `manifests/no-bankruptcy-check.yaml`
- `manifests/norwegian-company-data.yaml`
- `manifests/polish-company-data.yaml`
- `manifests/risk-narrative-generate.yaml`

Closeout packaging: `npm ci --ignore-scripts` succeeded in the separate worktree;
`npm run hooks:install` succeeded explicitly afterward. No dependency versions
were changed. Context generation succeeded in that isolated worktree. The
supplied checkout context checker still sees unstaged/untracked inventory drift
because its Git index cannot be written; that is an environment limit, not an
exception to the commit hook in the writable packaging worktree.
