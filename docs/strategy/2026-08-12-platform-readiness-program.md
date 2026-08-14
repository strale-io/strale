# Strale — Platform Readiness & Self-Operation Program

**Date:** 2026-08-12
**Status:** ADOPTED 2026-08-12 — DEC-20260812-A (Notion Decisions DB
`3ba67c87-082c-8129-86c6-c35d82bc986f`). All five §4 decisions confirmed by Petter with
suggested defaults; §4 below records the taken values.
**Relationship to prior work:** This is the execution vehicle for Part One of the
2026-08-05 Direction Plan (`docs/strategy/2026-08-05-direction-plan.md`), adopted by the
same DEC (the library is the product; x402 is the primary rail; compliance is a separate
business gated on customer discovery).

---

## 0. Naming what Petter described

The request, in four commitments:

1. **The platform never lies.** Every listed capability does what its listing says,
   proven by real production calls with output values read — not by green local tests.
   Every claim on every surface (catalog, llms.txt, agent-card, homepage, manifests) is
   true. Every data source is used legally and within its license.
2. **The platform runs itself.** With 300+ external integrations, failure is a
   permanent weather condition, not an event. The system must detect, diagnose,
   contain, and where possible repair its own failures, escalating to Petter only for
   genuine judgment calls — and the set of judgment calls must be explicitly enumerated
   and deliberately shrunk over time.
3. **The platform grows itself.** Usage is the roadmap. The system observes what
   agents actually buy and fail to buy, researches adjacent supply, and produces
   ready-to-approve proposals — so the human contribution to growth compresses to
   license and spend decisions.
4. **The platform markets itself to machines.** 92%+ of revenue comes from agents
   paying over x402 with no human funnel. Distribution means being present, legible,
   and verifiably trustworthy in every channel through which an agent discovers a
   supplier.

Suggested program name: **"Readiness"** — one word, and the exit criterion is literal:
the platform is ready to be built on top of.

---

## 1. Where we actually stand (2026-08-12)

Grounding facts, so the program starts from reality:

- **Scale:** 339 executor files, 326 manifests, 39 routes, ~127k LOC in `apps/api/src`,
  **162 scripts**, 77 test files. The scripts count alone is a bloat signal.
- **Revenue reality:** ~€80/mo, 92% via x402; 38+ distinct paying wallets; the embed
  pattern (one agent, one capability, hundreds of calls) is the revenue engine.
- **Reliability reality (90d):** 15% external failure rate, concentrated in three
  structural classes — Browserless scraping, LLM extraction, country registries.
  Charge-on-success has held (€0 billed on failures) — the crown-jewel invariant.
- **The verification lesson, now proven 6+ times:** defects in `domain-contact-extract`,
  registry name search (wrong legal entities), Swiss HTTP method, route schema gates —
  all passed every local gate and were caught only by real production calls.
  Origin content differs by region and User-Agent; local green means little.
- **Known open threads (from 08-09/08-12 handoffs):** `/v1/do` anyOf parity;
  ~45 either/or manifests without declared input contracts; 9 `*-company-data` schemas
  blocking their own name paths; 3 coexisting SEC name-matching policies; `web-extract`
  as an open bypass around per-source ToS policy; 5 stale fixtures; 2 red CI guards on
  main; ~63 files with the fragile `??` alias-chain idiom; danish vendor quota exhausted.
- **Cost reality:** ~170:1 internal-test-to-external-call ratio. The platform likely
  spends more testing itself than serving customers.
- **Tooling that already exists for this program:** `sweep-paid-fixtures.ts` (paid
  fixture verification, budget-conscious, denylisted), `check-platform-facts-drift`,
  shape-contract CI, the `/activity` skill, `failed_requests` + `suggest_log` demand
  signals, circuit breakers on `capability_health`, the onboarding pipeline.

---

## 2. The program — five workstreams

### WS1 — The Truth & Legality Audit ("the very large test")

The single biggest deliverable. A full-catalog disposition, produced by production
evidence, not inspection.

