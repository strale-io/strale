# Investigation — `company-intelligence-sdr` + suspended capabilities diagnosis

**Date:** 2026-04-21
**HEAD:** `be0c788` (`main`, post-SG retirement)
**Scope:** read-only investigation. Diagnoses why `email-pattern-discover` + `officer-search` are suspended, analyses their impact on the active `company-intelligence-sdr` solution, and scopes revive + drop paths for Petter's decision.
**Source:** Phase 4b.2 audit (`audit-reports/2026-04-21-phase-4b2-orphan-audit.md` @ `8a4e51b`) §5.
**Template:** parallels `audit-reports/2026-04-21-singapore-kyb-investigation.md` (SG KYB investigation @ `5a04325`) with adaptations for one-solution-→-two-suspended-caps shape vs SG's one-cap-→-three-solutions.

---

## 1. Executive summary

`email-pattern-discover` and `officer-search` are both **technically functional** capabilities with complete implementations (177 + 240 LOC), the required credentials in prod (`COMPANIES_HOUSE_API_KEY` present; `email-pattern-discover` needs no keys), and clean single-test-pass history. They were **manually suspended by admin action at 2026-04-19 17:46:49 UTC** (both within 63ms, same transaction), with no `deactivation_reason`, no commit message trace, no handoff note explaining why. The dependent solution `company-intelligence-sdr` is `is_active = true`, has 9 parallel steps (both suspended caps in different parallel groups), and would degrade gracefully if invoked — the solution-executor continues other steps when one errors. Between solution creation (2026-04-12) and today, customer traffic is **zero** (the 4 successful transactions on 2026-04-12 15:39–15:41 were Petter's end-to-end validation). Evidence does not support any of the technical failure types (1–4) that the SG investigation template defines — both capabilities would almost certainly work if called today. Best-fit classification is **Type 5 (insufficient technical evidence) with a strong product-strategy-suspension hypothesis**: the SDR use case is off-wedge from Strale's KYB/compliance positioning, and both caps rely on scraping/heuristic data paths that may have felt too uncertain to ship under the quality brand.

Recommendation: **needs human input on product strategy**. The decision is "is SDR in scope for Strale?" not "can the code be fixed?" Three paths are scoped below so Petter can pick: **revive** (add YAMLs + un-suspend), **drop** (retire solution + caps per DEC-20260421-J pattern), or **park** (drop only the solution, keep caps suspended for future revival if SDR becomes a priority). Drop and park are both low-cost; revive is moderate because the caps need YAMLs authored before the 4b.1 CI gate would accept them onboarded.

---

## 2. Investigation findings

### 2.1 Code inventory

| Slug | Type | File | LOC | Manifest | Auto-register | Data sources |
|---|---|---|---|---|---|---|
| `email-pattern-discover` | capability | [apps/api/src/capabilities/email-pattern-discover.ts](../apps/api/src/capabilities/email-pattern-discover.ts) | 177 | ❌ absent (orphan per 4b.2) | registered (not in DEACTIVATED map) | DNS MX + HTTP scrape |
| `officer-search` | capability | [apps/api/src/capabilities/officer-search.ts](../apps/api/src/capabilities/officer-search.ts) | 240 | ❌ absent (orphan per 4b.2) | registered (not in DEACTIVATED map) | UK Companies House API + US SEC EDGAR + EU northdata scrape |
| `company-intelligence-sdr` | solution | [apps/api/src/db/seed-solutions.ts:1546-1663](../apps/api/src/db/seed-solutions.ts#L1546-L1663) | 118-line seed entry | n/a (solutions don't have YAMLs) | n/a | 9 composed capabilities |

**Coherence**: both capability implementations are substantial, well-structured, and production-shaped. Both have `provenance` fields per capability contract. Neither is stubbed or abandoned.

**Onboarding origin** — [commit `0393fc1`, 2026-04-12 17:25](../): `feat(api): add 3 SDR intelligence capabilities` (Petter authored). Part of a 3-capability batch: `tech-stack-detect`, `officer-search`, `email-pattern-discover`, plus the `company-intelligence-sdr` solution — all seeded same-day.

**Handoff trace** — [handoff/_general/from-code/2026-04-12-notion-audit-ux-fixes.md](../handoff/_general/from-code/2026-04-12-notion-audit-ux-fixes.md): explicitly describes "Phase 3: SDR Intelligence" with officer-search, email-pattern-discover, and planned country variants (US/UK/EU) queued as Notion P1 To-do. SDR was deliberate product work at the time of shipping.

### 2.2 Why are the capabilities suspended?

**Git history**: no suspension commit. `git log --all --grep="suspend\|deprecat\|disable\|officer-search\|email-pattern-discover"` returns only the original creation commit and a later security refactor (`52bf8d6` Bucket B safeFetch migration on email-pattern-discover). No code-path suspension.

**DB state** (2026-04-21 query):
```
{"slug":"email-pattern-discover","lifecycle_state":"suspended","is_active":true,"visible":false,"data_source":"multiple","created_at":"2026-04-12 15:25:35.158453+00","updated_at":"2026-04-19 17:46:49.281+00","deactivation_reason":null,"matrix_sqs":null,"avg_latency_ms":null}
{"slug":"officer-search",        "lifecycle_state":"suspended","is_active":true,"visible":false,"data_source":"multiple","created_at":"2026-04-12 15:25:34.063275+00","updated_at":"2026-04-19 17:46:49.218+00","deactivation_reason":null,"matrix_sqs":null,"avg_latency_ms":null}
```

Key signals:
- **`deactivation_reason` is null** for both — no admin-recorded reason, unlike some other lifecycle transitions
- **`is_active = true`** (row-level flag) but **`lifecycle_state = suspended`**: mixed signal. `lifecycle_state` is authoritative per Cluster 2 work; `is_active` is vestigial in this context
- **`visible = false`**: hidden from `/v1/capabilities` catalogue
- **`matrix_sqs = null` + `avg_latency_ms = null`**: never scored — tests haven't run repeatedly. Single-pass data only
- **Updated_at 2026-04-19 17:46:49 UTC, 63ms apart for both caps**: textbook batch admin UPDATE. Exactly these 2 rows touched at that timestamp across the whole catalogue (verified — no other caps updated in that 90-minute window)

**Test history**:
```
Total test runs per cap:
  email-pattern-discover: 1 run, 1 passed (2026-04-12 15:25:59)
  officer-search:         1 run, 1 passed (2026-04-12 15:26:00)
```

Both ran exactly once — the smoke test that runs during onboarding. Since suspension, the test scheduler has excluded them (tier scheduler skips non-active capabilities). No failure history exists because no failures occurred; the scheduler simply never ran them again.

**Production transaction history**:
```
email-pattern-discover: 1 tx total, 1 succeeded, 0 failed. First=Last=2026-04-12 15:25:59
officer-search:         1 tx total, 1 succeeded, 0 failed. First=Last=2026-04-12 15:25:59
```

Both had exactly one production call (matching the single test run timestamp — likely the capability-onboarding validateTestFixtures() path). No customer calls ever. No failures ever.

**Provider config in prod**:
- `COMPANIES_HOUSE_API_KEY` is set on Railway (verified via `railway variables`). `officer-search`'s UK path has what it needs.
- `email-pattern-discover` has **no external API keys** in its implementation — it uses `node:dns.resolveMx()` + `safeFetch()` (SSRF-guarded HTTP scrape). Zero external-dependency surface.
- Neither capability has a failing dependency in the `dependency-manifest.ts` health-probe system (neither appears as `health_status = failed`).

**Commit activity at suspension timestamp**: 2026-04-19 17:46 fell inside a cluster of "phase E5 — structured logging" refactor commits. None touched SDR-related code.

**Conclusion**: The suspension is **not a technical failure**. The capabilities work in theory (code + env), worked in practice (test + transaction both passed), and were never re-tested because the suspension happened before the tier scheduler's first scheduled re-test. No commit, no log, no deactivation_reason records a why. The decision was made via admin UPDATE on 2026-04-19 evening.

Probable hypotheses (CC speculation, not evidence):
- **Product strategy**: SDR use case is off-wedge from Strale's stated KYB/compliance positioning (see MEMORY.md: "vertical-agnostic: KYB/compliance is the current wedge"). Petter may have decided SDR is a distraction.
- **Quality concern over scraping**: `officer-search`'s EU path scrapes northdata.com; `email-pattern-discover` scrapes company websites. Scraping-heuristic data paths may have felt off-brand for a compliance-positioned platform.
- **PII review**: `officer-search` returns officer names (personal data); `email-pattern-discover` returns patterns that enable unsolicited email outreach. An SA.2b-era PII audit may have flagged both for additional review.
- **Country variants deferred**: the handoff note mentioned US/UK/EU variants planned but uncommitted; suspension may have been part of "pause this until country variants ship."

None of these have an evidence trace. Petter can confirm.

---

## 3. Failure classification (per capability)

| Slug | Type | Rationale |
|---|---|---|
| `email-pattern-discover` | **Type 5 (insufficient technical evidence)** with product-strategy hypothesis | Code complete, no external API keys required, sole test passed, sole transaction succeeded. No technical failure detected. Suspension is admin-driven. |
| `officer-search` | **Type 5** — same | Code complete, `COMPANIES_HOUSE_API_KEY` set in prod, sole test passed, sole transaction succeeded. No technical failure. Suspension is admin-driven. |

This differs from the SG investigation's pattern. SG had 41/41 production failures and empirical proof of data-source breakage — clear Type 3 (structural). Here the evidence points away from any of Types 1–4. The fifth type exists for exactly this case: "not enough to make a technical call."

**Upgrading to a product call**: If the suspension is indeed product-strategy (the most plausible hypothesis given all evidence), the SG-investigation type system doesn't fit — these capabilities aren't broken, they're deprioritised. The decision framework shifts from "technical revive plan" to "is SDR in scope for Strale?"

---

## 4. Solution analysis

### 4.1 Composition

9 parallel steps, 3 groups of 3, all `can_parallel: true`:

| # | step | cap | lifecycle | group |
|---|---|---|---|---|
| 1 | filing-events | `sec-filing-events` | active | 1 |
| 2 | news sentiment | `company-news` | active | 1 |
| 3 | **officers** | `officer-search` | **suspended** | 1 |
| 4 | tech stack | `tech-stack-detect` | active | 2 |
| 5 | **email patterns** | `email-pattern-discover` | **suspended** | 2 |
| 6 | domain reputation | `domain-reputation` | active | 2 |
| 7 | hiring signals | `job-board-search` | active | 3 |
| 8 | social presence | `social-profile-check` | active | 3 |
| 9 | whois / domain age | `whois-lookup` | active | 3 |

**Degradation behavior** (from `apps/api/src/lib/solution-executor.ts` L264–332):
- Groups run sequentially, steps within a group run `Promise.all`
- `getExecutor(step.capabilitySlug)` returns the registered executor — **suspended caps are still registered**; only caps in the `DEACTIVATED` map are skipped at registration time
- If a step errors, `stepErrors` accumulates but other steps continue
- Output returns partial: completed steps contribute data, errored steps contribute `{ error: sanitized-message }`

**So if called today, `company-intelligence-sdr` would:**
- Get all 9 executors from the registry (suspended doesn't affect registration)
- Execute all 9 in 3 parallel groups
- officer-search would call Companies House with the configured API key → succeed
- email-pattern-discover would call DNS + HTTP → succeed
- Returns full 9-point company intelligence response — degrading only if the executors themselves error, which the evidence says they don't

In short: **the solution currently functions correctly**. Its two suspended dependencies are suspended in metadata (catalogue hidden, tests not scheduled) but not at runtime.

### 4.2 Traffic

```
Solution transactions:
  count=4, first=last=2026-04-12 15:39-15:41. succeeded=4 failed=0.
```

All 4 transactions happened within a 2-minute window on the creation day — unambiguously Petter's validation. **Zero customer transactions** since. No production agents have discovered or called this solution.

### 4.3 Surfaces

**sitemap** — `strale-frontend/public/sitemap.xml:1720`: `https://strale.dev/solutions/company-intelligence-sdr`. Currently indexed by Google. After this week's regen, still present (solution is `is_active=true`).

**frontend catalog** — `src/components/SolutionsShowcase.tsx:52`: references an SDR tagline, but for a different solution (`lead-enrich`), not `company-intelligence-sdr`. No direct frontend link to this solution.

**docs / llms.txt / content pages** — no SG-like "N countries" claims to inspect. No handoff mentions cross-linking.

**other solutions referencing the caps** — queried: **none**. Only `company-intelligence-sdr` depends on `officer-search` or `email-pattern-discover`. Dropping either cap affects exactly this one solution.

---

## 5. Revive plan (per capability)

Scoped per the SG-investigation template §4 adapted to two capabilities.

### 5.1 `email-pattern-discover` — revive

**State needed**: `lifecycle_state = active`, `visible = true`, full YAML manifest, 5 test types generated via `--discover` pipeline.

**Steps**:
1. Author minimal manifest at `manifests/email-pattern-discover.yaml` (slug, name, description ≥20 chars, category, price_cents=3, input_schema, output_schema, data_source, data_source_type=computed/api, transparency_tag=algorithmic, maintenance_class=pure-computation, processes_personal_data=true [emails are PII], personal_data_categories=[email], limitations ≥1, test_fixtures.known_answer.{input,expected_fields}, output_field_reliability).
2. Run `cd apps/api && npx tsx scripts/onboard.ts --backfill --discover --manifest ../../manifests/email-pattern-discover.yaml`. Pipeline will:
   - Generate all 5 test types
   - Execute the live capability against the known_answer fixture
   - Populate `output_field_reliability` from actual output
   - Update DB row fields manifest-side (but NOT `lifecycle_state` — that's `db`-canonical per 4a)
3. UPDATE `capabilities SET lifecycle_state='active', visible=true, updated_at=NOW() WHERE slug='email-pattern-discover'`
4. Verify: `railway run psql -c "SELECT * FROM capabilities WHERE slug='email-pattern-discover'"` + test run via `npx tsx scripts/smoke-test.ts --slug email-pattern-discover`

**Effort**: ~1.5h (30 min manifest authoring, 45 min pipeline + verification, 15 min review/iterate).
**Env vars needed**: none (pure DNS + HTTP).
**Risk**: low. Capability is functional; this just reverses the admin suspension with proper metadata backing.

### 5.2 `officer-search` — revive

**Similar steps to 5.1 with adjustments**:
1. Author `manifests/officer-search.yaml`. Price_cents=5, category=company-data, maintenance_class=scraping-fragile-target (northdata path is fragile scrape), transparency_tag=algorithmic, processes_personal_data=true (officer names are PII), personal_data_categories=[name, professional], limitations must disclose partial coverage (US path returns placeholder "see filing for details" not actual names; EU path depends on northdata availability).
2. Run `--backfill --discover` pipeline.
3. Lift `lifecycle_state` to active.
4. Verify end-to-end against UK Companies House (easiest path — API key is present).

**Effort**: ~2h (larger manifest, more limitations to author, scraping-fragile maintenance class means closer review).
**Env vars**: `COMPANIES_HOUSE_API_KEY` (present in prod).
**Risk**: low-medium. UK path is solid; EU northdata scrape is fragile but already production-coded with timeout guards. US path returns limited data — manifest should declare this as a coverage limitation.

### 5.3 Solution state after revive

No change needed to `company-intelligence-sdr`. Already `is_active=true`. After caps flip to active, the whole solution's lifecycle state aligns. Pipeline-wise nothing to do on the solution.

---

## 6. Drop plan (per capability + solution)

Per DEC-20260421-J retirement pattern (established by SG retirement at commit `be0c788`).

### 6.1 Drop the two capabilities

Both capabilities:
- Soft-deactivate: already done via `lifecycle_state = suspended`. Downgrade to `deactivated` via `UPDATE capabilities SET lifecycle_state='deactivated', deactivation_reason='<reason>' WHERE slug IN ('email-pattern-discover','officer-search')`.
- Add slugs to `apps/api/src/capabilities/auto-register.ts` `DEACTIVATED` map so the executors don't register at startup. Required: otherwise any agent who knows the slug can still call them via `/v1/do` (route sends to registered executors).
- Remove SG-style entries from `apps/api/src/db/seed.ts` if present. (Not currently present — caps aren't in seed.ts; they were created via onboarding pipeline not seed.)
- Remove from `apps/api/src/jobs/fix-lifecycle-anomalies.ts` ANOMALOUS list if present. (Not currently present — they haven't been logged as anomalies because they're in `suspended` not the weird-state pattern the ANOMALOUS list targets.)
- Leave executor files at `apps/api/src/capabilities/{email-pattern-discover,officer-search}.ts` in place (per SG-pattern: no value in deletion, risk of grep-miss).

### 6.2 Drop the solution

- `UPDATE solutions SET is_active = false WHERE slug = 'company-intelligence-sdr'`
- Remove entry from `apps/api/src/db/seed-solutions.ts:1546-1663` (118-line block) — prevents fresh-DB re-seed from recreating
- Any other seed files? `rg "company-intelligence-sdr" apps/api/scripts/ apps/api/src/db/` — only `seed-solutions.ts`.

### 6.3 Regenerate frontend sitemap

Running `npx tsx scripts/generate-sitemap.ts` in `strale-frontend` will naturally drop `/solutions/company-intelligence-sdr` because the `/v1/solutions` endpoint filters by `is_active=true` server-side (confirmed in SG retirement).

Expected diff: 1 URL removed (`/solutions/company-intelligence-sdr`). No other changes (unless further drift has accumulated since 2026-04-21's SG regen).

### 6.4 Notion / docs

- Notion Products page or any page listing solutions (e.g. Sales & Outreach category) should remove the SDR entry. Petter handles Notion; CC doesn't touch.
- `strale-frontend/public/llms.txt` reviewed — contains no SDR-specific mentions (the SDR tagline on `SolutionsShowcase.tsx` is for `lead-enrich`, a different solution).

### 6.5 Blast radius summary

- **DB rows updated**: 2 capabilities to `deactivated` + 1 solution to `is_active=false` = 3 row updates
- **Code files modified**: `auto-register.ts` (add 2 slugs to DEACTIVATED) + `seed-solutions.ts` (remove 118-line solution block) + possibly `fix-lifecycle-anomalies.ts` if we want to add them to the anomaly-acknowledged list (optional)
- **Frontend**: 1 regenerated `sitemap.xml`
- **Public surfaces**: 1 sitemap URL removed; 1 Google-indexed page pending deindex
- **Effort**: 1h total (including drop script authoring, similar to `drop-sg-kyb.ts`)

### 6.6 Drop is reversible

Per DEC-20260421-J, all operations are reversible:
- `UPDATE solutions SET is_active = true` reverses soft-deactivation
- `UPDATE capabilities SET lifecycle_state='suspended'` reverts cap state
- `git revert <drop-commit>` restores seed-solutions.ts + auto-register.ts
- History preserved (4 solution tx, 2 cap tx, 2 test results untouched)

### 6.7 Retirement-pattern observations

SG retirement established the pattern at commit `be0c788`. This drop would be the second application. Differences worth noting:

- **SG dropped 3 solutions + 1 capability** (4 row updates). **SDR drop** = 1 solution + 2 capabilities (3 row updates). Slightly smaller blast radius.
- **SG had 41 failed transactions as classification evidence**. **SDR drop has zero transactions of either kind** — which is itself an argument for drop (no users to affect), but also an argument for park (nothing is actively broken, so no urgency).
- **SG's retirement was driven by technical incapability**. **SDR drop would be driven by strategy**. That's a qualitative difference worth surfacing in the DEC.

---

## 7. Park plan (middle path)

If Petter's answer to "is SDR in scope?" is "not right now but maybe later," the park option preserves the capabilities for future revival while removing the broken solution-surface:

1. `UPDATE solutions SET is_active = false WHERE slug = 'company-intelligence-sdr'` (hides solution from catalogue + sitemap)
2. Leave capabilities at `lifecycle_state = suspended` (already there). Don't add to DEACTIVATED map — keeps them in a resumable state.
3. Remove solution block from `seed-solutions.ts`.
4. Regen sitemap.
5. **Don't** add to auto-register DEACTIVATED, **don't** remove capability executor code, **don't** change capability DB rows further.

**Effect**: public surface closes; capability rows + code remain frozen. If priorities change, `lifecycle_state='active' + visible=true` + add YAMLs via `--backfill --discover` brings them back cheaply.

**Cost**: ~30 min (smaller than full drop).

**Reversibility**: full.

---

## 8. Decision matrix analysis

| email-pattern-discover | officer-search | Template recommendation | Our case |
|---|---|---|---|
| Type 1/2 | Type 1/2 | Revive both | n/a — neither is Type 1/2 |
| Type 3/4/5 | Type 3/4/5 | Drop everything | Both Type 5; matrix default would be drop |
| Type 1/2 | Type 3/4/5 | Revive one, drop other | n/a |
| Type 3/4/5 | Type 1/2 | Same as above, reversed | n/a |

Both capabilities are **Type 5**. Template default is "Drop everything." But the Type 5 rationale here isn't "technical failure we can't diagnose" (SG's template assumption) — it's "no technical failure, admin suspended for non-documented reasons." The matrix default is directionally right (if not broken and not used, why keep it?) but the specific case deserves more nuance.

Augmented recommendation cells:

| Scenario | Apply if | Path |
|---|---|---|
| **Revive** | Petter confirms SDR is in scope and worth the ~3.5h of manifest + pipeline work | §5 |
| **Drop** | Petter confirms SDR is off-wedge and the solution should stop being indexed | §6 |
| **Park** | Petter wants to hide the broken surface now but keep the capabilities available for later | §7 |
| **Needs human input** | Petter hasn't decided yet | this report is the input |

All three are available. None is a bad call — they differ only in commitment level.

---

## 9. Recommendation

**Park.** Specific reasoning:

1. **Current state is mildly harmful but not broken.** Unlike SG (where the surface advertised a capability that failed 100%), `company-intelligence-sdr` would actually succeed if called today — its 9 parallel steps include 2 suspended-but-functional caps whose executors still register and run. No user is currently burned.
2. **Zero customer traffic means no user to retain** (park cost) **and no user affected by removal** (drop cost). Both are cheap options.
3. **Park preserves optionality.** If Strale decides in 2–6 months that SDR is a growth wedge, the two capabilities are ready to un-suspend via a 1-hour manifest-authoring + pipeline pass. If dropped, revival is greenfield.
4. **Drop is slightly disruptive to preserved-history coherence.** The SG retirement pattern removes seed entries and adds DEACTIVATED entries — both of which "commit" to non-revival in a way park doesn't. Park is closer to "pause" than "retire."
5. **Strale's active investment areas are KYB/compliance** per MEMORY.md and recent commit velocity. SDR was a single-day effort 9 days ago; it hasn't been extended, and related Notion P1 To-dos (country variants) haven't moved. Park status quo matches priority signal.
6. **If Petter's intent all along was "retire", park to drop is a one-hour follow-up.** Revive to drop is also cheap. The cost of getting this wrong in either direction is ~1 hour.

**What park ships**:
- `UPDATE solutions SET is_active = false WHERE slug = 'company-intelligence-sdr'`
- Remove `seed-solutions.ts:1546-1663` 118-line block
- Regen frontend `public/sitemap.xml`
- Commit message documents decision: "park `company-intelligence-sdr`; capabilities remain suspended pending SDR scope decision"
- DEC: "DEC-20260422-X — Park SDR solution surface. Capabilities remain suspended. Revisit at Q2 2026 if KYB/compliance wedge saturates and horizontal expansion becomes viable."

**What park doesn't ship**:
- No changes to capability lifecycle_state (stays suspended)
- No DEACTIVATED map additions (executors still registered)
- No capability executor-file deletion
- No capability seed-file edits

**If Petter prefers drop or revive**, both alternative plans are scoped in §5 and §6. Petter picks; next-session prompt executes.

---

## 10. References

- **SG investigation template** ([audit-reports/2026-04-21-singapore-kyb-investigation.md](2026-04-21-singapore-kyb-investigation.md) @ `5a04325`) — classification typology (Types 1-5) and investigation structure adapted here
- **SG retirement pattern** (commit `be0c788`, DEC-20260421-J) — the drop model §6 applies
- **Phase 4b.2 audit** ([audit-reports/2026-04-21-phase-4b2-orphan-audit.md](2026-04-21-phase-4b2-orphan-audit.md) @ `8a4e51b`) §5 — flagged these 2 caps as lifecycle-inconsistent
- **Original SDR handoff** ([handoff/_general/from-code/2026-04-12-notion-audit-ux-fixes.md](../handoff/_general/from-code/2026-04-12-notion-audit-ux-fixes.md)) — documents the 2026-04-12 Phase 3 SDR Intelligence build
- **Onboarding commit** `0393fc1` — original capability creation
- **Schema** — [apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts): capabilities, solutions, solution_steps FK restrict semantics
- **Solution executor** — [apps/api/src/lib/solution-executor.ts:264-332](../apps/api/src/lib/solution-executor.ts#L264-L332) — graceful-degradation behavior confirmed
- **Auto-register** — [apps/api/src/capabilities/auto-register.ts:13-18](../apps/api/src/capabilities/auto-register.ts#L13-L18): DEACTIVATED map pattern for runtime executor-skip
