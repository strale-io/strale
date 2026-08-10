# Handoff — 2026-08-05 — activity follow-ups: ToS blocklist + search aliases

> **Frontend threads continued and closed on 2026-08-06** — see
> [2026-08-06-frontend-ci-signal-and-audit-drift.md](2026-08-06-frontend-ci-signal-and-audit-drift.md).
> The PR #12 / #13 sections below record their in-progress state as of this
> session; both are now merged and verified on `main`.

**Intent:** Continuation of the same session as [2026-08-05-screenshot-waitfor-browserless-v1.md](2026-08-05-screenshot-waitfor-browserless-v1.md). Worked the two remaining follow-ups that `/activity since-last` surfaced: the `product-reviews-extract` Trustpilot wall and the search typeahead gaps.

## PR #151 — ToS blocklist (merged, `87b84db`)

**Symptom:** 28 of 31 x402 calls to `product-reviews-extract` failed over 16 days, every one a `trustpilot.com/review/*` URL returning 403. Callers retried identical URLs 3-4×, each attempt paying for a Browserless render first.

**Root cause was one level deeper than the symptom.** The capability was *advertising* Trustpilot — both its DB description ("Amazon, Trustpilot, or any review page") and its own missing-input error told callers to use it — while sibling `trustpilot-score` sat deactivated for exactly that ToS reason. More structurally: the platform enforced its site-by-site ToS rulings by deactivating the **named** capability pointed at each site. Capabilities taking an *arbitrary* URL reach the same hosts through the same Browserless path, so deactivation closed the front door and left the side door open.

Added `apps/api/src/capabilities/lib/tos-blocklist.ts` as one source of truth (Trustpilot, Glassdoor, LinkedIn, Google Patents, Google Search, FB/IG/X — all previously scattered across the auto-register DEACTIVATED map and a comment in `social-profile-check`). Rejection happens before any network work: no render, no LLM tokens, and the caller gets a message naming the constraint, saying retry won't help, and pointing at Reviews.io/Feefo/Yotpo.

Registered the refusal string in circuit-breaker `USER_INPUT_ERROR_PATTERNS` — otherwise a burst of blocked URLs reads as capability failure and trips the breaker for everyone. Cross-module test verified in both directions per DEC-20260504-A.

**Deliberately not fixed — needs Petter's call (task chip `task_475e2c5a`):** `tech-stack-detect` completed **19 calls against linkedin.com** in the same window, and `screenshot-url` has one. That's the same automated access `linkedin-url-validate` was deactivated for, and it fails *open* (serving prohibited data) rather than closed. Blocking it is a one-line wire-in but removes working paid traffic — a business/legal decision, not a refactor. ~11 further arbitrary-URL capabilities share the gap.

## PR #152 — search vocabulary aliases (open at time of writing)

17 zero-result typeahead queries in `suggest_log`. Split them into vocabulary mismatches (fixable) and coverage gaps (not).

Fixed via a data-driven alias map (`apps/api/src/lib/search-aliases.ts`): `fx` 0→7 results (exchange-rate 3rd), `visa`/`relocation visa immigration` 0→1 (work-permit-requirements), `logging` 0→2 (log-parse first — prefix matching could never reach it, the typed word is longer than the token), `travel`/`trip` 0→2 (flight-status).

Ranking needed a second pass: with one flat alias weight, `fx` put `swift-message-parse` (mentions currency in prose) above `exchange-rate` (whose *name* is the answer). Added a `primaryTokens` set (name + slug), used **only** for alias scoring, so direct matching is unchanged.

**Left unaliased on purpose:** south africa, itinerary, vacation, reminder, incident, rewrite, engine. Nothing serves them under any name; aliasing to adjacent items would manufacture false matches. A test pins this.

Verified: live catalog before/after, through the real route handler via `app.request()`, plus a regression probe of the 19 most frequent real queries — 0 returned fewer results.

## PR #153 — sanitizer allowlist (found by post-deploy verification)

Verifying #151 against production caught a defect in my own shipped message. The refusal came back as *"Supported review sources include **[service]**, Feefo and Yotpo pages"* — `sanitizeFailureReason()` strips hostname-shaped tokens to stop internal infrastructure names leaking, and it can't tell those from a vendor name deliberately written into guidance, so it ate `Reviews.io`. The one actionable part of the message named nothing.

