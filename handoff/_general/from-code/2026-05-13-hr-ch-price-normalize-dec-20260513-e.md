Intent: ship DEC-20260513-E — normalize HR `croatian-company-data` and CH `swiss-company-data` from €0.80 to €0.05 customer price; fix CH `capability_type` DB drift (scraping → stable_api) in the same pass.

## Outcome — shipped

**PR #110** merged at 2026-05-13T12:58:48Z (squash, merge commit `86b04be`).
- https://github.com/strale-io/strale/pull/110
- 2-line manifest diff: `manifests/croatian-company-data.yaml` and `manifests/swiss-company-data.yaml`, `price_cents: 80 → 5`.

**DB UPDATEs applied to Railway production:**
```sql
UPDATE capabilities SET price_cents = 5 WHERE slug = 'croatian-company-data';
UPDATE capabilities SET price_cents = 5, capability_type = 'stable_api' WHERE slug = 'swiss-company-data';
```

**Smoke probes (post-UPDATE, production):**
- HR: txn `dc19948a-9dab-4932-88fd-3d01645c777f` — Hrvatski Telekom d.d., 5 cents charged, 1098 ms.
- CH: txn `35ff87e3-05d3-4903-97f3-20a553e76c13` — Roche Holding AG, 5 cents charged, 469 ms; provider `zefix-public-rest`, `provider_type: api`, fallback_used=false (clean Zefix REST path).

**Sibling-repo grep:** 3 benign hits in `strale-frontend` (sitemap URL, fixture workaround text, test-report HTTP-200 check). No 80-cent hardcoding. `strale-beacon`: zero hits. No follow-up needed.

## Open

- Petter to populate **DEC-20260513-E Outcome field** with PR #110 link: https://www.notion.so/35f67c87082c81f499a9cbb9ebb39553
- Out of scope per DEC: CA + JP €0.80 (scraping-cost-justified), catalog-wide `capability_type` drift on other slugs, 8 inactive €0.80 caps (re-price on reactivation).

## Non-obvious learnings

1. **`price_cents` is db-canonical, not manifest-canonical** per `apps/api/src/lib/capability-field-authority.ts:103-106`. Manifest seeds on create; DB UPDATE is the operational change. Backfill via `onboard.ts --backfill` would NOT overwrite admin-tuned DB prices. This means the manifest commit is hygiene (drift-prevention for fresh-DB rebuild + human-readable seed), not the operational fix. The DEC's "prevent silent overwrites on backfill" framing reads sideways from the field-authority docstring — both are right; the field-authority module is what enforces the non-overwrite, the manifest commit just keeps the seed file aligned.

2. **`capability_type` is hybrid** per `capability-field-authority.ts:271-274` — DB preserved if set, manifest only fills NULL. CH's stale `scraping` tag would have survived any backfill. Direct UPDATE was the only path.

3. **Manifest data_source_type → DB capability_type mapping** is in `apps/api/src/lib/capability-manifest.ts:41-54` (`dataSourceTypeToCapType`): `api → stable_api`, `scrape → scraping`, `computed → deterministic`, `ai_assisted → ai_assisted`. CH manifest declared `api`; correct DB value was `stable_api`.

4. **`/v1/do` request schema:** body field is `inputs`, not `input`. Took 3 attempts to land the smoke probe. The 400 error message hints at `top-level → inputs` migration only — doesn't catch `input → inputs` (singular vs plural). Worth a future error-message tweak if the same trip hits more agents.

5. **Working-tree state mid-session:** the manifest commit landed on the feature branch, then a separate process (likely a hook or worktree switch) returned HEAD to main, which made it look like the manifest changes had been reverted. They hadn't — the branch still held the commit. Don't trust working-tree state alone as proof of commit state; check `git log <branch>`.

## Cost

Minimal — 2 smoke `/v1/do` calls (€0.10 total at the new prices) + the planning-prompt + go-prompt thread time.
