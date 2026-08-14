# 2026-08-09 — Serper country validation

Intent: run `/activity since-last`, then act on what it surfaced — three Serper-backed capabilities were billing customers for searches whose geo-scoping was silently discarded.

## What triggered it

`/activity since-last` over 2026-08-09 02:19 → 10:46 CET: 56 external calls, 56 completed, 0 failed, **100% x402** (anonymous USDC, no signup). Zero wallet, zero free-tier, zero signups, zero website searches.

Breakdown: `google-search` 51, `uptime-check` 3, `phone-validate` 1, `tech-stack-detect` 1.

The 51 google-search calls were one coherent job — bulk contact enrichment of Mexican freight/trucking and auto-parts companies (~40 carriers, ~8 parts suppliers, ~6 individuals), all on the template `"<name>" 墨西哥 phone contact`. The unrelated `uptime-check`/`tech-stack-detect` calls all hit the same Hostinger subdomain with a `?cache_probe=` param — someone debugging their own site's caching.

**The finding:** 50 of those 51 calls passed `country: "墨西"` — truncated Chinese for "Mexico", not an ISO code. Serper silently ignores an unrecognised `gl`, so all 50 were billed, all 50 ran globally unscoped, and the response echoed the caller's own bad value back. Nothing anywhere surfaced that the geo-scoping had been dropped. The prompt was clearly LLM-authored; nothing in our stack pushed back.

## What shipped

