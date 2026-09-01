---
doc_type: session-plan
authority_scope: none
status: agreed
complete: true
phase: M2
authority_active: false
created_at: 2026-09-01
owners:
  - codex
reviewed_by:
  - codex-gpt-5.6-sol
review_route: codex-fallback-after-claude-timeouts
review_meaning: technical-migration-review-not-founder-approval
---

# M2 vendor-evaluation decision and methodology plan

> [!CAUTION]
> **M2 TECHNICAL MIGRATION PLAN — NOT ACTIVE PROJECT AUTHORITY.**
> This plan preserves an existing Decision and its evolving methodology source.
> It does not activate a repo-native vendor-evaluation protocol, authorize
> production calls, contact a vendor, create an account, accept terms, make a
> commercial commitment, change vendor routing, or authorize M4 cutover.

## Recommendation

Migrate `DEC-20260511-D` as one collision-free inactive decision record and
preserve the separate **Vendor Evaluation Methodology v1.0** as a complete M2
evidence/gap report. Do not promote the methodology page itself to a second
Decision and do not create its future executable protocol body during M2.

This separation is source-faithful:

- the Decision establishes the durable pointer rule: vendor evaluations that
  involve production endpoint calls must follow the current methodology;
- the methodology is a versioned operational playbook expected to evolve
  without rewriting the Decision for routine changes; and
- the agreed migration architecture reserves canonical full protocol bodies,
  router entries, coverage mappings, and fail-closed guards for M3, followed by
  one authority cutover in M4.

The batch is load-bearing because production-call vendor evaluations can spend
money, produce false coverage claims, or select an unusable upstream. The live
rule exists in Notion, but neither `AGENTS.md`, `CLAUDE.md`, the protocol router,
nor a repo workflow currently routes a new vendor evaluation through it.

## Exact live sources

An exact query of the live Strale Decisions data source returned one row for
`DEC-20260511-D` and no duplicate. The ID is absent from
`docs/decisions/id-collisions.yaml` and the current formal-record directory.

