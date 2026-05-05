Intent: Close out the post-PR-55 session — run a five-check production verification, investigate three anomalies it surfaced, and attempt to repair the Railway-hosted chromium service. Halted before completion; chromium repair resumes tomorrow.

## What shipped

**PR #56** — `test(startup-migrations): close two regression-net gaps from retro review`. Merged 2026-05-04T21:41:20Z.
- Updated `fakeBlocks` fixture in `admin-apply-migrations.test.ts` from 6 → 7 entries (PR #55 added block 0063; the fixture had drifted).
- Replaced the orchestrator failure-aborts test that was calling a per-block function directly. New tests use `vi.mock("../db/index.js", …)` to inject a stub executor and call `runStartupMigrations()` itself, with two scenarios: (1) executor-level failure on first query, (2) realistic post-condition violation in block 0062. Both verified to fail against the un-applied fix per DEC-20260504-A.

**PR #57** — `docs(startup-migrations): document postgres-js coercion shapes per audit`. Merged 2026-05-04T21:45:30Z.
- Five one-line comments documenting the verified `int4 → JS number` (post-condition checks) vs `bigint → text → string-compare` (information_schema checks) coercion patterns. Pure docs, no behaviour change.

**PR #58** — `fix(browserless): pass Chrome flags per-request — Browserless v2 LAUNCH_ARGS env is deprecated`. Merged 2026-05-04T~22:55Z.
- New `apps/api/src/lib/browserless-launch.ts` exporting `buildBrowserlessRequestUrl(baseUrl, path, token)` which appends both `?token=` auth and `?launch=<base64 JSON>` per-request Chrome flags.
- Wired into 8 call sites: probe (`chromium-health.ts`), web-provider (`web-provider.ts`), and 6 capability-direct paths (`annual-report-extract`, `company-enrich`, `estonian-company-data`, `web-extract`, `screenshot-url`, `html-to-pdf`).
- 6 regression tests assert base64-JSON shape, args list, URL builder shape, and token URL-encoding. Tsc clean.
- Helper is no-op against the public hosted Browserless URL — the hosted edge silently accepts the launch param. Stays merged regardless of root-cause resolution on the chromium service.

## What's open

**Anomaly 3 — Browserless quota-exhausted on hosted, self-hosted broken.** 32 active scraping caps degraded. Two flip attempts to internal targets tonight both produced HTTP 500 from chromium service. Tomorrow's first step is logging the actual `contentUrl` string the helper produces on first probe to disambiguate (A) args reaching Chrome but RLIMIT_NPROC bottleneck vs (B) URL shape silently rejected. Full state captured in Notion to-do `35667c87-082c-81d2-bea3-d9f049f28b00`.

**Anomaly 1 — `high_null_ratio` correctness checker is broken.** 21 algorithmic caps flagged with 0% pass rate over rolling 12h window. Sampled actual_output proves the capabilities are returning data — the checker is misclassifying nested-array fields and empty arrays as nulls. Three sub-buckets:
- 14+ caps with the high_null_ratio false-positive (e.g. `iso-country-lookup`, `dangerous-goods-classify`, `skill-extract`)
- `uk-cop-check` has a fixture bug (frozen `checked_at` asserted as `equals` against a fresh-each-call timestamp)
- `redirect-trace` has a real execution error (`Too many redirects (>0) — refusing to follow further` — max-redirects setting may be bad)

P2 investigation queued; not filed as separate to-do tonight (chromium repair was the priority).

**Anomaly 2 — array-binding bug at `invariant-checker.ts:547`.** Same bug family as PR #47 (skip-bumper UPDATE), different code path. Five additional sites in the codebase with the same `= ANY(${jsArray})` pattern that may be silently broken: `digest-compiler.ts:285`, `reply-webhook.ts:406`, `fetch-platform.ts:131,149,160`, `meta-monitoring.ts:780`. P2 sweep needed; not filed as separate to-do tonight.

**P3 to-dos filed earlier in session:**
- `35667c87-082c-8137-881c-e34c96a88916` — Apply 503-first-guard pattern uniformly across admin handlers (XS, security defence-in-depth)
- `35667c87-082c-8196-9c85-c2632fc8cb30` — Decide BlockResult.outcome field shape (S, founder-lens future-debt)

## Non-obvious learnings

**Browserless v2 dropped LAUNCH_ARGS without doc updates.** `LAUNCH_ARGS` is in `deprecatedConfig` in v2's source — silently dropped at startup, deprecation warning printed once. The env var has been configured on the chromium service the entire time and accomplishing nothing. `apps/api/railway-config.md:64-67` was authored against v1's pass-through and never updated. The hosted service tolerates the v2 defaults because its container runtime exposes `/sys/devices/system/cpu/cpu0/cpufreq/*`; Railway's containerd runtime doesn't, hence the cpufreq read errors that cascade into the pthread storm.

**Browserless v2 OSS-tier may filter Chrome flags by allowlist.** The docs note that `--no-sandbox` is not in the documented "all accounts" list — only `--disable-features`, `--disable-web-security`, `--enable-features`, `--lang`, `--proxy-server`, `--window-size` are guaranteed for OSS-tier. The full set is enterprise-only. This is a credible reason the second flip attempt still 500'd even with the helper in place; needs verification tomorrow.

**The retro six-lens review caught real issues that the per-PR self-asserted "clean" claims missed.** PR #56 fixed two MEDIUM findings (test fixture drift, orchestrator-test-doesn't-test-orchestrator) that the original PR-creation-time "Reviewer findings — clean" claims had glossed over. Pattern: when self-attestation replaces actual subagent invocation, real findings slip through. Worth keeping the autonomous post-merge retrospective as a habit on production-critical PR streams.

**A "P3 hygiene" to-do can mask a P1 active bleed.** The invoice-extract fixture to-do was filed P3 ("small absolute cost, no urgency") based on the static audit assuming the suite was paid-classified and therefore scheduler-skipped. The prod query revealed it wasn't — hourly Anthropic Haiku vision calls on a JPEG of a dog. Pattern: when an audit finding rests on "this should already be handled by [other system]," verify the assumption before filing as low-priority.

**Probe error bodies are diagnostic gold.** The `chromium-health-down` log stored only `HTTP 401`, dropping the response body. The body said "You've reached the units usage limit allowed under our free plan, please upgrade to a paid plan" — would have made today's diagnosis trivial in minutes. P3 to-do to log response bodies on probe failures (filed at https://www.notion.so/35667c87082c816e8908e2bd2732a797 per Petter's reference; mentioned in the session conversation).

