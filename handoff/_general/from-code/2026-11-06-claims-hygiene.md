Intent: fix four narrowing claim defects the promise audit found (docs/research/2026-11-06-customer-promise-inventory.md, items 2, 3 and 6 of its defect list, plus the FRONTEND_URL left over from DEC-20261105-A).

- `env-template-generate` (P-039): Claude writes each variable's description and example, yet production tags it `algorithmic` and its page says "no AI model writes the answer". Manifest retagged `ai_generated`; startup-migration block 0144 writes the live row, because `transparency_tag` is db-canonical and the boot sync never writes it.
- `dependency-audit` (P-038): it queries npm or PyPI and OSV.dev and uses no AI model. Its `data_source` said "no external data" and its limitation said "AI-based audit". The manifest and `seed-limitations.ts` are corrected; `data_source` reaches production through the boot text sync (developer-tools is not report-only), and block 0144 rewrites the one limitation row, guarded on the exact live text read from strale.io/tools/dependency-audit.
- Root `README.md` (P-016): "IP-based daily rate limit" becomes "monthly allowance".
- `.claude/cloud.json`: `FRONTEND_URL` is https://strale.io.

Not changed, on purpose: production tags `tech-stack-detect` `ai_generated` although its executor uses no model (PR #938's manifest says `algorithmic`). Retagging it would widen a claim ("no AI model"), which DEC-20260822-A keeps out of the narrowing autonomy, so it waits. `annual-report-extract` (not live) keeps its mislabel until it is relisted.

Post-deploy check: `GET /v1/capabilities/env-template-generate` returns `transparency_tag: ai_generated`; `GET /v1/capabilities/dependency-audit` returns the new `data_source`; the tool page shows the new limitation text.