Added an explicit `HOSTNAME_ALLOWLIST` (public product names cited by the refusals, plus the blocked site's own name so callers can see *what* was refused), folded the pre-existing inline `keepPatterns` into it, and made matching case-insensitive. Tests pin **both** directions, since a too-broad allowlist is the more dangerous failure — `chromium.railway.internal` must still never reach a customer. `sanitize.ts` had no test coverage before this.

Worth noting for the future: this only surfaced because the post-deploy check read the actual response body rather than just asserting a non-200 came back.

## strale-frontend PR #12 — AuditRecord.quality drift (open, needs your call on CI)

`check-shape-contracts.mjs` flagged the frontend declaring `quality: { sqs, label, pass_rate }` that the backend stopped shipping when the SQS engine was deleted (DEC-20260503-B, 2026-05-05).

**It was user-visible, not just a type mismatch.** Two live consumers read it — the audit page's § 6 "Quality at Time of Transaction" and the downloadable PDF. Both use optional chaining so nothing threw; instead **every audit record and every generated PDF rendered "—" for SQS Score and Test pass rate for three months.** On a compliance document that reads as "unavailable for this transaction" rather than "permanently gone", which is worse than a crash.

Removed the field and the two dead cells, kept schema validation (the one cell still backed by real fields). Did not restore backend-side: SQS was retired deliberately and the frontend's own CLAUDE.md says "SQS is dead — do not reintroduce it". Left a comment so nobody re-adds it without a real source. Shape check now passes 25/25 both sides.

**Not merged.** The `build-and-test` job is red — 47 pre-existing lint errors (`no-explicit-any` etc.), **zero of them in my files**, mostly in vendored `src/components/ui/` primitives the repo's rules say not to drive-by-edit. Frontend `main` has been red on this job since the CI workflow was added 2026-07-03. Cloudflare Pages (the actual deploy) passed. Merging publishes to the live site, so that's your call, not mine.

**Related: the frontend CI signal is effectively dead** — a job that has been red for a month gets ignored, which is how the next real failure will slip through.

## strale-frontend PR #13 — lint, partial by design (open)

`build-and-test` has been red on frontend `main` since the CI workflow landed 2026-07-03, so every PR inherits a failing check and the signal is dead.

**It could not be taken to green, and the reason matters.** Of 47 errors, only **7** were safe to touch:

- **21** sit in files the in-flight work is **deleting** (`ZoneBReliability`, `StepQualityTable`, `ZoneCCompliance`, `api.contract.test.ts`) — fixing them is wasted; they vanish when that work lands.
- **19** sit in files with **uncommitted edits**, including `src/lib/api.ts` alone at 14. Staging any of those would have committed your work-in-progress along with a lint fix.

Four of those files — `api.ts`, `Security.tsx`, `learnGuides.ts`, `generate-sitemap.ts` — had been modified **within 30 minutes** of my starting. The tree is actively in use, so I built the branch in a separate `git worktree` off `origin/main` and never touched the working tree. Verified afterwards: all 60 WIP files still present and unmodified.

Fixed: eslint override scoping two rules off `src/components/ui/**` (vendored shadcn — both rules fire on how upstream ships them, not on defects); deleted two dead exports in `quality-indicators.ts`; tailwind `require()` → ESM import; one `any` in `run-site-tests.ts`. **54 problems → 40, all 7 warnings gone.** tsc clean, build succeeds, 23/23 tests.

Two things worth knowing:
- The `quality-indicators.ts` deletions were the same pattern as the AuditRecord drift — the `any` casts were hiding that both functions read step fields that don't exist on the type, so one could only ever return `null` and the other counted every step as "live". They were never called, so nothing changes behaviourally.
- The tailwind swap was verified past "it built": `animate-in`/`fade-in`/`zoom-in` are present in the emitted CSS, and those are plugin-generated. An ESM default-import swap can silently no-op.

**Then, on your call, made it non-blocking — and CI is now GREEN.** Second commit on the same PR.

**The bigger finding came out of this.** `Lint` ran *first* in the workflow, and a failed step halts the job. Verified against a real run: `Lint failure → Test skipped → Build skipped`. So **Test and Build have been skipped on every CI run for a month** — the frontend has had no automated test or build verification in CI at all, and a broken build would only have surfaced at deploy time. Reordering Test and Build ahead of Lint is the fix that actually mattered; the lint noise was the smaller half.

For lint itself I did **not** use `continue-on-error` — it unblocks the job by making new errors fail nothing, which is the same dead signal by another route. Instead `scripts/lint-ratchet.mjs` compares against a per-file baseline of the 40 accepted errors: known backlog passes, new offender or a file exceeding its allowance fails by name.

Per-file rather than a single total, because a total lets a new problem hide behind an unrelated improvement — verified exactly that: with a 9-error file deleted and one fresh error added the total drops 40 → 32 (under a total threshold) and the ratchet still fails. All five branches were exercised, including that improvements *pass* with a "tighten the baseline" note, since an improvement turning CI red is the trap that created this mess.

**When your WIP lands, ~21 errors vanish with the deleted files — run `node scripts/lint-ratchet.mjs --update` to tighten the ledger.**

Both commits were built in throwaway `git worktree`s off origin; the live tree was never touched (verified: 60 WIP files present and unmodified, still on your branch, before and after).

## Things found along the way that are NOT mine

1. **`apps/api/src/routes/wallet.ts` has an uncommitted local change** — Stripe redirect URLs moved from `/?topup=success` to `/topup?status=success`. It appears in no commit and no branch, and was not in the session-start git status. I did not author it, did not stage it, and left it untouched per the git working-copy safety rule. **Someone should confirm whether it's wanted** — it looks like deliberate work-in-progress matching a frontend `/topup` route, but it's currently unversioned and one `git checkout` away from being lost.

2. **`AuditRecord.quality` frontend/backend drift** (task chip `task_c17a28f8`) — `check-shape-contracts.mjs` reports the frontend declares `quality: { sqs, label, pass_rate }` which the backend no longer ships. Almost certainly SQS-deletion fallout (DEC-20260503-B). It passes in GitHub CI only because the frontend repo isn't checked out there, so the comparison silently skips — worth making a skipped check say so rather than look green.

3. **9 test files fail locally on `main`** (SSRF buckets, admin/internal routes, health-deep) with `Test timed out in 10000ms` importing `app.ts` → `auto-register.ts` (310 dynamic imports). Verified pre-existing by stashing my diff and re-running clean. They pass with `--testTimeout=60000`. CI is green on them. The default timeout looks too tight for that import graph on a loaded machine.

## Open threads

- **PR #152** awaiting CI/merge at time of writing.
- **Capability gaps from search demand** (task chip `task_6dc8cf31`): South Africa company data; travel/trip planning; reminder/scheduling; incident logging. Plus the cheapest one — **a text-rewrite capability**, since `summarize`, `translate`, `classify-text` and `email-draft` already exist as neighbours and "rewrite" returned zero.
- The `railway-config.md` Browserless v1 pin revisit date was **2026-08-06** — tomorrow relative to this session.
