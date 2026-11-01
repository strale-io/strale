Intent: close platform-hardening T3 (H3) by running the post-deploy verification PR #776 left open, and inventory everything this lane used that exists only on the founder's PC, so the decision to move the Strale orchestrator to the cloud rests on a list rather than a guess.

# H3 verified in production, and what still ties this lane to one machine (2026-10-31, Swedish time)

Production was on `df0475244c1b` throughout. Nothing was written to the
production database; every query ran through the read-only `strale_ro`
credential, and the drift sweep asks for `default_transaction_read_only` on top
of that. Receipt:
[H3 verification](../../../archive/receipts/2026-10-31-check-h3-manifest-text-and-guaranteed-fields.json)


## Exit criterion 1 — deploy text and drift agree with the manifests

```
cd apps/api && npx tsx scripts/sweep-manifest-drift.ts --strict
{"examined":350,"sync_writable_differences":0,"missing":8,"failed":0}   exit 0
```

`GET /v1/public/ops/limitations/capabilities/iban-validate` returns
`IBAN checks do not confirm an active account` as its first title, which is the
exact string the H3 handoff named, and the DB rows carry `sort_order` 0 and 1,
so the served order is the stored order.

`capabilities.manifest_text_hash` exists as nullable text; block 0128 applied
once at `2026-10-29T01:21:42.740Z`.

### The 36 rows without a checkpoint, derived from the predicate

**326 of 362 capabilities carry a checkpoint.** The other 36 split as:

| population | count | why it has no checkpoint |
|---|---|---|
| no manifest file at all | 12 | the sync iterates manifests, so a DB row without one is never visited |
| report-only by `isReportOnly` | 24 | compliance and methodology rows write no text and no hash, by design |
| anything else | **0** | — |

This was computed by **running the real `isReportOnly` predicate** from
`manifest-publication-policy.ts` over the live DB rows and the manifest files,
not by matching a slug list. That matters: an earlier draft of this note used
the 24-slug list quoted in the 2026-10-27 handoff, which is a snapshot the
predicate can outgrow, and it also attributed the 12 to being *deactivated*.
That reason was wrong — `manifest-text-sync.ts` selects capabilities with no
`is_active` filter, so a deactivated tool with a manifest is still
checkpointed. The 12 are manifest-less (all 12 happen also to be deactivated,
which is coincidence, not cause).

Two facts fall out that are worth more than the arithmetic: the predicate
matches **exactly 24 rows in the whole catalogue**, and **all 24 are
unchecked** — so no report-only row has been written, and no non-report-only
row has been skipped. That is the publication guard observed working in
production, rather than inferred from an absence.

The 8 manifests with no DB row, which `--strict` counts but does not fail on:
`bulgarian-company-data`, `cypriot-company-data`, `hungarian-company-data`,
`luxembourgish-company-data`, `maltese-company-data`, `romanian-company-data`,
`package-docs`, `secure-random`. They are manifests for tools not present in
production; the sweep never names them, so they are named here. They do not
affect the 350 rows that were examined, and they are not a reason to hold T3.

### The claim and fetch guards

T3's second exit bullet also asks that "claim/fetch guards cover the expanded
surfaces". Run against this tree:

| guard | result |
|---|---|
| `check-fetch-timeout-coverage.mjs --strict` | 4 offenders, 0 outside the allowlist |
| `lint:no-unguarded-user-fetch` | every raw fetch in caller-URL capabilities guarded or marked |
| `check-ssrf-inventory.mjs` | every URL-accepting capability protected or acknowledged |
| `claims:check` | ok |

### The disposable-Postgres integration test