**1a. Production verification sweep.** Every active capability gets at least one real
production call with declared fixtures asserted against actual output values.
*(P0 note: the sweep shipped as `scripts/sweep-prod-catalog.ts` + `build-disposition.ts` —
recurring operator tools until the P3 platform doctor absorbs their role, at which point
they fold into the WS2 script rationalization. The `dishonest-output` class — well-formed
empty success — is NOT detectable by fixture assertions and is deferred to P1, which is
why real-traffic completion sits beside the sweep verdict in every disposition.)*
`sweep-paid-fixtures.ts` is the prototype; it needs (i) a prod-context execution path
(it currently runs locally, where env keys and region-dependent content diverge from
Railway US East), (ii) a per-run budget cap, (iii) the vendor denylist honored (extend,
never empty). Classify every capability: `pass` / `fixture-defect` / `upstream-broken` /
`env-blocked` / `dishonest-output` (well-formed empty success — the
`product-reviews-extract` class).

**1b. Surface truth audit.** Extract every factual claim from the machine-facing
surfaces — `GET /v1/capabilities`, `/x402/catalog`, `/.well-known/x402.json`,
`agent-card.json`, `llms.txt`, manifest descriptions and limitations, homepage, README —
and diff claims against 1a's verified behavior. A catalog entry is a promise; a wrong
`limitations` block is a lie with a price tag. The 08-05 audit already found fabricated
response shapes in agent-facing files once.

**1c. Legal and license audit.** Per capability: data source vs the DEC-20260428-A
three-tier doctrine; PII categories vs the canonical enum and GDPR purpose limitation
(the `email-finder` corpus temptation is the standing case study); ToS blocklist
coverage — including closing the known `web-extract` bypass around per-source policy
limits; vendor terms compliance (Dilisense Starter grace vs embedded-in-bundles use).

**1d. Disposition.** Every capability ends in exactly one bucket: **keep** (verified,
honest, legal) / **fix** (defect identified, worth the work by traffic × margin) /
**quarantine** (delisted from catalog and discovery, reachable by explicit slug with
warning) / **retire**. Accept the count dropping — 230 verified capabilities beat 339
listed ones. Capability count stops being a marketing number.

### WS2 — Architecture right-sizing ("overbuilt / underbuilt / code-not-prose")

**Overbuilt (trim):** finish SQS residue removal (PR2: columns +
`sqs_daily_snapshot`, `capability_health` → `source_health` rename); rationalize the
162 scripts (merge, delete, or promote to CI — a script nobody schedules is prose);
cut test spend to usage-proportional frequency (the 08-05 WS-E targets: piggyback for
high-traffic, weekly for zero-usage, <€100/mo total run cost); deactivated/deprecated
solutions cleanup; consolidate the 3 SEC name-matching policies into
`company-name-match` (officer-search first — it emits personal data).

