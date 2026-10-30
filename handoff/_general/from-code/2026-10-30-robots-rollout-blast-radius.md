Intent: measure what the 2026-10-28 robots.txt rollout actually broke across the catalogue, leave a guard that can see the tools no harness may call, and correct two stale items in the evening orchestrator checkpoint.

# The 2026-10-28 robots rollout, measured — plus a guard for the paid blind spot

Session: cloud, no laptop. No production database, no Railway CLI, so nothing
here needed either. Branch `main-t3vmzw` from `main` at `df047524`.

## Why this, and not the checkpoint's item 1

`handoff/_general/from-code/2026-10-30-orchestrator-checkpoint-evening.md`
orders the remaining work H3 → H5 → H6. All three are production reads, which
this session cannot do. Its items 7, 8 and 9 are cloud-doable, and two of the
three turned out to be wrong about their own subject — see **Corrections**.

## What the rollout broke, measured rather than inferred

The morning run found two paid tools disabled by #786 by reading revenue data.
Nobody had asked how many others it hit. All 31 `data_source_type: scrape`
manifests are now swept against the live robots.txt of each Strale-chosen
source, using production's own parser.

**Seven capabilities are disallowed. Four are already unlisted. Three are
listed and sellable, and exactly one of those is dead.**

| capability | price | listed | effect |
|---|---|---|---|
| `eu-trademark-search` | €0.50 | yes | its only path (`euipo.europa.eu/eSearch/`); every call refuses. Already known — DQ-42 |
| `customs-duty-lookup` | €0.20 | yes | EU TARIC primary disallowed; the Access2Markets fallback *is* allowed (`trade.ec.europa.eu/robots.txt` blocks only `/wp-login.php`), so it still answers — from a narrower source than its provenance implies |
| `container-track` | €0.05 | yes | Maersk (`MAEU`, the largest carrier) disallowed, so those containers return `tracking_unavailable`; the other twelve carriers are unaffected |
| `trustpilot-score` | €0.10 | no | only path |
| `patent-search` | €0.10 | no | text-query path; `/patent/{id}` still allowed |
| `salary-benchmark` | €0.20 | no | Glassdoor fallback |
| `employer-review-summary` | €0.25 | no | Glassdoor fallback |

So the blast radius on listed capabilities is **one outage and two quiet
degradations**, and the outage was already known. Nothing new is bleeding.

Receipt: `archive/receipts/2026-10-30-check-source-robots-access.json`.

**Why believe the clean part of that answer.** `price-compare`, delisted
yesterday for this exact reason, is reported unlisted — the sweep agrees with a
fact established independently of it. The 24 unflagged scrape capabilities
include allabolag, ABR, curia, enforcementtracker and eleven container carriers
whose paths robots.txt allows, so it is not flagging everything it touches.
Both halves checked, because a sweep that flags everything and a sweep that
flags nothing read identically in a summary.

**Three facts established directly, not assumed:**

- `apps/api/src/capabilities/lib/web-provider.ts:532` calls
  `assertRobotsAllowed(targetUrl)`, and `browserless-extract.ts` re-exports
  `fetchRenderedHtml` from it — which is what all seven executors call. The
  refusal is real, not theoretical.
- Each verdict was confirmed against the source's own robots.txt
  (`Disallow: /tracking/*`, `disallow: /eSearch/`,
  `Disallow: /taxation_customs/dds2/taric/`).
- Listed-or-not comes from `GET /v1/capabilities` (296 listed), not from a
  manifest or this repo's belief about production.

## The guard

`npm run sources:robots-check` →
`apps/api/scripts/check-source-robots-access.ts`, with the testable half in
`apps/api/src/lib/source-robots-candidates.ts`.

It is static by necessity. The reason #786 went unnoticed for two days is not
that a check failed — it is that **for the entire paid catalogue no check
could**: DEC-20260503-B wires scheduled testing to `external_cost_cents = 0`.
A guard covering those tools cannot call them, so it reads their source instead.

