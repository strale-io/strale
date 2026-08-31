---
doc_type: audit-report
authority_scope: none
status: evidence
audit_id: M2-PRODUCT-STATE-2026-09-01
audited_at: 2026-09-01
backend_ref: c36b8799bd363e034f8f82b4095e875cc5b404ec
frontend_main_ref: 4be8d251b05e0abf6e23a195913c188ae318056e
frontend_redesign_ref: 998964716c8601be67d4e71a508a803160434517
context_pack_evidence_ref: b29510949500ade9c00c4a61912baeb9dc98389a
---

# M2 product and state reconciliation

## Outcome

The founder-supplied context pack is sufficient to populate the repo-native
product layer, but it cannot be promoted verbatim. Its durable product thesis is
well supported; its current-state sections contain several time-sensitive or
scope-sensitive statements that need qualification or replacement.

The decisive corrections are:

1. website source is **checkpointed on a separate redesign branch, not
   reviewed, merged, build-verified, deployed, or live**;
2. the preservation commit already contains more implementation than the pack
   reports and preserves Quiet Material v0.5; the local v0.7 design-system
   candidate is uncommitted, unreviewed, and not a durable authority;
3. #438's operator script is merged while both production values remain
   unapplied;
4. WP10's dated gate now has strong production evidence, while the formal
   package records still say under observation; this warrants a separate
   acceptance review, not silent closure;
5. WP13 is not formally accepted as a whole even though important reachable
   dependency and publishing work shipped;
6. current commercial truth must use the latest completed week, not a partial
   week or the pack's less precise narrative;
7. live counts are generated facts, not prose to copy into a durable product
   document.

No additional founder-authored product/decision audit is missing. This report
is the claim-level evidence reconciliation assigned to Codex and Claude by
`DEC-20260901-A`.

## Scope and non-authority

This is an evidence report. It does not activate the M1 skeleton, replace
`AGENTS.md` or `CLAUDE.md`, retire Notion, accept WP10, execute a production
write, or turn synthesized context-pack `D-*` entries into formal decisions.

The machine-readable companion is
[`2026-09-01-m2-product-state-claim-matrix.json`](./2026-09-01-m2-product-state-claim-matrix.json).
That file records the disposition, qualification, destination, and evidence for
each migratable claim.

## Evidence and method

The context pack was read from its preserved evidence commit
`b29510949500ade9c00c4a61912baeb9dc98389a`. The public main branch retains a
checksums-only evidence manifest at
`archive/sessions/2026-09-01-context-pack-evidence-manifest.json`; the raw pack
is not copied into the public repository.

Authority was resolved by question rather than by one universal hierarchy:

| Question | Decisive evidence |
|---|---|
| Product identity, positioning, ICP, durable goal | Founder pack reconciled with `docs/company/GOALS.md`, the Charter, and actual platform shape |
| Formal decision status | `docs/decisions/records/DEC-*.md`, with historical substance preserved and supersession explicit |
| Backend implementation | Current reviewed `origin/main`, code, tests, and package records |
| Live operational state | Read-only production queries, `/health`, and `/v1/platform/facts` |
| Frontend implementation | Frontend main plus the exact redesign worktree/commit and its working-tree status |
| Commercial performance | Canonical complete-window metrics in `GOALS.md` and the 2026-08-31 brief |
| Remediation acceptance | Package file, package graph, acceptance record, and required production observation together |

Closed issue or PR state was never treated as production reconciliation.
Branch-local implementation was never treated as merged or deployed state.

## Product and commercial reconciliation

### Product identity — accept with qualification

The pack describes Strale as a machine-native capability layer: one connection,
discovery, execution, structured results, and machine-compatible payment. The
repo's durable mission describes Strale as:

> The data layer for AI agents: independently tested, audit-logged data sources,
> purchasable by agents without human ceremony.

These are compatible, not competing definitions. The canonical product file
should use the repo mission as the stable identity and use “one connection to
the tools your agent needs” as the clearest product/website expression. It must
not imply that every long-term discovery, authorization, or receipt promise is
already customer-complete.

