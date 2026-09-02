Intent: Implement T12 (Research contract) — front-matter schema, checker,
generated index, and CI wiring for `docs/research/`, plus the `docs/company/IDEAS.md`
inbox and the CLAUDE.md/AGENTS.md paragraph, per
`archive/sessions/2026-09-02-t12-research-contract-plan.md`.

## What was built

- `docs/research/research.schema.json` — Ajv 2020 schema for research front
  matter (`doc_type`, `type`, `topic`, `question`, `date`, `status`,
  `supersedes`, `superseded_by`, `sources`, `decisions`;
  `additionalProperties: false`; conditional `superseded_by` required when
  `status: superseded`).
- `scripts/research-lib.mjs` — pure functions: front-matter parsing, filename
  pattern + calendar-date validation, markdown-link and `sources` resolution
  (doc-relative and repo-root-relative, mirroring how this repo actually
  writes links), reciprocal/acyclic supersession checks, one-current-per-topic,
  active-decision-cites-only-current-research, `docs/company/IDEAS.md` line
  shape + promoted-target existence, and the docs/strategy|audits|diligence
  warning sweep. Reuses `isCalendarDate`, `repoRootFrom`, `trackedFiles` from
  `program-tracks-lib.mjs` rather than reimplementing them.
- `scripts/check-research.mjs` — CLI, exit 1 on any failing finding
  (`--json` supported). Warnings never fail the build.
- `scripts/generate-research-index.mjs` — writes `docs/research/README.md`
  (one row per topic: current file, question, date, superseded count; plus a
  historical table). `--check` exits 2 on drift, same pattern as
  `regenerate-coverage-matrix-summary.mjs`. `check-research.mjs` calls this
  in `--check` mode too, so a stale README fails `research:check` directly.