The one distinction that makes the output readable: a placeholder in the **host**
means the customer named the page (caller-directed under DEC-20261023-A —
nothing to check in advance, and a block there is a refusal, not a fault), while
a placeholder in the **path** leaves the source Strale's choice. Without it the
sweep flags all 31 and nobody reads it; with it inverted, `/eSearch/${query}`
and `/tracking/${number}` — the real breakages — are the ones it misses.

Each finding is annotated with whether the slug is in the public catalogue,
because that is what triage turns on: four of seven needed no action at all.

**Deliberately not a CI gate, and not in the weekly aggregate exit.** A source's
robots.txt is not ours to keep green, and four findings will never be fixed, so
gating would make the weekly drift issue permanently red — the exact noise
`weekly-drift.yml`'s own manifest-drift comment warns about. It is wired into
that workflow as a reported section, and `--strict` exists for the rollout step.

Tests: `apps/api/src/lib/source-robots-candidates.test.ts`, 6 cases.
Verified discriminating (DEC-20260504-A): dropping the dynamic-host skip fails
the caller-directed case, keeping the fragment in `pathAndQuery` fails the
EUIPO case, and the restored file passes 6/6. The script is inside
`tsconfig.scripts.json`, confirmed by a type canary that errored naming the
file — F5 incident 6 was a guard in a file no tsconfig project checked.

## LESSONS.md — the #786 class (checkpoint item 8)

F7 incident 13, count 12 → 13. Family chosen on mechanism: the catalogue's
declaration stayed true while the thing it declared stopped running, which is
incident 12's arm, now with a price on it. The F5 reading (the green's scope was
narrower than its reader's proposition) is named and cross-referenced but
**counted once**, in F7, since the mechanism is the declaration, not the test.

The rollout step it adds: before changing what the fetch path refuses, run the
sweep and read it. The population is enumerable in one command.

Recorded as **not repaired**: on 2026-10-30
`GET /v1/public/ops/trust/capabilities/batch` returned
`badge: "strale_tested"`, `pass_rate: 67` for `eu-trademark-search` — a
capability that cannot serve a single call. A pass rate assembled from schema
and negative tests says nothing about whether the source is reachable. That is
F1 work and wants its own batch.

## Corrections to the evening checkpoint

Both of its cloud-doable items were wrong about their own subject. Stated here
rather than by editing the checkpoint, which is dated and superseded, not
rewritten.

**Item 7 is already closed, and was closed the day it was written.** "A replayed
payment hash used on a different capability of the same price returns the first
capability's output (gateway and `/v1/do`); a thrown facilitator call on
`/v1/do` still returns the legacy 500 envelope" — both halves landed in **PR
#829** (`a2f99ba`, 2026-10-29): `x402PaymentBoundElsewhere` in
`apps/api/src/lib/x402-payment-claims.ts`, called at all three sites
(`x402-gateway-v2.ts:1320` solutions, `:1696` capabilities,
`lib/do/dispatch.ts:305`), and the thrown settlement now returns the 402
`payment_failed` envelope. It has been carried on three successive checkpoints
(10-28 item 7, 10-30 morning item 6, 10-30 evening item 7) since.

**Item 9 misdescribes who reads the mail.**
`apps/api/src/lib/email-templates.ts:124` is not "customer-facing mail": the
layout is used only by `digest-formatter.ts` and `interrupt-sender.ts`, both of
which send via `sendDigestEmail` to `HEALTH_DIGEST_EMAIL ?? admin@strale.io`
(`routes/internal-health-monitor.ts:239`). It is the internal platform-health
digest. The dead link was real — measured, HTTP **401**, because `adminOnly` is
mounted on the whole `/v1/internal/*` prefix — and is now removed, leaving
`strale.dev/trust`, which answered 200.

The public projection that replaced the route is not clickable either
(`/v1/public/ops/trust/capabilities/batch` → 400 without `slugs`), so no link
was substituted. Guarded by `apps/api/src/lib/email-templates.test.ts`, which
asserts the class — no `href` to `/v1/internal/` in any mail-composing module —
and fails when the old link is put back. Its first case asserts the file list is
non-empty, so the second cannot pass vacuously.