[PR #160](https://github.com/strale-io/strale/pull/160) — OPEN, MERGEABLE, not merged.

- Validation before the paid call in `google-search`, `serp-analyze`, `keyword-rank-check` (Test Infrastructure Cost Principle B).
- ISO 3166 table extracted out of the `iso-country-lookup` capability into `apps/api/src/capabilities/lib/iso-3166.ts`, so validation has one source of truth. New `resolveCountryAlpha2()` (strict) and `resolveCountryOrThrow()` (the form capabilities call).
- 74 new tests across two files.

### Behaviour changes

1. Unresolvable `country` → hard error instead of a silently-unscoped billed search.
2. `serp-analyze` / `keyword-rank-check` previously lowercased and forwarded verbatim, so `MEX` / `Mexico` / `484` went upstream as `gl=mex` / `gl=mexico` / `gl=484` and were ignored. Now resolve to `gl=mx` — previously broken silently, now correct.
3. `google-search` echoes `search_parameters.country` lowercase now, matching the `gl` sent and matching the other two.
4. `{"country": 484}` (JSON number) is coerced rather than discarded.

## Non-obvious learnings

**The ISO table was 204 of 249 entries and nobody knew.** The comment above it claimed "All 249". Harmless for years because a miss only degraded a lookup — but the moment the same table gates paid traffic, every missing entry becomes a hard rejection of calls that work today. Missing: Sierra Leone, Grenada, Saint Lucia, Solomon Islands, **Cayman, BVI, Jersey, Isle of Man** and 38 others — i.e. precisely the offshore jurisdictions this platform's KYB traffic searches. Caught by both reviewer passes independently; it was a genuine ship-blocker created by an otherwise-correct fix.

Resolved by adding the 46 missing entries as **validation-only identifiers** (alpha-2 / alpha-3 / numeric / name only), deliberately kept *out* of the rich `COUNTRIES` array that feeds `iso-country-lookup`'s customer-facing response. Populating capital / currency / calling-code / language from memory would have shipped fabricated data — the same failure class as the `domain-contact-extract` invented-phone-numbers bug (#157).

**The table also contains Kosovo (XK/XKX/383), which is a user-assigned code, not officially assigned in ISO 3166-1.** That's why the count comes to 250, not 249. The test asserts this explicitly rather than being bent to fit.

**Zero-padding short numeric input is a silent-wrong-answer path.** `"84"` → `084` → Belize, when a caller passing a dialling code means Vietnam. Numeric codes are canonically three digits; the resolver now requires exactly three.

**`input_schema` is documentation, not enforcement.** Traced it: `do.ts` and `x402-gateway-v2.ts` both read `input_schema` but only check `required` field *presence* — never `type`, `enum`, or `pattern`. So an `enum` constraint in a manifest would not be an inert-but-harmless addition; it'd be unrepresentable in the type the pipeline understands. Inline per-capability validation is currently the only enforcement point that exists. Worth knowing before anyone proposes "just add an enum to the manifest".

**Verifying regression direction is cheap and caught a real gap.** Temporarily reverting `serp-analyze` produced 7 failures; restoring returned green. The test design that made this durable: `fetch` is stubbed with a spy that *fails the test if called*, so the assertion is "rejected before the billed call", not merely "rejects".

## Open

> **Superseded — read the Update section at the bottom of this file first.**
> Items 1, 3, 4 and the step-3 half of item 6 were all resolved later the same
> session (PRs #162/#163/#164, plus the prod sync). Items 2 and 5, and the
> 204-entry half of item 6, are still open and are restated at the end.

1. **The manifest half of the fix does not reach production on merge.** `GET /v1/capabilities` and the x402 catalog serve `input_schema` from the **DB column**, not the YAML, and `scripts/onboard.ts` never writes `input_schema`. Agents keep seeing the bare `country: string` until someone runs `npx tsx scripts/sync-manifest-canonical-to-db.ts <slug>` for all three (dry-run first — it writes to the prod DB). Needs Petter's go-ahead.
2. **`/v1/do` returns HTTP 500 `execution_failed` for caller-input errors** (reason nested in `details.error`), while x402 returns 400 with it at top level. An agent applying "5xx = retry" retries the same bad input. A reviewer rated this HIGH; **I downgraded it to MEDIUM and shipped** — it is pre-existing for every executor validation error across all 290+ capabilities, so this PR joins the class rather than creating it. Proper fix is a typed `InvalidInputError` mapped in `do.ts`, changing error shape platform-wide. Flagged in the PR body; Petter's call.
3. **`language` / `hl` has the identical hole** in all three capabilities. Google ignores an unrecognised `hl` exactly as it ignores `gl`. Same one-line fix, deliberately out of scope.
4. **Alias coverage is thin** — only `UK`→`GB`. Rejected today: `Czechia`, `Türkiye`, `UAE`, `Holland`, `England`, `Ivory Coast`, `Burma`. ~15 more aliases would cut the failed-call rate cheaply, and the traffic is LLM-authored, so this matters more than it would with human callers.
5. **Capability gap the traffic revealed:** the entire job was "company name → phone number". We have `domain-contact-extract` but nothing going name → contact directly. This caller paid for 50 Google searches to do one job a single capability could serve.
6. **Pre-existing, untouched:** `iso-country-lookup`'s rich table is still 204 entries, and its manifest declares `name`/`alpha_2`/`region` as top-level guaranteed fields while the executor nests them under `match` (smoke-test Step 3 fails on this, on `main` too).

## Cost

Zero external API spend — all verification ran against stubbed `fetch` or hit the ALLOW_MATRIX guard that blocks paid capabilities in `internal_test` context. No Serper calls consumed.

## Process note

The working copy switched branches twice mid-session without my doing it (`fix/serper-country-validation` → `main` during the review, and `main` → `fix/registry-name-resolution` after the PR was opened). The first time I didn't re-check before `git commit`, so the commit initially landed on `main`; I moved it with `git branch -f` and restored `main` to `origin/main` — nothing discarded. Worth knowing another session or worktree appears to be operating on this repo concurrently. PR #160's branch is intact on origin and verified MERGEABLE after the switch.

---

# Update — session continued past the first write-up

Everything above described the state at PR #160 open-but-unmerged. Four PRs are now merged and prod is synced and verified.

## Merged

| PR | What |
|---|---|
| [#160](https://github.com/strale-io/strale/pull/160) | country validation before the paid call, ISO table extracted to shared lib, 46 missing entries added |
| [#162](https://github.com/strale-io/strale/pull/162) | reconcile `google-search` `output_schema` with prod |
| [#163](https://github.com/strale-io/strale/pull/163) | `language`/`hl` validation, country aliases + diacritic folding, `iso-country-lookup` reliability fix |
| [#164](https://github.com/strale-io/strale/pull/164) | fix phantom drift in `sync-manifest-canonical-to-db.ts` |

Prod synced for all four slugs. `/v1/capabilities/:slug` verified serving both the `country` and `language` descriptions for `google-search`, `serp-analyze`, `keyword-rank-check`.

## Non-obvious learnings from this half

**`/go` runs 2 of the 15 CI gates.** PR #160 failed CI on `lint:no-bare-catch` (F-0-009) — my test file used `.catch(() => {})` four times. `/go` runs `tsc` and `vitest`; CI runs fifteen checks. Anything `/go` greenlights can still be red on push. Worth either widening the skill or treating `/go` as necessary-not-sufficient. The fix was better shape anyway: `await expect(...).rejects.toThrow(/fetch called/)` asserts we reached the network boundary, which is the thing that proves validation let the input through — a bare catch would have hidden a validation error thrown earlier and still passed.

**Postgres `jsonb` does not preserve key order, and the sync script compared raw `JSON.stringify`.** So any object whose manifest key order differed from jsonb's (length, then bytewise) reported drift *forever* — sync it, get "Updated 1 row(s)", dry-run again, still dirty. `iso-country-lookup` and `keyword-rank-check` both did this.

That phantom drift is not cosmetic, and this is the load-bearing lesson: the script pushes ALL manifest-canonical fields in one shot, so a permanently-dirty field is a standing invitation to re-run it — and a re-run overwrites genuinely-newer prod values with stale manifest ones. That is exactly the near-miss with `google-search`'s `output_schema` (prod had a captured Stripe example, manifest still had the original speedtest placeholder). Phantom drift makes the field-by-field inspection habit harder to sustain, because most of what it flags is noise. Fixed in #164.

**Shape validation vs membership validation is a real design axis, not a shortcut.** For `country` we validate membership, because the table already existed and completing it was bounded and verifiable. For `language` we validate shape, because an ISO 639-1 table would be authored from scratch and anything missing from it hard-rejects a caller who did nothing wrong — the exact trap the country table set. Shape validation has no completeness cliff. It does accept `"xy"`; that residue is pinned by a test literally named `knowingly accepted residue` so the next reader doesn't "fix" it into a membership list.

**`/tmp` is not the same path for Git Bash and Node on this machine.** `curl -o /tmp/x.json` followed by `readFileSync("/tmp/x.json")` in node silently reads a different location (`C:\tmp\...`). This produced a false "NO DESCRIPTION" reading during prod verification that sent me hunting a nonexistent cache for several minutes. Use absolute scratchpad paths for any curl→node handoff.

**Aliases: fold, don't enumerate.** Diacritics were about to become one alias per accented character. Folding NFD + stripping combining marks on both sides handles `Cote d'Ivoire`, `Aland Islands` and `Saint Barthelemy` in one line. Aliases are then reserved for genuinely different names (`Czechia`, `Holland`, `Scotland`, `Burma`). Ambiguous names (`Korea`, `Congo`, `America`) stay refused, with a test pinning that so future additions cannot quietly widen into a guess.

## Open — carried forward

1. **`/v1/do` returns 500 `execution_failed` for caller-input errors; x402 returns 400.** Not a capability fix — it changes the error contract for all 290+ capabilities. Needs a typed `InvalidInputError` in `do.ts` and a decision on retrofit scope (these three, or the whole catalog). Customer-visible response-shape change; existing clients branching on 500 would be affected. **Petter's call.**
2. **Company-name → phone-number capability.** The x402 traffic is a real demand signal (a caller paid for 50 Google searches to do one job). This is a build, not a fix: needs data source, vendor, price, and a full onboarding-protocol pass. **Petter's call.**
3. **`iso-country-lookup`'s rich table is still 204 entries.** The 46 added in #160 are validation-only identifiers. Completing the rich table needs authoritative capital / currency / calling-code / language data per country; inventing those ships fabricated data to customers (cf. #157).
4. **`/go` gate coverage** — see above.

## Process note (updated)

The concurrent-branch-switching described earlier did not recur after the first two occurrences. All four PRs were branched from a freshly-pulled `main`, and the working copy was returned to `fix/registry-name-resolution` clean at the end.
