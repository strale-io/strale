Intent: work the open items left by the Serper validation thread, which turned into a security-hygiene session — manifest PII remediation, a live admin credential rotation, and a repo-wide secret sweep.

Sibling record: `2026-08-09-serper-country-validation.md` covers the Serper country/language work that preceded this. Read that first for the `/v1/do` and capability-gap items still open.

## What shipped

| PR | What |
|---|---|
| [#163](https://github.com/strale-io/strale/pull/163) | `language`/`hl` validation, country aliases + diacritic folding, `iso-country-lookup` reliability fix |
| [#164](https://github.com/strale-io/strale/pull/164) | phantom-drift fix in `sync-manifest-canonical-to-db.ts` |
| [#165](https://github.com/strale-io/strale/pull/165) | Serper session handoff record |
| [#166](https://github.com/strale-io/strale/pull/166) | backfill 14 untracked handoff records (May–Aug) |
| [#167](https://github.com/strale-io/strale/pull/167) | remove real people's names from manifest examples + CI gate |
| [#169](https://github.com/strale-io/strale/pull/169) | scrub two committed credentials |

Plus: `ADMIN_SECRET` rotated in Railway production (operator-run), prod manifest syncs for four slugs.

## The security work

**`ADMIN_SECRET` was live-exposed for ~5.5 months.** `handoff/_general/from-code/2026-02-27-admin-stats-webhooks.md:30` carried the full production admin secret in plaintext, with a worked `curl` example against `/v1/admin/stats` beneath it. Found incidentally while scanning handoff files before the #166 backfill — i.e. it surfaced because we were committing *other* files, not because anything was looking for it.

It was confirmed live, not stale: the committed value matched the current local `.env`. It guards all of `/v1/internal/*`.

Rotated 2026-08-10/11 by Petter via Railway CLI. Verified: old token → 401, new token → 200, local `.env` updated and confirmed matching.

**A second live credential turned up in the follow-up sweep.** `archive/growth-ops/upload-graphics.sh:2` carried a full `TYPEFULLY_API_KEY`, committed 2026-04-18. Removed from the script in #169 but **NOT ROTATED** — still outstanding, see Open below.

## The PII work

The 2026-05-18 fixture audit flagged real board members in two manifests as an out-of-scope finding and recommended a remediation to-do. Three months on it was still open. The sweep for the fix found **five** manifests, not two — the audit's scope was `directors`/`partners`, and the three Nordic manifests use `board_members`. The same Swedish board member was in three of them.

Fixed with placeholders that preserve the local format (`NAME (Role)`, casing, nested `{name, role}`), plus `check-manifest-pii.mjs` wired into CI.

## Non-obvious learnings

**Redaction is not remediation, and saying so matters.** Both credentials are in git history permanently; no file edit removes them. Rotation is what makes a leaked value worthless. Every artifact from this session states that explicitly, because a redacted file reads like a closed incident and isn't one.

**Scoped audits leave a shaped hole, and the hole persists.** The 2026-05-18 PII audit was correctly scoped to fixtures, correctly reported its out-of-scope finding, and the finding still sat for three months. Two lessons: an out-of-scope finding needs an owner and a tracking item at the moment it's raised, and the re-sweep should widen the field list rather than trust the original one (`board_members` was invisible to a `directors`/`partners` search).

**A structural cause needs a structural fix or it recurs.** `scrubFixture()` / `PII_ARRAY_FIELDS` run at CAPTURE time on executor output; manifests are hand-authored, so nothing ever inspects them. Fixing five files would have left the sixth. Same shape as the phantom-drift bug: the sync script pushes ALL manifest-canonical fields at once, so a permanently-dirty field is a standing invitation to re-run it — and a re-run overwrites genuinely-newer prod values with stale manifest ones. Both got a gate, not just a patch.

**Don't build a detector that has to guess.** `check-manifest-pii.mjs` deliberately does not try to decide whether a string "looks like a real person" — that isn't decidable, and a heuristic fails both ways (missing real names, blocking legitimate edits). It requires PII arrays in examples to be empty, null, or *explicitly synthetic*, which is checkable. Placeholder markers are recognised in the registries' own languages so examples stay native.

**Shape vs membership validation is a real design axis.** `country` validates membership (the table existed, completing it was bounded and verifiable); `language` validates shape (an ISO 639-1 table authored from scratch would create a completeness cliff that hard-rejects valid callers — the exact trap the country table set). The residue shape validation accepts (`"xy"`) is pinned by a test named `knowingly accepted residue` so nobody later "fixes" it into a list.

**Environment traps that cost real time this session:** PowerShell vs bash (`<` is reserved, no `tr`, `curl` aliases to `Invoke-WebRequest` — use `curl.exe`); Railway CLI links per-directory, so it fails from `C:\Windows\system32`; and `/tmp` resolves differently for Git Bash and Node on this machine, which produced a false verification reading earlier in the day.

## Open

1. **`TYPEFULLY_API_KEY` is not rotated.** `archive/growth-ops/upload-graphics.sh`, committed 2026-04-18, value in git history. Likely grants posting rights on the social accounts behind the Notion Social Media Posts DB. **Petter action.**
2. **GitHub secret scanning + push protection is not enabled.** Two live credentials reached `main` five months apart; that's a preventive gap. Recommended over hand-rolling a third bespoke CI gate — it blocks at push time and knows vendor key formats. Repo-settings decision, **Petter action.**
3. **`/v1/do` returns 500 for caller-input errors** while x402 returns 400. Reviewer rated HIGH; downgraded to MEDIUM and shipped with Petter's explicit approval, since it's pre-existing across all 290+ capabilities. Proper fix is a typed `InvalidInputError` in `do.ts` plus a retrofit-scope decision.
4. **Company-name → phone capability.** Real demand signal (an x402 caller paid for 50 searches to do one job). Needs vendor, data source, and price decisions before build.
5. **`iso-country-lookup`'s rich table is still 204 entries.** The 46 added are validation-only identifiers; completing it needs authoritative capital/currency/language data, and inventing it ships fabricated data.
6. **`/go` runs 2 of the 15 CI gates.** #160 went red on push after a clean local run. Widen the skill or document it as necessary-not-sufficient.
7. **`pep-check` names Angela Merkel — reviewed and deliberately kept.** A PEP-screening example can't demonstrate itself without naming a PEP. Not flagged by the new gate (its names sit under `matches`, not a roster field). Recorded so a future sweep doesn't re-litigate it.

## Cost

Zero external API spend. All capability verification ran against stubbed `fetch` or hit the ALLOW_MATRIX guard blocking paid capabilities in `internal_test` context.

## Process notes

Working copy rests on `main`. `fix/registry-name-resolution` was merged and deleted by a concurrent session mid-work, so there was no branch to restore to. That session's uncommitted `apps/api/src/capabilities/web-extract.ts` change (a Browserless timeout adjustment) is still in the working tree and was deliberately never staged — every commit this session staged files by name.