## Cost
~3 hours total (continuation of the prior session's PR cluster). No customer impact beyond the pre-existing Browserless quota degradation. Two redeploys + two rollbacks of the chromium service routing produced no service disruption (hosted state was the steady state both before and after).

## Tomorrow's first step
Add a one-shot `log.info({ label: "chromium-probe-url", contentUrl: <stripped of token> }, …)` in `chromium-health.ts` right before the `fetch(contentUrl, …)` call. Confirm the URL shape on the wire. Branch from there per the diagnosis in the Notion to-do.

## Post-close to-do DB cleanup
Per Petter's request after the first /end-session report, executed targeted cleanup on the To-do DB drift items:
- Marked `35667c87-082c-81d4-911c-c061fc9b7e3d` "Add bulk-operation deploy protocol to CLAUDE.md (DEC-20260504-B)" as Done (shipped via PR #53).
- Cancelled both code-side duplicates filed earlier in this session: `35667c87-082c-8196-9c85-c2632fc8cb30` (BlockResult.outcome shape) → references canonical `35667c87-082c-8151-a377-c98aab0f3bcf`; `35667c87-082c-8137-881c-e34c96a88916` (503-first-guard) → references canonical `35667c87-082c-8142-b038-e54a17b18ee6`.
- Moved 6 high-confidence Done items to Archive > Completed To-dos: admin endpoint refactor (PR #52), retention LIMIT-paginate (PR #48), DEC-20260504-B (PR #53), Wire apply-migrations (PR #51), Audit historical apply-migrations blocks, [SUPERSEDED] Movitz VoP.
- 7 other Done-search hits left un-archived because the Notion search filter returned at least one false positive (an Inbox item matched on content). Spot-verified ones not moved are in the conversation transcript; safer for Petter to archive in his next sweep.

Lesson: the Notion search `filters.property_filters Status=Done` filter isn't strictly enforced at the API layer — content-matching items can leak through. Future archive sweeps should fetch each candidate's actual Status property before bulk-moving.