The following pack claims are supported:

- Strale is agent-first and vertical-agnostic.
- DEC-20260812-A's adopted strategy makes the capability library itself the
  product and x402 the primary machine-payment rail.
- The working wedge is builders/operators of recurring agent workflows that
  need multiple commercial, research, enrichment, and utility capabilities.
- The wedge is evidence-sensitive, not PMF and not the whole company.
- x402 is strategically central to machine-paid access.
- “Pay for successful work” is a product principle. Exact billing guarantees
  remain governed by money-path code, tests, and formal Decisions rather than
  by this product summary.
- “One authority per business fact; many thin consumers” is a durable design
  and operating principle.
- Execution receipts are internal/chained today; no customer-facing signed
  verification product may be claimed.
- WP16 is the next major forward-looking product/technical program, after
  bounded operating-model and reconciliation residuals, beginning with
  containment and a frozen retrieval benchmark.

### Revenue target and current state — accept with fresh numbers

The `$2,000/week` medium-term gross-revenue target is explicit in
`docs/company/GOALS.md`. Operational milestones remain denominated in EUR, with
M4 recorded as approximately EUR 1,850/week.

The latest honest completed-week evidence is the 2026-08-24 ISO week:

| Measure | Reconciled value |
|---|---:|
| External revenue | EUR 73.03 |
| Calls | 1,295 |
| Payer identities | 13 |
| Material buyers | 4 |
| Largest-buyer share | 76.0% |
| Returning non-top buyers | 3 |

The prior completed week was EUR 66.31 on 1,000 calls, five payer identities,
96.4% largest-buyer share, and no returning non-top buyers. This supports a
real, comparable improvement in concentration, but not the M1 bar and not PMF.
The phrase “thirteen customers” would be misleading: nine identities spent less
than one euro combined.

PR #443 fixed the report path that had incorrectly answered buyer questions
using Monday's partial week. Canonical state must cite completed windows and
must not restore the invalid “one current buyer” conclusion.

The observed entry paths through `address-geocode` and `image-to-text`, plus the
card buyer's use of `competitor-compare`, support demand-following over automatic
KYB expansion. They do not retire the compliance wedge. The settled no-outreach
position for the card buyer also remains in force and follows the Charter's
customer-data boundary.

The current distribution program is therefore not “submit to every directory.”
It is task-oriented machine discovery, accurate x402 catalogue metadata,
high-quality contracts, targeted marketplace corrections, and measurement of
meaningful new-buyer entry paths and repeat behavior.

## Website and design reconciliation

### Three states must remain separate

| Layer | Ref/state | Meaning |
|---|---|---|
| Frontend main | `4be8d251b05e0abf6e23a195913c188ae318056e` | Clean tracked tree except an unrelated user-owned untracked OG image; no Homepage v2/design-system files found on main |
| Redesign preservation commit | `998964716c8601be67d4e71a508a803160434517` | Source-present, committed, and pushed; explicitly not reviewed, accepted, merged, built/verified, deployed, or live |
| Redesign working tree | modified tracked files plus roughly 36 MB of untracked design-system/docs/assets | Newer ongoing work; evidence and candidates under review, not a stable ref |

`/homepage-v2` is source-present as a no-index preview on the redesign branch
and has not replaced the existing homepage. No successful build or deployed
preview was established by this audit. The pack's use of “implemented” is safe
only when expanded to the exact state: source-present in a preservation commit,
unreviewed, unmerged, undeployed, and non-live.

The pack's section inventory is already stale. The preserved
`998964716c8601be67d4e71a508a803160434517` version of `HomepageV2.tsx` already
renders:

1. Header
2. Hero
3. How Strale Works
4. Use Cases

The remaining proposed sections are not rendered there: Featured Tools,
Developers/x402, Reliability, Pricing/Access, closing CTA, and footer.

### Design-system truth