While sweeping for it, every other URL in every mail-composing module was
checked live: `strale.dev`, `/capabilities`, `/docs`, `/solutions`, `/topup`,
`/trust` and `api.strale.io/v1/capabilities` all 200.
`api.strale.io/v1/auth/recover/confirm` returns 404 to a bare GET and is
**correct** — `welcome-email.ts:47` shows it inside a `curl -X POST` snippet,
not as a link. That one was checked rather than counted.

## State

Clean. Gates run: `typecheck` (full, after building `mcp-server` and
`sdk-typescript` — the `strale-mcp/tools` and `straleio` errors before that are
the known unbuilt-workspace phantom, not this change), `receipts:check`,
`programs:check`, `docs:check`, `context:check`, `env:check`, `claims:check`,
and 81 tests across the five suites around the touched modules.

No program register field changed: this is not H3's evidence, and a track's
status moves only on the branch that lands its own.

## Two things a cloud session cannot do, found by hitting them

Both are container limits, not repository problems. Worth knowing before the
next cloud session spends time on them.

**1. The shallow clone makes `context:check` report six false findings, and the
pre-commit gate refuses every commit that touches an inventory target.** This
container clones 50 commits and no tags, so `AUDITED_MAIN_NOT_ANCESTOR`,
`RECORD_GIT_KEY_NOT_ANCESTOR`, `CLOSING_REVIEW_COMMIT_NOT_ANCESTOR` and two
`COMMIT_UNVERIFIABLE` findings fire on `docs/project/m2-closure-register.yaml`
simply because the commits are absent, and `handoff-check --mode pre-commit`
treats any finding as a failure. The fix:

    git fetch --unshallow && git fetch origin --tags

`--unshallow` clears five. The sixth —
`OPERATOR_ACTION_PREPARED_REF_INVALID` for `OA-20260830-ROUTING-LATENCY-438` —
needs the **tags**: its `prepared_ref` commit `ad67e433` is reachable only from
a tag, so fetching heads alone leaves it missing. After both, `context:check`
reports no warnings and `check-project-context.test.mjs` passes 26/26.

CI on `main` was confirmed green (runs 2557–2576, all success) *before*
concluding anything, because "two context tests fail here" would otherwise have
read as "CI is red on main". It was neither — it was this clone.

**2. Deleting a remote branch is not permitted through the proxy**, so the
handoff gate's `merged-branch` finding cannot be cleared from the cloud.
`origin/claude/orchestrator-session-end-89cc8a` points at exactly
`df047524` — `origin/main`'s tip, zero divergence, not in
`scripts/handoff/baseline.json` — so it is safe to remove and the gate's own
fix applies verbatim:

    git push origin --delete claude/orchestrator-session-end-89cc8a

`git push --delete` fails with `the remote end hung up unexpectedly`, and
`gh api -X DELETE repos/strale-io/strale/git/refs/heads/…` returns **403 Write
access to this GitHub API path is not permitted through this proxy**. Cloning,
pushing a branch and opening a PR all work, so this is deliberate proxy policy
on ref deletion, not broken access. **The gate therefore ends this session with
one finding outstanding**, and it is this one — not unpushed work, not a dirty
tree.

## What is still open

1. **H3, H5, H6** — unchanged, all production reads. H6 not before **11-04**.
2. **The three blocked backfills** (`eurostat-data`, `entity-resolve`,
   `places-search`) — still need the Railway log. Untouched, as instructed.
3. **The trust badge that says `strale_tested` for a dead source** — new, F1,
   needs its own batch.
4. **`image-resize`'s production suite** still points at the gstatic fixture;
   needs a write-authorised `onboard.ts --backfill`.
5. **Petter:** Serper expires **11-08** (eight tools behind it); the two Better
   Stack Railway variables; npm and PyPI logins for D1; DQ-42
   (`eu-trademark-search` — now with its blast radius measured: it is the only
   listed capability the rollout actually killed); DQ-43.