- `scripts/research.test.mjs` — 31 node:test cases, each planting one failure
  mode in a throwaway git repo (`mkdtemp` + `git init` + `git add -A`,
  mirroring `check-project-context.test.mjs`'s pattern) and asserting it
  fails unfixed / passes fixed. Covers every failure mode the plan lists,
  plus the index generator's `--check`, plus a positive smoke test against
  the real committed `docs/research/`.
- `package.json`: `research:check`, `research:test`, `research:index`.
- `.github/workflows/ci.yml`: `npm run research:check` and
  `npm run research:test` added immediately after `programs:test`, with a
  two-line comment matching the neighbouring entries.
- `docs/company/IDEAS.md` — append-only inbox, line shape documented in a
  fenced example (the checker skips fenced blocks and any line not starting
  `- <digit>`, so the documentation itself isn't checked as data). Empty:
  `docs/company/DECISION-QUEUE.md` was grepped for "someday"/"idea:"/"maybe
  later" and had zero matches, so nothing was moved into it.
- Identical paragraph ("Research and ideas — where each one lives") in
  CLAUDE.md (`###`) and AGENTS.md (`##`), placed under "Program register —
  where multi-batch work resumes" and before "Session contract", body
  byte-identical (verified programmatically).
- Renamed the three legacy `payee-assurance-*-YYYY-MM-DD.md` files to the
  dated `YYYY-MM-DD-payee-assurance-*.md` form via `git mv` (listed in the
  migration table below), so the filename rule has no exceptions.
- Front matter added to all 37 files. Bodies untouched except two single-line
  fixes described below.
- Inventory regenerated: `git add -A && npm run context:generate && git add -A`;
  `node scripts/check-project-context.mjs --json` → `{"mode":"warning-only","findings":[]}`.

## Two body edits (disclosed deviation from "bodies untouched")

The plan says bodies stay untouched during migration. Two lines in two files
contained a markdown link to a file **outside the git repository** (the
assistant's Claude Code project-memory directory under
`.claude/projects/.../memory/`), which is inherently unresolvable and
untracked. Rather than leave the new checker permanently red on a pre-existing
defect neither the plan nor the contract anticipated, both were de-linked
(markdown link syntax removed, exact same visible text kept, nothing else on
the line touched):

- `docs/research/2026-04-27-screening-coverage-empirical.md` line 137 —
  `[project_dilisense_reseller_status.md](../../)` → plain text
  `` `project_dilisense_reseller_status.md` ``.
- `docs/research/2026-04-28-payee-assurance-build-vs-buy.md` line 218 —
  `[...](../../../../.claude/projects/.../project_dilisense_reseller_status.md)`
  → plain text with a note that it's outside the repo.

Everything else — all prose, all other links, all `**Date:**`/`**Status:**`
lines — is unchanged.

## Migration table (37 files)

`type` legend: market, competitor, positioning, product, user, vendor,
registry. `status` is `current` unless noted. Files renamed by `git mv` this
session are marked with the old name.

| file | type | topic | status | supersedes / superseded_by | question |
|---|---|---|---|---|---|
| 2026-04-21-us-company-registry-and-ein-research.md | market | us-company-registry-ein-research | current | — | What registry and EIN/tax-ID data sources exist for covering US private companies under Payee Assurance v1.1? |
| 2026-04-22-payee-assurance-pricing-benchmark.md *(renamed from `payee-assurance-pricing-benchmark-2026-04-22.md`)* | competitor | payee-assurance-pricing-benchmark | **superseded** | superseded_by: 2026-04-28-payee-assurance-apples-to-apples-benchmark.md | What per-call flat price should Payee Assurance v1 launch at, based on COGS floor and a 25-vendor competitor comparison? |
| 2026-04-22-payee-assurance-two-tier-pricing.md *(renamed from `payee-assurance-two-tier-pricing-2026-04-22.md`)* | product | payee-assurance-two-tier-pricing | current | — | Should Payee Assurance charge as a two-tier (onboarding + monitoring) product or a flat per-call price? |
| 2026-04-27-gleif-coverage-by-country.md | registry | gleif-lei-coverage-by-country | current | — | How many active LEIs does GLEIF report per target country, for v1 jurisdiction coverage planning? |
| 2026-04-27-screening-coverage-empirical.md | vendor | screening-coverage-empirical | current | — | What is the real-world hit rate and coverage of Strale's PEP, sanctions, and adverse-media screening across v1/v1.1 jurisdictions? (cited by active DEC-20260427-A, DEC-20260427-B) |
| 2026-04-28-india-kyc-kyb-data-landscape.md | market | india-kyc-kyb-data-landscape | current | — | Does India's KYC/KYB data landscape clear Strale's Tier-2 scraping doctrine well enough to ship as Payee Assurance v1.5? |
| 2026-04-28-litigation-bankruptcy-data-sources.md | vendor | litigation-bankruptcy-data-sources | current | — | Which litigation/bankruptcy data vendors can supply a Tier-2-compliant, PAYG leg for Payee Assurance v1.1? |
| 2026-04-28-payee-assurance-apples-to-apples-benchmark.md *(renamed from `payee-assurance-apples-to-apples-benchmark-2026-04-28.md`)* | competitor | payee-assurance-pricing-benchmark | current | supersedes: 2026-04-22-payee-assurance-pricing-benchmark.md | What is the correct per-call price anchor for Payee Assurance v1 when benchmarked only against genuinely comparable competitor APIs? |
| 2026-04-28-payee-assurance-build-vs-buy.md | product | payee-assurance-build-vs-buy | current | — | Which Payee Assurance legs should Strale buy PAYG versus build/ingest directly? (cited by active DEC-20260428-B) |
| 2026-04-28-ubo-aggregators-non-openownership-eu.md | vendor | ubo-aggregators-non-openownership-eu | current | — | Is there a Tier-2-compliant, PAYG, embed-and-bill UBO data path for the eight EU jurisdictions not covered by free OpenOwnership sources? |
| 2026-04-28-us-business-data-vendor-longlist.md | vendor | us-business-data-vendor-longlist | current | — | Which commercial vendor best supplies US private-company identity data on a PAYG reseller-rights basis? (cited by active DEC-20260428-A) |
| 2026-04-28-us-ein-match-cheaper-alternatives.md | vendor | us-ein-match-cheaper-alternatives | current | — | Are there vendors or free-data ingest paths cheaper than Liberty Data/EINsearch for EIN-to-name matching? |
| 2026-04-28-vat-coverage-empirical.md | vendor | vat-coverage-empirical | current | — | What is the real-world success rate of Strale's vat-validate capability against VIES per target country? |
| 2026-04-29-be-kbo-open-data-ingest-spec.md | product | be-kbo-open-data-ingest-spec | current | — | What is the design/registration spec for first-party ingest of the Belgian FPS Economy KBO Open Data feed? |
| 2026-04-30-gap8-free-registry-apis.md | registry | eu-gap8-registry-api-audit | **historical** | — (see judgment call below) | Which of the eight Gap-8 EU registries (HU, SI, BG, RO, LU, SK, MT, CY) expose a free per-entity lookup API? |
| 2026-05-06-bundesapi-civic-tech-audit.md | vendor | bundesapi-civic-tech-audit | current | — | Is the bundesAPI civic-tech stack a credible fallback for DE Counterparty Assurance? |
| 2026-05-06-compass-manz-at-vendor-diligence.md | vendor | at-compass-manz-vendor-diligence | current | — | Which Austrian BMJ-licensed Verrechnungsstelle should Strale re-engage: Compass, Manz, or a third candidate? |
| 2026-05-06-live-registry-coverage-audit.md | registry | live-registry-coverage-audit | current | — | Do Strale's 16 live European registry capabilities return a working response against a known-good test entity? |
| 2026-05-06-mt-registry-build-path.md | registry | mt-registry-build-path | current | — | What is the build path for Malta's registry now that MBR has launched paid API packages? |
| 2026-05-06-openapi-com-phase-b-production.md | vendor | openapi-com-production-eval | current | — | Which countries does Openapi.com's production API cover, at what depth and latency? |
| 2026-05-06-openapi-com-sandbox-test.md | vendor | openapi-com-sandbox-eval | current | — | Does Openapi.com's sandbox API return usable data across target countries, and at what success rate? |
| 2026-05-06-ro-registry-build-path.md | registry | ro-registry-build-path | current | — | What is the build path for ingesting Romania's ONRC company register? |
| 2026-05-06-si-registry-build-path.md | registry | si-registry-build-path | current | — | What is the build path for ingesting Slovenia's AJPES business register? |
| 2026-05-06-sk-registry-build-path.md | registry | sk-registry-build-path | current | — | What is the build path for Slovakia's registry, given the corrected free api.statistics.sk RPO endpoint? |
| 2026-05-07-at-registry-build-path-verify.md | registry | at-registry-build-path-verify | current | — | Does the chosen AT registry data path still hold up under a fresh technical-viability probe? |
| 2026-05-07-bg-registry-build-path.md | registry | bg-registry-build-path | current | — | What is the build path for ingesting Bulgaria's BRRA commercial register open data? |
| 2026-05-07-cy-registry-build-path.md | registry | cy-registry-build-path | current | — | What is the build path for ingesting Cyprus's DRCOR company registry open data? |
| 2026-05-07-dk-phase2-understand.md | product | dk-cvr-breaker-false-recovery-investigation | current | — | Why did the danish-company-data circuit breaker appear stuck open, and what does Phase 2 establish? |
| 2026-05-07-es-registry-build-path-verify.md | registry | es-registry-build-path-verify | current | — | Does the chosen ES registry data path still hold up under a fresh technical-viability probe? |
| 2026-05-07-gap-recovery-synthesis.md | registry | eu-gap-recovery-synthesis | current | — | Across the LU/BG/CY/HU gap-recovery spikes, which countries close as Tier-1 self-build and which stay in gap? |
| 2026-05-07-hu-registry-build-path.md | registry | hu-registry-build-path | current | — | What is the build path for Hungary's registry given no free API and fixed-cost-only wrappers? |
| 2026-05-07-it-registry-build-path-verify.md | registry | it-registry-build-path-verify | current | — | Does the chosen IT registry data path still hold up under a fresh technical-viability probe? |
| 2026-05-07-kyckr-evaluation.md | vendor | kyckr-evaluation | current | — | Is Kyckr a viable primary fallback or parallel gap-closer, given its published terms? |
| 2026-05-07-lu-registry-build-path.md | registry | lu-registry-build-path | current | — | What is the build path for Luxembourg's LBR registry given no free API? |
| 2026-05-07-nl-registry-build-path-verify.md | registry | nl-registry-build-path-verify | current | — | Does the chosen NL registry data path (Company.info) still hold up, versus the KVK direct API? |
| 2026-05-07-pt-registry-build-path-verify.md | registry | pt-registry-build-path-verify | current | — | Does the chosen PT registry data path still hold up under a fresh technical-viability probe? |
| 2026-05-08-belgian-company-data-parity-audit.md | product | belgian-company-data-parity-audit | current | — | Does belgian-company-data meet the four parity questions raised against Topograph's BE catalog? |

## Judgment calls (please review)

1. **The "registry coverage 2026-04-27 → 2026-05-06" family named in the plan
   could not be matched to a real pair.** I checked every file dated near
   those two dates. The nearest candidates —
   `2026-04-30-gap8-free-registry-apis.md` (not 04-27; closest by topic) and
   `2026-05-06-live-registry-coverage-audit.md` — address different questions
   (which *ungapped* registries have a free API, vs. whether Strale's
   *already-live* capabilities work) and neither's body claims to replace the
   other. I did not force a supersession link here. If the plan meant a
   specific pair I'm not seeing, please name it.

2. **`2026-04-30-gap8-free-registry-apis.md` is `historical`, not
   `superseded`, and is not named in anyone's `supersedes`.** Its own body
   explicitly says two different successors partially superseded it —
   `2026-05-06-mt-registry-build-path.md` ("partially superseded") and
   `2026-05-06-sk-registry-build-path.md` ("supersedes for SK") — but it
   covers 8 countries in one file, and 4 of those 8 later got their own
   build-path memo (MT, RO, SI, SK dated 05-06; BG, CY, HU, LU dated 05-07),
   while HU/LU never closed. The schema's `superseded_by` is a single file
   name (by design, so `check-research.mjs` can enforce a strict reciprocal
   pair) and can't represent "partially superseded, piecemeal, by four
   different narrower documents." Marking it `historical` — no active
   successor claim, own topic, doesn't collide with the one-current-per-topic
   rule — was the closest fit the schema allows. The eight narrower memos
   remain `current` on their own per-country topics and are not linked back
   to it via `supersedes` (linking would trip the reciprocity check, since
   gap8's `status` isn't `superseded`).

3. **"build-path files → their `-verify` successors" (the plan's third named
   family) does not exist as a same-country pair inside these 37 files.** The
   `-build-path.md` files (MT, RO, SI, SK, BG, CY, HU, LU) and the
   `-build-path-verify.md` files (AT, ES, IT, NL, PT) cover **disjoint**
   country sets — no country has both. The `-verify` files instead trace back
   to DEC-20260427-I sub-decisions and a "memory line," not to a research
   file in this corpus, so there is no predecessor to point `supersedes` at.
   I left all 13 as `current`, each on its own per-country topic. If this
   family was meant to describe something else (e.g. treating each `-verify`
   file as superseding a same-country vendor-diligence file — I considered
   `2026-05-06-compass-manz-at-vendor-diligence.md` →
   `2026-05-07-at-registry-build-path-verify.md` as a candidate, since both
   are AT and sequential — but they answer different questions, vendor
   selection vs. technical re-verification of an already-chosen path, so I
   did not force it), please point me at the intended pair and I'll adjust in
   a follow-up.

4. **`type` classification for a few borderline files** was a judgment call:
   `2026-04-27-screening-coverage-empirical.md` and
   `2026-04-28-vat-coverage-empirical.md` are empirical coverage studies of
   Strale's own capabilities against upstream vendors/services — classified
   `vendor` rather than `product`, on the theory that the finding is really
   "how good is the upstream data source," not "how should the product work."
   `2026-05-07-dk-phase2-understand.md` is a bug/circuit-breaker
   investigation, not market/vendor/registry research in the usual sense —
   classified `product` as the closest fit in the five-plus-two type enum.
   Open to relabeling any of these.

5. **`docs/company/DECISION-QUEUE.md` had no "someday"/idea section** (grepped
   for "someday", "idea:", "maybe later" — zero matches), so `IDEAS.md` ships
   empty rather than seeded from anything.

## Verification run this session

- `npm run research:check` → `ok research contract` (37 files checked, 5
  warnings for `docs/strategy`/`docs/audits` files that look like research —
  listed for a later migration batch, not failures).
- `npm run research:test` → 31/31 pass.
- `npm run programs:check` → ok.
- `npm run programs:test` → 30/30 pass.
- `node scripts/check-project-context.mjs --json` → `{"mode":"warning-only","findings":[]}`.
- `npm run context:test` → 108/108 pass.
- `node scripts/handoff/handoff-check.mjs --no-fetch` → run after this commit
  lands (see below).

## Not done / out of scope (per the plan)

- Did not migrate `docs/strategy`, `docs/audits`, `docs/diligence`
  research-looking files into the contract (warnings only, named for a later
  batch).
- Did not touch `docs/programs/cto-readiness/tracks.yaml` — the caller's
  instruction was explicit that this session does not edit it.
- No decision record created (not requested; nothing here changes product
  direction — it's a documentation/tooling contract).