Quiet Material is the selected marketing-website direction. The durable
preservation commit identifies **Quiet Material foundation v0.5**. The local
working tree calls a newer candidate **v0.7**, but those files are modified or
untracked: v0.7 has no stable ref, hash manifest, review, merge, build, or
deployment evidence. It is useful design evidence and a preservation priority,
not versioned authority to migrate into the canonical project layer.

`docs/company/DESIGN-SYSTEM.md` in the backend repo governs internal operational
reports. It is not the marketing website design system. The canonical project
layer must distinguish these two scopes by name and owner rather than merging
them into one “design system” truth.

The public-domain choice remains unresolved for irreversible infrastructure
purposes. The pack records both `strale.dev` and `strale.io` as owned and says
to confirm before migration. This is a founder-reserved public-brand decision,
not a technical default.

## Backend, production, and remediation reconciliation

### Live product and authority boundary

Strale is a live production system with externally paid calls; the completed
commercial-window evidence above is the durable support for that statement.
It must not be strengthened into PMF or broad customer adoption.

The production authorization boundary is also current and must survive the
repo migration: autonomous/local access is read-only, operator DML uses the
restricted write role with an ephemeral per-command credential, no standing
write secret belongs in repo or `.env`, and the founder signing key remains
absent unless explicitly activated. A prepared script does not create
authority to execute it.

Trusted npm publishing is established through OIDC and the MCP incident is
closed in the published follow-up artifact. External package changes retain a
post-publish production-contract smoke requirement on the actual published
artifact. This delivered distribution work is distinct from declaring the
whole WP13 supply-chain package accepted.

### Live platform snapshot

At `2026-08-31T22:39:16.372Z`, `/v1/platform/facts` reported:

| Generated fact | Value |
|---|---:|
| Active and visible capabilities | 297 |
| Active capabilities including hidden | 304 |
| Catalogued capabilities | 320 |
| Active solutions | 107 |
| Free-tier slugs | 11 |
| Processing region | `us-east4-eqdc4a` |
| Processing jurisdiction | `US` |

`/health` reported `ok` on commit `c36b8799bd36`. These values belong in a
generated/snapshot area of current state, never in stable product prose.

### #438 routing settings — prepared, not safe to call reconciled

The guarded one-shot script on main intends:

- `page-speed-test.avg_latency_ms`: `8000 -> 20000`
- `company-news.avg_latency_ms`: `NULL -> 28734`

A read-only production query on 2026-09-01 found the original values still in
place. The exact query and sanitized result are stored in
[`2026-09-01-routing-latency-production-evidence.json`](./2026-09-01-routing-latency-production-evidence.json).
This is exactly the distinction the future operator-action registry is designed
to preserve: the change is prepared, not executed or reconciled. It remains an
outstanding operator action; this audit performs no write and does not change
the production-credential boundary.

The interim review also found a defect in the script's global “nothing else
moved” proof: its expected post-write digest is recomputed from the current
table after the target mutation, so an unrelated concurrent latency change is
incorporated into both the actual and expected digest. Target-row preconditions
remain useful, but this global check does not prove its claim. The action must
stay prepared until that guard is corrected/reviewed and a separate read-only
post-write reconciliation is stored.

### WP10 — formal status remains under observation; the dated gate needs review

The package, graph, and current-state file still say
`MERGED_DEPLOYED_UNDER_OBSERVATION`, with a seven-day gate due 2026-08-30.
The exact bounded queries and sanitized results are stored in
[`2026-09-01-wp10-production-evidence.json`](./2026-09-01-wp10-production-evidence.json).
They show:

- after the migration-day burst on 2026-08-23, `quality_floor` and
  `capability_promotion` each emitted one `tick_complete` heartbeat per full
  day from 2026-08-24 through 2026-08-31;
- `weekly-sweep` started on 2026-08-30 and is next due 2026-09-06 rather than
  running on each boot;
- the two daily jobs had successful last outcomes and zero consecutive
  failures at query time;
- the live service has deployed beyond WP10 and still retains the durable next
  run times.