| Source | Identity | Source role | Observed state |
|---|---|---|---|
| [Decision](https://app.notion.com/p/35d67c87082c81299957e2884a40d69e) | `DEC-20260511-D` | formal decision body | active, global, medium confidence, dated 2026-05-11, not superseded |
| [Vendor Evaluation Methodology v1.0](https://app.notion.com/p/35d67c87082c819f9cecd689c6fa5d10) | standalone Infrastructure page | evolving operative content named by the Decision | v1.0, last edited 2026-05-11 |
| [Working Rules](https://app.notion.com/p/33c67c87082c81ca91c7f5bfdccea5a2) | Rule H | implementation and claimed enforcement description | points to the methodology and names `DEC-20260511-D` |
| [Openapi workstream close](https://app.notion.com/p/35d67c87082c810da042f2d768702b55) | Journal evidence | empirical origin and closeout context | decision-context, dated 2026-05-11 |

The Decision row's `Source` property points to the methodology page. That is
intentional: the Decision is the structural anchor and the separate page owns
the detailed, evolving rules. The two pages must remain distinct in the
migration evidence.

## Proposed decision record

Create `docs/decisions/records/DEC-20260511-D.md` with:

- `record_key` and `id`: `DEC-20260511-D`;
- title: require production vendor evaluations to follow an evolving empirical
  methodology;
- historical `status: active`, `scope: global`, and
  `decided_at: 2026-05-11`;
- required migration attribution `owner: petter`;
- topic `vendor-evaluation`;
- no typed relations; and
- the standard inactive M2 fields and visible warning.

The live Decisions schema has no owner property. `owner: petter` is therefore
the decision-system's required migration attribution, based on the founder-made
global governance Decision, not a claim that the source row contained an owner
field.

The record's evidence list will contain these exact values:

1. `https://app.notion.com/p/35d67c87082c81299957e2884a40d69e`
   — primary formal Decision source;
2. `https://app.notion.com/p/35d67c87082c819f9cecd689c6fa5d10`
   — referenced evolving methodology;
3. `https://app.notion.com/p/33c67c87082c81ca91c7f5bfdccea5a2`
   — Working Rules Rule H implementation evidence;
4. `https://app.notion.com/p/35d67c87082c810da042f2d768702b55`
   — empirical-origin/workstream-close Journal evidence;
5. `https://github.com/strale-io/strale/commit/e04601e2f143c4efbb08a84282b6543b7ff46944`;
6. `docs/research/2026-05-06-openapi-com-sandbox-test.md`; and
7. `docs/research/2026-05-06-openapi-com-phase-b-production.md`.

Items 5–7 are partial underlying test evidence, not a complete copy of the
later methodology or corrected six-example corpus.

No relation will be invented to `DEC-20260518-E` or `DEC-20260518-G`. Those
records govern exhaustive country/source enumeration and paid-aggregator fee
probes. They are operationally adjacent and a future workflow may route both,
but the `DEC-20260511-D` source does not name either record and predates them.

The record's five protected sections will preserve only the immutable pointer
contract:

1. any vendor evaluation involving production endpoint calls must load and
   follow the then-current version of the referenced methodology;
2. the methodology is a separate, versioned operational artifact that may
   evolve routinely without rewriting this Decision; and
3. only a structural change to that Decision-methodology relationship requires
   an amending or superseding Decision.

The four empirical rules, phases, examples, preflight shape, and chat-artifact
lesson are deliberately excluded from the immutable record. They belong in the
dated M2 evidence report and, after reconciliation, the mutable versioned M3
protocol body.

## Methodology evidence to preserve

Create
`archive/sessions/2026-09-01-m2-vendor-evaluation-methodology-source-gaps.md`
as evidence, explicitly non-authoritative. It will preserve the complete
operational shape needed to write the M3 protocol without depending on chat
memory:

### Four empirical rules

1. **Sandbox limits.** Sandbox calls verify authentication and wire shape only.
   Coverage and depth conclusions require bounded production evidence.
2. **Cross-source identifier verification.** Before each entity-specific
   production call, verify the legal entity identifier with at least two
   independent sources: the entity's own legal/imprint source plus an
   independent registry or regulator. Record both sources.
3. **Vendor-claim extension.** Independently retest vendor-representative claims
   about identifier or endpoint coverage. A plausible vendor answer does not
   clear the evidence gate.
4. **Cross-source domiciliation verification.** Confirm that the tested legal
   entity is domiciled in the target jurisdiction, rather than merely operating
   or branding there, using the national register or the entity's legal page.

### Phased evaluation shape

- **Phase 1 — discovery and sandbox:** enumerate endpoints, tiers, identifiers,
  authentication, and wire shapes; draw no coverage conclusion.
- **Phase 2 — production coverage:** use independently verified fixtures,
  measure a predefined required-field set, document HTTP/wire/format outcomes,
  and record actual spend.
- **Phase 3 — targeted retests:** retest surprising, empty, or disputed results
  with alternative identifiers or tiers; apply the vendor-claim extension.
- **Phase 4 — gap/fallback verification:** test unverified coverage breadth and
  fallback tiers instead of extrapolating marketing claims.
- **Closeout:** consolidate findings into durable repo evidence, vendor state,
  and any affected capability/routing surfaces in one reviewable change. Do not
  treat an ephemeral chat report as the closeout artifact.

### Evidence and preflight contract

Before paid calls, preserve:

- exact evaluation scope, endpoints, countries, tiers, and required fields;
- fixture identity, two identifier sources, domicile source, and expected
  entity before any call;
- per-call and total estimated cost, maximum call count, stop conditions, and
  current budget-envelope check;
- whether the credentials, account, terms, contact, licence, or commercial
  authority already exist; and
- explicit verdict logic for pass, fail, inconclusive, and retest.

After calls, preserve response outcomes, observed fields, latency, errors,
actual cost, fixture mismatches, claim contradictions, and the final verdict.
Production secrets and personal data must not be copied into the evidence.

### Worked-example lessons

The M2 evidence report will retain the lessons, not freeze historical vendor
facts as current truth:

- a sandbox response can be an endpoint fixture for a different entity;
- a plausible VAT or registration number can resolve to a subsidiary rather
  than the intended parent;
- a branded entity can be legally domiciled elsewhere;
- an unverified identifier can turn a valid vendor response into a false pass;
  and
- a vendor representative's asserted positive result can fail repeated
  production retests.

Named entities, prices, endpoint behavior, and vendor terms from May 2026 are
dated evidence and must be rechecked when used.

The source contains a count inconsistency that must remain visible rather than
being silently normalized: the workstream-close Journal and one methodology
sentence say **five** worked examples, while the methodology's numbered archive,
its version note, the formal Decision, and Working Rules Rule H identify
**six**. The evidence report will preserve the six enumerated lessons and mark
the two "five" references as stale source wording.

## Reconciliation with later authority

Literal promotion of the May page would conflict with later operating rules in
four places. The candidate and evidence report must reconcile them explicitly.

### 1. Founder confirmation versus delegated technical execution

The historical methodology tells each production-call prompt to print an
estimate and ask `Proceed? (yes/no)`. Under the current operating charter,
technical evaluation design and spend inside the existing EUR 50/week envelope
are agent decisions. The durable M3 form should therefore require a recorded
preflight and autonomous go/no-go inside existing authority, not a technical
question to the founder.

The gate still holds where new authority is required. Creating an account,
accepting terms, contacting a vendor, negotiating or signing a licence, making
a recurring commitment, or representing Moonlighter AB is founder-reserved.
In that case the evaluation stops as `AUTHORIZATION_UNAVAILABLE`; the agent
prepares the recommendation and exact authority request without acting.

### 2. Historical budgets are heuristics, not standing authority

The methodology's approximately EUR 5, 50–60-call, one-day figures are the
observed Openapi-era shape. They may seed an estimate but do not replace the
current weekly budget, fresh pricing, per-call caps, or a task-specific stop
condition. M3 must route current budget authority rather than freezing those
figures into doctrine.

### 3. Notion update instructions are pre-cutover behavior

The page says routine methodology updates land directly on the Notion page and
that canonical artifacts live in Notion or on disk. During M2 those instructions
remain historically operative because cutover has not happened. At M4 they must
be replaced atomically by a versioned repo protocol, review/guard path, and
repo-native history. The durable lesson remains that ephemeral chat artifacts
are never authority.

### 4. Legal and sourcing gates remain separate

This methodology verifies evidence quality; it does not grant legal authority,
redistribution rights, scraping permission, or a vendor commitment. Active
sourcing doctrine, customer-data boundaries, and the Charter can still veto a
technically successful evaluation.

## Current implementation and enforcement gap

The repo contains the underlying Openapi sandbox/production reports, landed by
commit `e04601e2f143c4efbb08a84282b6543b7ff46944`, and a `vendor-switch` skill
for the different operation of replacing an already selected upstream. Those
artifacts do not route or enforce a new-vendor production evaluation.

Current gaps to record:

- no `DEC-20260511-D` formal candidate exists;
- no entrypoint or protocol router triggers the methodology;
- no canonical full body exists under `docs/governance/protocols/`;
- no coverage manifest maps the trigger, Decision, body, and read-back;
- no fail-closed preflight schema/check validates fixture sources, domicile,
  cost/call caps, stop logic, or authority state before paid calls;
- no controlled evaluation launcher, credential-release boundary, or call
  ledger currently makes all production vendor-evaluation calls observable;
- the claimed Working Rules enforcement is a checklist on the same Notion page,
  not a merge-blocking prompt template or guard;
- the claimed read-back is a Journal reference that can be omitted without any
  repository failure;
- the methodology page lacks the governance header required by its own Working
  Rule B; and
- `vendor-switch` still contains pre-cutover Notion instructions and cannot be
  mistaken for the missing evaluation protocol.

M3 must first inventory every production vendor-evaluation entrypoint and then
create or designate a controlled launcher/credential gate that requires an
accepted preflight before releasing credentials or issuing calls. Only paths
behind that boundary can be described as fail-closed. M3 should then create the
bounded protocol body, router/coverage entries, durable evaluation artifact
schema/template, and a read-back that reconciles accepted preflight, observed
calls, and closeout evidence. Any remaining external or manual path must be
reported as partial coverage rather than represented as enforced. M4 should
switch entrypoints and remove the Notion dependency only after that coverage is
explicit and accepted.

## Implementation files

After plan review, the implementation commit will contain only:

- `docs/decisions/records/DEC-20260511-D.md`;
- the methodology source/gap report named above;
- this plan, updated with review outcome;
- `archive/sessions/2026-09-01-m2-claude-verification-backlog.md`, updated if
  Claude remains unavailable;
- generated `docs/project/DECISIONS.md`; and
- generated `docs/project/legacy-authority-inventory.json`.

No entrypoint, skill, runtime, workflow, vendor route, Notion source page, or
production environment will change.

## Validation and review gates

1. Route this plan first to Claude Opus/high, then Sonnet/high only after a real
   provider failure. If the weekly limit remains, use one fresh
   `gpt-5.6-sol`/xhigh Codex verifier under the founder-authorized fallback and
   keep the cross-provider review on the backlog.
2. Resolve every HIGH or MEDIUM source-fidelity, authority, or sequencing
   finding before implementation. Record accepted LOW findings explicitly.
3. Implement with `apply_patch`, then run:
   - `npm run context:generate` twice and require a clean second run;
   - `npm run context:test`;
   - `npm run context:check -- --json`; and
   - `git diff --check`.
4. Commit the exact implementation and attempt Claude exact-commit review with
   the same provider route. If unavailable, use a fresh Codex xhigh reviewer.
5. Open and merge the implementation PR only after required GitHub checks pass.
6. Create one linked Journal entry without editing either source page.
7. Add a closeout review/handoff commit, independently review that exact commit,
   merge its PR after green checks, then prove both branches are ancestors of
   `origin/main` before deleting them and removing the temporary worktree.

## Stop conditions

Stop and revisit the plan if evidence shows an ID collision, a superseding
Decision, a later methodology version, a current routed enforcement mechanism,
or a source instruction that would require an M2 authority activation. Do not
silently reinterpret a legal, commercial, or founder-reserved boundary as a
technical migration choice.

## Plan-review outcome

Claude Opus/high was attempted first and timed out after 134 seconds without a
verdict. Claude Sonnet/high was then attempted after that provider failure and
timed out after 104 seconds without a verdict. Under the founder-authorized
fallback, a fresh `gpt-5.6-sol`/xhigh Codex reviewer performed the independent
plan review.

The reviewer found two MEDIUM and three LOW issues in the first draft:

- mutable methodology content had been copied into the proposed immutable
  Decision record;
- the future guard assumed arbitrary production calls were observable despite
  the absence of a controlled launcher or credential-release boundary;
- the intended evidence values were not explicit;
- the source's five-versus-six worked-example inconsistency was not recorded;
  and
- `owner: petter` was presented as historical source data despite the live
  Decisions schema having no owner field.

The plan now keeps the Decision record to the pointer/evolution relationship,
requires M3 to establish the controlled execution boundary before claiming
fail-closed enforcement, lists the exact evidence, preserves the count
inconsistency, and identifies owner as migration attribution. The same reviewer
re-read the amended plan and returned **PASS with no residual findings**. This
same-provider result permits inactive M2 documentation work under the standing
fallback, but does not clear the cross-provider backlog before M4 activation.

## Implementation outcome

Implementation commit `2102891ceec38ca9894a88e97ca93466b8e985c8`
landed through [PR #471](https://github.com/strale-io/strale/pull/471) and
merged as `01eb86113e96c8f2e40d8a56d4d055e6e2f4e036` after both required
GitHub jobs passed.

The implementation created the one inactive pointer Decision and the separate
methodology source/gap report, updated the Claude backlog, and regenerated the
decision index and legacy-authority inventory. It did not modify an entrypoint,
protocol, skill, runtime, vendor route, credential, production environment, or
Notion source page.

Fresh Claude Opus/high and Sonnet/high exact-commit attempts timed out after 94
and 74 seconds without a verdict. A different fresh
`gpt-5.6-sol`/xhigh reviewer checked the exact six-file commit against the live
Notion sources, current Charter, migration architecture, router, vendor-switch
skill, E/G records, and historical evidence. It reran the repository checks and
returned **PASS with no HIGH, MEDIUM, or LOW findings**. The cross-provider gate
remains backlogged before M4.

Verification:

- `npm run context:generate` — reproducible;
- `npm run context:test` — 54/54 passed;
- `npm run context:check -- --json` — zero findings;
- exact-commit `git diff --check` — passed; and
- GitHub `check` and `integration-db` — passed.

The linked closeout Journal entry is
[M2 vendor-evaluation pointer and methodology evidence migrated](https://app.notion.com/p/3ce67c87082c8127bcf4fe305029d828?pvs=204).
Fetch-back confirmed its merge refs, verification, gaps, and inactive-authority
wording. The source Decision and methodology retained their 2026-05-11 edit
timestamps.
