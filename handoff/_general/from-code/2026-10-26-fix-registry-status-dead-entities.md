Intent: make live registry lookups report deleted, deregistered and liquidating companies correctly (NO, PL, CZ, FI, GR), and keep those findings in the risk narrative. PR #746 (replaces #745).

What changed
- Executors: `norwegian-company-data` + `no-bankruptcy-check` (Brreg `SlettetEnhet` / `slettedato`, compulsory dissolution), `polish-company-data` (KRS deregistration entry; the old code read a key KRS does not have), `cz-company-data` (VR liquidator appointments, IR insolvency, dissolution date), `finnish-company-data` (living non-trade-register entities), `greek-company-data` (inactive matched before active). Recorded real responses under `apps/api/src/capabilities/__fixtures__/registry-status/`, personal data removed; the Norwegian deleted case is a limited company (AS 994387057, deleted 2026-10-15), not a sole trader.
- `risk-narrative-generate`: an explicit per-executor list of non-active status values (cited to each executor or the official vocabulary: Receita Federal, ABR, data.gov.sg, Zefix, Corporations Canada, CRO) bypasses AI synthesis; deterministic, plain-language findings with `source_check`; an entity that no longer exists, or a critical flag, is `critical` on that path; unrecognised values keep AI synthesis.
- `lib/vendor-terms.ts`: Brreg (NLOD), KRS (statutory), PRH (CC BY 4.0), GEMI (ODC-BY) permitted; ARES unverified under DQ-40. The guard test follows imports into reachable `src/lib` helpers and detects hosts by substring; provenance/label literals are ignored only when the file never reads that property back.
- Also on main via #742: `apps/api/src/lib/company-status/__fixtures__/dead-entities.json` no longer holds the sole trader's organisation number.

Review
- Built by Codex CLI (four rounds); four independent read-only reviews in separate contexts (findings fixed each round); orchestrator fixes on top. Verdicts are recorded in the PR body, not here.

Evidence
- archive/receipts/2026-10-26-test-run-registry-status-dead-entities-final.json (full API suite 5043 passed, 0 failed; tsc clean; written from the working tree on top of a4dc5853, committed with this file).

Production steps left
1. Merge and deploy.
2. Re-sync the Polish known-answer fixture (still MARTOM, itself deregistered) with `cd apps/api && npx tsx scripts/sync-known-answer-fixtures.ts --slug polish-company-data` — needs production write authority.
3. After deploy, confirm NO 994387057, PL 0000106150 and CZ 01485377 return their corrected statuses.
4. Follow-up PR: re-add NO, PL, CZ, GR to `company-status-check` routing.
5. Petter: delete branches `fix/registry-status-dead-entities` (history held fixtures with personal data) and, after merge, `fix/registry-status-dead-entities-v2`.