This is strong cadence evidence, but it does not prove every gate condition:
the query does not establish the absence of overlapping historical runs, and
coordinator recovery/watchdog signals are application logs rather than rows in
`health_monitor_events`. The formal status therefore remains under observation.
The next bounded technical action is a formal WP10 acceptance review using the
stored cadence evidence plus the correct log source.

### Other remediation claims

Supported as written or with the recorded qualification:

- WP12 remains blocked on VERIFY-IP; trusted-hop behavior must not be guessed.
- WP14 remains founder/legal blocked despite shipped privacy/sanitisation work.
- WP9's transaction-linkage residual is non-blocking; historical facts must not
  be rewritten to make linkage non-null.
- WP15 retains the bounded unique-temporary-database CI residual.
- WP17 remains a narrow executed capability-state attribution program: who,
  when, and under what authority.
- `operator-actions.yaml` separately owns prepared, executed, reconciled, and
  cancelled lifecycle for operator actions, including actions that have not
  produced a database change yet.
- the resource-safety family is complete enough to end open-ended sweeping,
  while maintaining guards and avoiding global-memory overclaims.

One pack statement conflicts with the formal graph: the reachable `js-yaml` and
`sharp` paths were fixed and trusted publishing shipped, but WP13 as a whole is
still recorded `NOT_STARTED`, with VERIFY-DEP `PARTIAL` and remaining dependency
and CI scope. Canonical state may say which sub-work shipped; it must not call
the whole package accepted without a separate reconciliation.

The accepted-program inventory must likewise be derived from exact package or
acceptance records. A compact canonical state may summarize accepted work, but
it must link to those authorities and must not turn a broad bootstrap sentence
such as “M0–WP11 broadly accepted” into an independent acceptance authority.

## Operating-model reconciliation

`DEC-20260901-A` makes the founder intent unambiguous:

- the supplied context pack is the complete founder input;
- Codex and Claude own the remaining evidence audit and reconciliation;
- the repo becomes the eventual project system of record;
- Notion retires only after active consumers are replaced and cutover is
  verified;
- no M4 cutover is authorized by the input pack or this audit.

The pack's thin entrypoints are proposals, not files to install verbatim. The
reviewed migration plan keeps the peer-entrypoint goal but adds mandatory
worktree, authority-conflict, protocol-routing, and canonical-update duties.

## Promotion set for the next M2 batch

The following are now safe to populate into the inert M1 skeleton, subject to
independent review of the actual canonical wording:

- `PRODUCT.md`: product identity, ICP/wedge, vertical stance, x402 role,
  commercial target, product principles, receipt qualification;
- `STATE.md`: exact backend/frontend refs, live snapshot timestamp, completed
  commercial window, website branch/live distinction, #438 operator state,
  WP10 acceptance-review state, WP12/WP14 blockers;
- `ROADMAP.md`: operating-model migration, #438 reconciliation, WP10 formal
  acceptance, WP17, WP9/WP15 residuals, WP16, commercial demand mining, and
  website review/build;
- website/brand domain: Quiet Material as the selected direction, v0.5 as the
  durable preservation version, v0.7 as an uncommitted candidate, current
  source-present sections, and explicit separation from the internal report
  design system;
- technical-program domain: accepted programs, qualified residuals, and the
  WP13 conflict;
- operator-action registry: the two #438 rows as one prepared action blocking
  acceptance of that reconciliation;
- pending-decision view: only genuinely founder-reserved unresolved items such
  as an irreversible domain migration or remaining legal gates.

The synthesized `D-*` register remains migration input. Formal decision records
must preserve historical IDs, distinguish founder decisions from agent
recommendations, and undergo contradiction review in bounded topic batches.

## Audit conclusion

M2 is unblocked. The right next step is not another information-gathering task
for the founder. It is a reviewed canonical product/state batch built from the
accepted and qualified claims above, followed by separately reviewed decision
migration. The context pack has done its job: it supplied the product thesis and
the map. This audit supplies the evidence boundaries that make it safe to turn
that map into repo authority.