**Underbuilt (finish):** `/v1/do` anyOf validation parity (reuse
`validateX402Input`, pure by design); the ~45-manifest input-contract campaign
(contracts declared, never inferred — the PR #171 lesson); the 9 blocked registry
schemas (each gated on an executor check first, per the 08-12 handoff); platform-level
input alias handling replacing the ~63 `??`-chain sites; consistent error envelopes
everywhere (every 400 carries `error_code`, `charged:false`, schema, valid example).

**Code, not prose:** inventory every rule that currently lives only in CLAUDE.md or a
protocol document, and for each either (a) build the guard —
CI check, pipeline gate, runtime assertion — or (b) explicitly accept it as judgment
guidance. Precedents exist: drift guard, shape contracts, F-guards, gate 15. The
free-tier count drift (three docs wrong, guard blind to prose) shows why: docs drift,
guards don't. Target: every "MUST" in CLAUDE.md maps to an enforcement point or an
acknowledged exception.

### WS3 — The self-operating platform

Frame it as an **autonomy ladder**; the program's job is climbing it:

- **L0 Detect** (mostly exists): circuit breakers, health probes, scheduler.
- **L1 Diagnose** (build): automatic failure classification on every external failure
  into a fixed taxonomy — upstream outage / vendor quota / schema drift /
  region-or-UA content drift / our bug / bad caller input. Most of the signal already
  lands in `transactions`; the classifier makes it actionable and makes "15% failure
  rate" decompose into named causes.
- **L2 Contain** (build on existing): the quality floor from the 08-05 plan —
  rolling real-traffic completion rate; <70% → auto-quarantine (delist from catalog +
  discovery), <30% → deactivate, auto-promote on recovery. Both directions automatic.
  This is the enforcement backbone of the whole program: after the WS1 sweep sets the
  baseline, the floor keeps it true forever.
- **L3 Repair** (build): a scheduled agent session ("platform doctor") that picks up
  quarantined/failing capabilities, reproduces in prod context, drafts a fix as a PR
  with regression tests, runs the pipeline, and reports. Human action compresses to
  merge review. Safe sub-class (fixture refresh, retry-config, error-message fixes) can
  graduate to auto-merge later — but starts gated.
- **L4 Propose** — WS4 below.

**The escalation contract** (this is how judgment calls get minimized — by writing
them down): the platform acts alone on quarantine/promote, fixture refresh, retries,
delisting, refunds, and draft PRs. It escalates to Petter only for: spending money above
a set cap; new vendor or license questions (the one step DEC-20260428-A history proves
must stay human); pricing changes; deactivating a revenue-earning capability;
anything DEC-20260428-B-grade; publishing new external claims. Everything not on the
escalation list is, by definition, the platform's job.

### WS4 — Growth intelligence (the platform proposes its own roadmap)

The manual prototypes both already ran and both worked: the 08-09 usage analysis found
the email cluster and produced 3 live capabilities; the 08-12 activity analysis found
four independent agents hand-running the same SEO recipe and produced the
`local-seo-audit` solution draft. The workstream is productizing that loop:

1. **Demand sensing (weekly, automated):** cluster real traffic; read
   `failed_requests`, `suggest_log` misses, x402 404s on unknown slugs, schema-guess
   failures (pure lost revenue). Filter enumeration sweeps and internal accounts
   aggressively — both have already poisoned one analysis each.
2. **Neighboring-supply research (monthly, agent-run):** for the top clusters, research
   adjacent capabilities and cross-sell candidates. Output is a proposal document per
   candidate with the legal/source qualification *already done*, a cost model, and
   projected demand from observed traffic. Petter's role compresses to approving
   license + spend.
3. **Recipe packaging:** when N independent wallets run the same multi-call sequence,
   auto-draft it as a solution (the `local-seo-audit` pattern).
4. **In-band cross-sell:** machine-readable `related_capabilities` hints in catalog
   entries and error envelopes. For an agent, a well-placed hint in a 404 *is* the
   cross-sell — the error surface is the merchandising surface.
5. **Factory guardrail (unchanged from 08-05):** auto-build only the zero-maintenance
   class (stable public APIs, open data, pure computation). Browserless, LLM
   extraction, and paid vendors always need explicit sign-off — otherwise the factory
   mass-produces today's 15%.

### WS5 — Marketing to machines

An agent finds a supplier through five channels. Marketing to machines means being
present, legible, and verifiable in each:

1. **The model's training data.** Slow but compounding: crawlable per-capability pages,
   GitHub/npm/PyPI presence, honest framework packages, being cited in x402/MCP
   ecosystem writing. Content should answer *task-shaped* queries ("validate IBAN API
   no signup", "company registry lookup pay per call") — that's what gets retrieved
   and cited when a model answers a developer or an agent plans a task.
2. **Live web search at task time.** Same task-shaped pages, plus `llms.txt` and
   structured data kept flawless — these are read by the actual buyer, and being wrong
   there is worse than any homepage error (WS1b makes them true; WS5 makes them
   findable).
3. **Registries and harness catalogs.** x402 index/Bazaar and Coinbase ecosystem
   directories (the only channel with proven conversion — work it first); MCP
   registries (official registry, Smithery, PulseMCP, mcp.so, Glama); A2A directories
   as they mature. The unworked warm inbound (MCP newsletter) belongs here.
4. **Framework tool catalogs.** langchain/crewai/SK packages already published — keep
   them honest per DEC-20260422-A, and measure whether they produce calls at all.
5. **The human operator.** The residual human surface: docs good enough that a
   developer wiring an agent picks Strale in five minutes. The website's real audience.

**Cross-cutting principles:**

- **Attribution before spend.** 92% of traffic is unattributed today. Instrument the
  x402 gateway, MCP/A2A handlers, and referral hints first; otherwise distribution
  effort is unmeasurable. (08-05 WS-D, unchanged, still the prerequisite.)
- **Legibility is conversion.** For a machine buyer, every response is ad copy: error
  envelopes that teach the correct call (shipped for x402 in PR #171 — extend
  platform-wide in WS2), upgrade hints, valid minimal examples, deterministic pricing,
  provenance metadata. The PR #171 lesson cuts both ways — error examples are agent
  instructions, so they must teach the *right* thing.
- **Trust must be machine-verifiable.** Refund-on-failure, uptime, completion rates,
  audit metadata — publish them as data (`/v1/platform/facts` is the seed), not prose.
  An agent (or the human configuring it) can check claims; competitors' can't be
  checked. That asymmetry is marketing.
- **Two populations, two surfaces.** Website readers (compliance/KYB shoppers) and
  paying x402 agents (SEO/OSINT) are different audiences — stop serving one message
  to both.
- **Optimize for the embed.** Revenue = an agent finding one capability and calling it
  forever. Every capability independently discoverable, callable, and documented.
  Nobody needs to know what Strale is.

---

## 3. Sequencing

Each phase is a themed session (or a few) with entry/exit criteria. Order matters:
truth before autonomy (the floor needs a verified baseline), autonomy before growth
(don't market what breaks), attribution before distribution.

| Phase | Content | Exit criterion |
|---|---|---|
| **P0** (1 session) | Baseline: prod-context sweep run end-to-end; claim-extraction from all machine surfaces; red CI guards on main fixed; attribution instrumentation designed | Disposition table v1 exists; every capability classified |
| **P1** (2–3 sessions) | WS1 complete: fix/quarantine/retire per disposition; surfaces made true; legal audit closed incl. web-extract bypass | Zero known-false claims on any machine surface; every active capability prod-verified |
| **P2** (2 sessions) | WS2: underbuilt list closed (anyOf parity, input contracts, schema gates, aliases); overbuilt trim (SQS residue, scripts, test spend); prose→guard inventory | Run cost trending <€100/mo; every CLAUDE.md MUST mapped to a guard or an exception |
| **P3** (2–3 sessions) | WS3: failure classifier; quality floor live both directions; platform-doctor v1 as scheduled routine; escalation contract written as a DEC | A capability failure resolves (quarantine or draft PR) with zero human involvement |
| **P4** (1–2 sessions) | WS4: demand sensing scheduled; first automated research report; related_capabilities hints shipped | A capability proposal reaches Petter with only license+spend left to decide |
| **P5** (ongoing) | WS5: x402 directories, MCP registries, task-shaped pages, attribution-measured | First attributed paying wallet from a named channel |

Compliance track (Part Two of 08-05): unchanged — customer discovery conversations in
parallel, no code, trigger conditions as written there.

---

## 4. Decisions taken (Petter, 2026-08-12 — all five confirmed with suggested defaults)

1. **Adopted:** the 2026-08-05 direction plan Part One + this program. DEC-20260502-A
   and DEC-20260503-A superseded per the Contradiction Protocol (recorded in Notion +
   CLAUDE.md).
2. **Sweep budget cap:** €25 external cost per full-catalog run, vendor denylist honored.
3. **Escalation contract approved** as specified in WS3 — the enumerated list is the
   complete set of human decisions; everything else is the platform's job.
4. **Quality-floor thresholds:** quarantine <70%, deactivate <30%, on ≥10 real calls /
   30 days; auto-promote on recovery. Tunable in P3 with recorded rationale.
5. **Factory dark-launch: yes** for the zero-maintenance class — invisible + non-x402
   until first green week; activation stays a human click initially.

---

## 5. Metrics (extends the 08-05 table)

| Metric | Today | Target |
|---|---|---|
| Catalog completion rate (real traffic) | ~85% | >95% |
| Capabilities listed vs prod-verified | 299 active / 273 verified (P0 sweep, 2026-08-12) | N / N (every listed one verified) |
| False claims on machine surfaces | unknown (>0) | 0, guard-enforced |
| Judgment calls escalated to Petter / month | unmeasured | enumerated, then falling |
| MTT-quarantine for a failing capability | manual (days) | <1 hour, automatic |
| Monthly run cost (infra + vendors + tests) | unmeasured, likely >revenue | <€100 |
| Attributed share of new paying wallets | ~0% | >50% |
| Paying wallets / month, repeat rate | ~15–20 / unmeasured | 100+ / >40% |

---

## 6. What this program is not

Not a rewrite — the substrate (Hono/Drizzle/pipeline/audit trail) is sound and stays.
Not a capability-count push — count will likely *fall* during P1, and that is the
program working. Not a return to public quality scores — the floor is an internal
gate, per the SQS retirement. And not a promise of autonomy the doctrine forbids:
source licensing, vendor commitments, and money stay human, permanently.
