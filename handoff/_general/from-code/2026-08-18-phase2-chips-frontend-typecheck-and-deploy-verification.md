# 2026-08-18 — The two open Phase-2 targets, closed out as PRs

Intent: execute the two chips left open when the Codebase Quality Program was audited for completeness — "typecheck everything including the dashboard" (T2.1) and "post-deploy verification standard, not heroic" (T2.4). Continues `2026-08-18-vendor-cost-audit-and-browserless-closeout.md`, which filed them rather than dropping them silently.

## What shipped

**[strale-frontend#19](https://github.com/strale-io/strale-frontend/pull/19)** — the dashboard has *never* had a TypeScript gate. Its CI is green on test → build → lint and none of those type-check: `vite build` uses SWC (strips types without checking), vitest runs untyped, the ESLint ratchet isn't type-aware, and Cloudflare Pages runs that same untypechecked build. Proven, not inferred: `const x: number = "str"` fails `tsc -b` and passes `vite build` on the same tree. PR adds `typecheck: tsc -b` and runs it in that repo's CI before Test/Build. CI green; the step was confirmed *executing* `tsc -b` in run `32128937922`, not merely reported green.

**[#331](https://github.com/strale-io/strale/pull/331)** — the backend side of the same target. A blocking PR gate was built here and then **deliberately removed**: strale-frontend imports no backend package, so a backend change cannot break its compilation; such a gate would only ever surface pre-existing frontend errors and blame unrelated PRs. What remains is one weekly-drift backstop that watches whether the frontend's own gate still exists and still passes.

**[#332](https://github.com/strale-io/strale/pull/332)** — `schema-validator.ts` blocked boot off a hand-maintained `REQUIRED_COLUMNS` array whose last entry covered migration **0050**. `startup-migrations.ts` has shipped **43 more blocks since**, none of whose columns/tables/indexes boot ever verified. Now derived from the SQL the block author already writes.

## The thing worth remembering

**A boot-blocking gate has asymmetric failure directions, and the asymmetry is the whole design.** Under-deriving is a smaller safety net. Over-deriving is a production crash-loop on every deploy until a human edits the parser. Review found three ways the first draft could do the latter:

- multi-column `ALTER TABLE ADD COLUMN a, ADD COLUMN b` matched only the first — *silently*. Worse than the stale list it replaced: a stale list is visibly stale, a regex miss is invisible.
- nothing subtracted `DROP`/`RENAME`, so the first block to remove a column would have taken prod down and kept it down. **No block does this today, which is exactly why it would have shipped unnoticed.**
- a collapsed parse derived zero artifacts → zero missing → "all clear". A broken parser *certifying* the schema is the same hollow-gate shape found three times this week.

All three fixed, all covered by tests proven to fail without the fix (parser reverted to pre-fix form → 6 new tests fail; restored → 28 pass).

## Verification actually performed

- Compiled-output parity: a real build to a temp `outDir` puts both modules in `dist/lib`; parsing the **compiled `.js`** yields the identical 36-artifact set as source. The runtime reads its compiled sibling, so this was tested rather than reasoned about.
- **All 36 artifacts checked read-only against production before merge — all present.** This is the row that gates merge: a boot-blocking check shipped unverified is precisely the "code is correct ≠ deploy will behave" failure DEC-20260504-C exists for.
- Backstop shell logic proven in all branches, including that `pipefail` is load-bearing (without it a failing `tsc` reports success).
- Test file run **standalone**, not only in batch — a batch-only pass burned this session once already.

## Merged and closed (Petter approved merge at the end of session)

All four merged in dependency order — the frontend gate had to land before the backstop that watches it:

1. strale-frontend#19 — verified live on that repo's `main` (`"typecheck": "tsc -b"` + a `Typecheck` CI step ahead of Test/Build).
2. #331 (backstop + T2.1 correction), 3. #332 (derived schema check, after `update-branch`; both PRs touched the same doc but in different sections, so no conflict), 4. **#333 — closes T2.1 with the run that proves it fires.**

**Execution proof obtained, not assumed.** Dispatched weekly-drift run [`32131992897`](https://github.com/strale-io/strale/actions/runs/32131992897): `FTC=0`, and the report shows `npm ci` installing 526 packages then a clean `tsc -b`. Real work, not a vacuous pass. That is what T2.1 was holding out for.

Zero open PRs on the backend. (strale-frontend#5 is a stale May PR, unrelated.)

## The manifest-drift check — fixed, and the 18 drifts with it (#334, merged)

**Two bugs were stacked, and fixing only the first would have made it worse.** `manifest-drift` was the one DB-touching step with no `DATABASE_URL`, so it died on `ECONNREFUSED` every week and never once compared a manifest to the database. But the script also ended in an unconditional `process.exit(0)` — so supplying the secret alone would have produced a check that connects, finds 18 real drifts, and **reports clean**. A loudly-broken gate converted into a silently-useless one. Now: exit 2 = couldn't run (says so), 1 = drift, 0 = clean; all three verified.

**The 18 drifts were resolved per capability, not by blind sync** — which mattered, because the two sides disagreed about which was right:

- **DB wrong, manifest right (17).** Four `transparency_tag` (`austrian`/`dutch`/`italian`/`portuguese-company-data`) claimed `ai_generated`; verified **zero** LLM references in all four executors *and* the shared `openapi-resolver` they delegate to — straight vendor API calls. We were over-claiming AI involvement in an EU-AI-Act field. Two `gdpr_art_22_classification` corrected to `screening_signal` (both produce findings customers decide on). `output_field_reliability` was stale in the DB across 7 caps — the known `onboard`-doesn't-sync-reliability gap. Several `input_schema` advertised `required: []` while the executor throws without input — the 2026-08-15 x402 shape.
- **Manifest wrong, DB right (1).** `email-pattern-discover` declared `processes_personal_data: false`. It regex-harvests real addresses from page HTML and returns them as `public_emails_found`. **A blind `--apply` would have flipped a GDPR flag from true to false** — the single best reason not to trust either side by default.
- **Both wrong (1).** That capability's input contract: executor throws unless `domain` *or* `url`; manifest said `required:[domain]`, DB said `required:[]`. Now `anyOf`.

**Verified end to end:** sweep exit 1→0, drifted 18→0, and a dispatched CI run ([`32134081484`](https://github.com/strale-io/strale/actions/runs/32134081484)) shows `Sweeping 334 manifests against DB... Drifted: 0` — the check connecting to the database in CI for the first time ever. **The whole weekly drift sweep is green for the first time.**

Left alone deliberately: `uk-disqualified-director-check` has `processes_personal_data = true` with an empty `personal_data_categories`; it searches people by name so `["name"]` is almost certainly right. Pre-existing manifest gap, not drift.

## The original finding (now resolved — kept for the record)

The sweep failed on `MD=1` (manifest drift). **Pre-existing** — it also failed in run `32125828728` before any of today's work — and the cause is structural: `manifest-drift` is the **only DB-touching step in weekly-drift.yml with no `env: DATABASE_URL`**. It has been dying on `ECONNREFUSED ::1:5432` and has **never once compared a manifest to the database**.

This is a fourth hollow gate, and the nastiest variety: it fails *every single week*, so the weekly drift issue has been trained into background noise.

Run locally against prod, the script works fine and reports **18 capabilities with real drift** — including **four where the DB says `transparency_tag="ai_generated"` while the manifest says `"algorithmic"`** (austrian/dutch/italian/portuguese-company-data). Transparency tag is a customer-facing claim about whether AI produced the answer, so that one is not cosmetic.

Fix is one `env:` block. Deliberately not bundled into a docs PR.

## Deferred with reasoning

Moving artifact derivation into per-block typed metadata on `BLOCKS`, with regex derivation demoted to a CI lint (raised by the altitude review on #332). Better long-term; changes every migration block's shape, so it deserves its own pass.

## Next session

1. Watch the first Railway boot after #332 for `startup-schema-ok` ("all migration-derived artifacts present"). All 36 artifacts were confirmed present in prod pre-merge, so this should be uneventful — but it is the first boot under the new gate.
2. `uk-disqualified-director-check`: set `personal_data_categories: ["name"]` (currently empty while `processes_personal_data` is true).
3. Optional, raised by review on #332: move migration-artifact derivation into per-block typed metadata on `BLOCKS`, demoting the regex to a CI lint. Better long-term; touches every migration block, so it needs its own pass.