Round 2 left `manifest-text-sync.integration.test.ts` to be observed in CI.
PR #776's `integration-db` job passed
([run 40555886853](https://github.com/strale-io/strale/actions/runs/40555886853)),
and `ci.yml` runs `vitest run --no-file-parallelism integration.test.ts`, which
selects that file. What is *not* established is whether it executed or skipped
inside that job; the job's pass alone does not distinguish them. Called out
rather than claimed.

## Exit criterion 2 — guaranteed fields measured on real traffic

**Read the denominator carefully.** The first guaranteed-field miss was
recorded at `2026-10-29T13:38:12Z`, not at the 10-27 deploy, so any call count
spanning 30 days is the wrong denominator — a first draft of this note reported
`tech-stack-detect` at 23 calls / 2 misses when, in the window where misses
could be recorded at all, it is 2 calls / 2 misses. Every figure below counts
only calls since that first miss.

Scope, stated honestly: these are served `/v1/do` calls, recorded by
`recordPiggybackResult` on the dispatch and batch paths. That path does not
distinguish the harness from customers, and roughly 98 % of `/v1/do` volume is
the harness sweep, so most of these are harness calls. "Real traffic" here
means *served production traffic*, not *customer traffic*. The small
per-tool counts are consistent with a sweep that visits each tool a few times.

Since the deploy: 795 piggyback rows across 290 distinct tools, 29 of which
record a guaranteed-field miss. The sampled miss rows carry `passed = true`, so
on those rows the misses are measure-and-alert only and schema validation still
owns the pass flag — a sample, not a proven invariant.

**16 tools returned a response missing a field their manifest declares
guaranteed:**

| tool | calls | misses | tool | calls | misses |
|---|---|---|---|---|---|
| `google-search` | 3 | 3 | `credit-score-band` | 3 | 1 |
| `dangerous-goods-classify` | 3 | 3 | `date-parse` | 3 | 1 |
| `container-track` | 3 | 3 | `cz-birth-number-validate` | 2 | 1 |
| `sql-explain` | 3 | 3 | `incoterms-explain` | 2 | 1 |
| `timezone-lookup` | 3 | 2 | `cz-bank-account-validate` | 2 | 1 |
| `crontab-generate` | 3 | 2 | `phone-normalize` | 3 | 1 |
| `robots-txt-parse` | 3 | 2 | `schema-migration-generate` | 1 | 1 |
| `sql-optimize` | 2 | 2 | `tech-stack-detect` | 2 | 2 |

**The cause of each miss is not diagnosed, and should not be assumed.**
`checkGuaranteedFieldsPresent` returns *every* guaranteed field as missing when
the output root is not a plain object, so "`cz-bank-account-validate` missing
six" has the shape of a root-level or early-return branch — several of the 16
are validators with an invalid-input path — rather than six independently
absent fields. What is established is that the declaration and the response
disagreed on a served call; whether the manifest over-promises or the executor
under-delivers is the next question, not this one's answer.

**Why this is worth keeping, despite the small samples.** Only 2 of the 16
(`credit-score-band`, `timezone-lookup`) appear in
`apps/api/scripts/manifest-consistency-allowlist.txt`, the static checker's
22 known inconsistencies. **The other 14 are invisible to static analysis and
were found only by watching real responses.** That is precisely what H3's
monitoring was built to do, and it is the concrete case for the weekly
persisted-miss check the H3 handoff proposed: at these volumes the live alert
(more than 10 % missing after at least 20 calls for one tool in one hour) will
essentially never fire. Narrowing an over-promised `output_field_reliability`
entry is a narrowing and needs no founder decision; the work is sizing which
of the 14 are manifest errors and which are executor bugs.

## What could not be measured, and why that is not a gap in the exit criteria

The 2026-10-27 handoff also asked for the first run's duration, row count and
WAL/space impact. PR #776 first booted on 2026-10-27 and block 0128 applied on
10-29; Railway keeps logs per deployment, so that boot's
`manifest-text-sync-summary` line and its timing are gone. WAL and space
impact were not reconstructed from Postgres statistics either — they could be,
approximately, and were not. None of the three appears in T3's `exit:`
criteria, so T3 closes on its stated criteria; this is a measurement that was
proposed and skipped, not a criterion waived.

---

# What this lane used that exists only on this PC

Requested so the move of the Strale orchestrator to the cloud rests on a list.
**Scope: what this lane and today's H7 and D1 lanes actually used.** It is not
a survey of everything the orchestrator role needs, and the conclusion at the
end is bounded accordingly.

| # | Thing | Where it lives now | Could a cloud session get it from Bitwarden or a repository? |
|---|---|---|---|
| 1 | **`DATABASE_URL`** — the read-only `strale_ro` production credential, in `C:\Users\pette\Projects\strale\.env` | PC only; the file is outside the repository and untracked | **Yes, Bitwarden — but Petter puts it there.** The most load-bearing item: every production verification in this lane and in H7 ran through it. It is read-only, the tier DEC-20261027-C allows in the store, though it is still production *data* access, so confirm it counts as read-tier. Cloud sessions get a read-only `BWS_ACCESS_TOKEN` and never write secrets. Suggested name `STRALE_DB_READONLY_URL` in project `strale`, read through `bws run`. |
| 2 | **`SERPER_API_KEY`** | same `.env`; the production key is in Railway | **Partly.** Needed only to reproduce vendor behaviour, as this lane did. A test-tier key belongs in Bitwarden; the production key stays in Railway. |
| 3 | **Railway CLI, already signed in** | PC only | **No, and deliberately.** It reaches production controls, not just reads. A Railway token for a cloud session is a founder decision, not a Bitwarden entry. The cost is small and known: Railway logs are per deployment and lossy above 500 lines/second, so this lane verified through the database instead — better evidence anyway. |
| 4 | **Microsoft 365 / Outlook desktop with the mail connector** | PC only, by policy | **No, by design** — DEC-20261027-C keeps write-capable mail connectors off cloud accounts and puts sending in one inbox routine. The point for a cloud orchestrator is narrower than "it cannot see mail": that decision already assigns the inbox to one routine, so what is needed is that the routine **relays vendor notices to the bus**. Today's Serper change reached this lane only because the mail was visible here. |
| 5 | **`gh` CLI signed in as the personal account** | PC only | **Partly.** A cloud session has its own GitHub identity, but whether it can push branches and open PRs on `strale-io/strale` was not checked here. The two upstream forks used for the D1 PRs (`petterlindstrom79/pipedream`, `.../activepieces`) are tied to that account; a cloud session would open its own. |
| 6 | **Docker and the `postgres:16` container** (the `strale_h7_test` database created in it today) | PC only | **Yes, replaced rather than moved.** CI's `integration-db` job runs the same tests against a real Postgres service container. A cloud session should run them in CI and not expect a local engine. |
| 7 | **The Notion workspace connector** | PC desktop | **No.** CLAUDE.md makes Notion access required for session start, the Journal and the To-do DB. Not used by this lane, which is why it is easy to forget — and exactly why it belongs on the list. |
| 8 | **The auto-memory directory** (`C:\Users\pette\.claude\projects\…\memory\`) | PC only, by design | **Partly — it is backed up to `strale-context-archive/claude-memory`.** It holds the accumulated gotchas this lane leaned on (harness-vs-customer traffic, Railway log loss, drizzle error wrapping). A cloud session needs the backup refreshed before it can work at the same level. |
| 9 | **`DATABASE_URL_WRITE`** — the parked, commented-out production write grant | PC only, commented | **No, and it should stay that way.** Listed so nobody treats its absence in the cloud as a missing capability. |
| 10 | **The remaining names in the root `.env`** (`ADMIN_SECRET`, `STRIPE_SECRET_KEY`, vendor keys, …; 50 names in all) | PC only | **Only the read and test tiers.** Production and money-path secrets stay in Railway. This lane used none of them, but note `ADMIN_SECRET` is what triggers a Tier-B suite by hand, so a cloud session cannot do that. |
| 11 | **The checkout, worktrees and `node_modules`** | PC | **Yes.** Entirely reproducible from the repository. |
| 12 | **npmjs.com signed-in session** | Petter's, not this machine's | **No, and that is the standing D1 blocker** — the trusted-publisher entries. Unchanged by any cloud move. |

**The reading, bounded to what this list covers.** For the work these three
lanes did — production verification, register updates, PRs, upstream fixes —
only item 1 is a hard blocker, and it is a read-only credential that belongs in
Bitwarden anyway. Items 3, 4 and 9 are deliberate policy limits rather than
gaps; of those, item 4 is the one with a real consequence, because a cloud
orchestrator will not see a vendor notice unless the inbox routine relays it.
Items 5, 7 and 8 need checking or refreshing before a cloud session can match
this one, and items 6, 10 and 11 are solved or replaceable. Item 12 is
unaffected.

So: a cloud session could do **this lane's** work once
`STRALE_DB_READONLY_URL` is in Bitwarden. Doing the **orchestrator role** also
needs the Notion connector, a refreshed memory backup, a confirmed GitHub push
path, and vendor mail relayed to the bus. Anything beyond those — publishing,
Railway control, writes — stays with Petter by decision, not by machine.

## Carried, urgent, not this lane's to fix

Verified live during this lane, from a vendor notice: since about
**2026-10-30 01:30 UTC**, Google returns opaque `google.com/goto?url=…` links
for every organic result after the top 3, and Serper passes them through. One
live call each to `/search` and `/news` confirmed it: positions 1 to 3 are real
URLs, 4 to 10 are `goto` links. Serper's fix is a free `/resolve` endpoint
(0 credits, called within about 30 seconds of the search) that returns the real
URLs — their figure, not one this lane measured.

Eight capabilities call Serper (`meteredVendorFetch("serper"`), but they do not
all read the same thing, and the distinction decides the fix:

- **Wrong, not merely degraded** — these derive a domain from the link, so for
  positions 4 and beyond they now compute `www.google.com`:
  `keyword-rank-check` (`:110`), `serp-analyze` (`:46`) and **`backlink-check`**
  (`:102`), which then pushes `google.com` rows into `backlinks` and counts
  them as referring domains. A paid tool silently returning a wrong answer.
- **Unusable URLs returned to the caller:** `google-search` (organic links, and
  People-Also-Ask links at `:78`), `google-news-search` (`/news` links) and
  `adverse-media-check`, which uses `/search` — not `/news` — and emits
  `source_link` straight into a **compliance** output (`:210`).
- **Different surfaces, unverified:** `serp-related-questions` (`:57`) reads
  People-Also-Ask links and `serp-analyze` also reads `answerBox.link`. Whether
  Google wraps those is **not** established; only `organic[]` and `news[]` were
  tested. Check before changing them.

That is a build across three to eight executors plus a shared resolve helper,
so it belongs in its own lane. Note the deadline interaction: the Serper key
expires **2026-11-08** with roughly 3,100 of 50,000 credits left.
