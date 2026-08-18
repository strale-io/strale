# Local branch cleanup — 2026-08-18

172 local branches reduced to 1 (main). Every deletion below was evidence-based, not a judgement call:

- `on-origin` — the branch still exists on GitHub, so deleting the local copy loses nothing.
- `local-only-but-proven-landed` — either a merged PR exists for it, or merging it into main produces main's own tree (it adds nothing).
- `proven-landed-via-merged-PR` — the squash-merge commit is on main, PR number confirmed.
- `abandoned-preserved-on-origin` — pushed to origin before local deletion.
- `superseded-by-*` — the capability exists on main by another route.

Recovery: branches marked on-origin are on GitHub. All others are recoverable from the SHA below via `git branch <name> <sha>` while the reflog retains them (~90 days), or `git fsck --dangling`.

```
analysis/demand-mining 379218e on-origin
audit/anthropic-cost-may-2026 5d8df9e on-origin
audit/conditional-llm-bypass-may-2026 4a5c3f1 on-origin
audit/live-registry-coverage-2026-05-06 0f84e36 local-only-but-proven-landed
audit/manifest-truth-pass 00606f8 local-only-but-proven-landed
catalog/mexican-company-data 8474141 on-origin
catalog/official-source-batch 1008bee on-origin
chore/eureg-manifest-pipeline-sync fd2d609 on-origin
chore/glama-maintainer-claim 5e0f011 on-origin
chore/hollow-package-guardrails 9cf9058 on-origin
chore/payee-to-counterparty-rename a7365cc local-only-but-proven-landed
chore/pii-fixture-audit-legal-representatives ad6de4c on-origin
chore/promote-handoff-notes-2026-05-11 302444f on-origin
chore/script-cleanup 7829dc0 on-origin
chore/stash-cleanup 5795d56 on-origin
chore/sweep-input-schema-drift 8992054 on-origin
chore/system-account-dedup 4348704 on-origin
design/receita-federal-ingest fc10959 on-origin
dist/bazaar-facilitator-switch 7a38a1e on-origin
docs/agents-md-refresh da11047 on-origin
docs/bazaar-indexing-mechanism aeb5fa6 on-origin
docs/be-parity-audit f23548e on-origin
docs/checkin-2026-08-18 02a5146 local-only-but-proven-landed
docs/checkin-handoff-0818 006b405 local-only-but-proven-landed
docs/competitive-landscape 00606f8 local-only-but-proven-landed
docs/directory-map-clean 83acacc on-origin
docs/dq14-founder-items c5c716a local-only-but-proven-landed
docs/growth-findings 19f2754 on-origin
docs/handoff-2026-08-15-checkin-defects 9cde2a1 on-origin
docs/handoff-coinbase-withdrawn 6c18939 on-origin
docs/identity-field-coverage-2026-05-15 8eb8c0e on-origin
docs/integration-cookbooks 00606f8 local-only-but-proven-landed
docs/listing-copy-rewrite 3867f07 on-origin
docs/mexico-token-blocked 3e989bc on-origin
docs/mexico-token-diagnosed b4ede9c on-origin
docs/phase-7b-enumeration b661074 on-origin
docs/retention-confirmed-inegi-steps e2752c8 on-origin
docs/session-close 3bbf472 on-origin
docs/us-topograph-scout-2026-05-15 34036a0 on-origin
examples/agent-templates 58b1784 on-origin
feat/agent-card-storefront d04c7bc on-origin
feat/attribution-source-inference 9f93591 on-origin
feat/customer-content-columns b0974de on-origin
feat/cy-open-data-directors 099840f on-origin
feat/dec-20260511-e-stuck-validating-sweep 03e3b64 on-origin
feat/jurisdiction-backfill f23548e local-only-but-proven-landed
feat/known-rate-limit-manifest-field b5f23ed on-origin
feat/mcp-advertises-x402 16e315e on-origin
feat/mcp-funnel-instrumentation c7cbecb on-origin
feat/page-exists-capability 91d8d9b on-origin
feat/phase-1-class-a-relabel-fr-sk-uk 87d21ae on-origin
feat/phase-2-extraction-cz 5ff9161 on-origin
feat/phase-2-extraction-no f812404 on-origin
feat/phase-3-extraction-lv 6efe043 on-origin
feat/phase-7a-it-stakeholders 3fbbd31 on-origin
feat/pii-retention-tier 46ecd78 on-origin
feat/revenue-heartbeat bd1f0f3 on-origin
feat/sk-company-data ab5845c on-origin
feat/slovenian-company-data f90c666 on-origin
feat/x402-discovery-sellers-first 14d7516 on-origin
feat/x402-unmet-demand b33b9ab on-origin
fix/activity-script-solution-labels 936750b on-origin
fix/budget-alert-fatigue 75d3c0d on-origin
fix/budget-counter-date-sql-code-review-json 6bb5cf4 on-origin
fix/canadian-name-search-post 5337714 on-origin
fix/capability-discoverability 28151f4 on-origin
fix/chromium-health-dead-wiring 4d6ab4a on-origin
fix/company-enrich-json-parse ccf4688 on-origin
fix/consolidate-registry-name-match 13e0c67 on-origin
fix/cost-control-refusals-not-faults fc3da1b on-origin
fix/credential-health-browserless-staleness cba7f41 on-origin
fix/dk-harden-safe-parts 9fd43f5 on-origin
fix/dk-phase-3-harden 88e8c6a on-origin
fix/dk-quota-headroom de108bc on-origin
fix/eu-regulation-search-cellar 8b72348 on-origin
fix/limitation-titles-undefined ad18334 on-origin
fix/live-registry-audit-followup-2026-05-06 0f84e36 local-only-but-proven-landed
fix/llm-json-adoption 42ea8f1 on-origin
fix/llm-json-truncation c5cb106 on-origin
fix/llm-price-table-refresh 640b15b on-origin
fix/name-match-confidence ab39abd on-origin
fix/officer-search-uk-filing-name-match b0295e5 on-origin
fix/onboard-strict-cost-class-seed 4b9c599 on-origin
fix/phase4-tail 37c5a0a on-origin
fix/quality-floor-promotion-grace d026bca on-origin
fix/quality-latency-internal-account-filter 962aeff on-origin
fix/reclassify-throttled-free-unlimited 6e679c0 on-origin
fix/refusals-not-capability-faults 53e6421 on-origin
fix/retention-all-customer-content 57891ef on-origin
fix/settlement-monitoring-gaps cb6b53d on-origin
fix/suggest-solutions-bias 3b27305 on-origin
fix/swedish-known-answer-variety 1a82ff0 on-origin
fix/t02-quality-floor-reinstatement-audit 02d3a4f on-origin
fix/ticker-resolution-and-x402-input-validation 179e5e7 on-origin
fix/web-extract-shared-resilience 45b1c02 on-origin
fix/widen-pii-guard-scope e338b54 on-origin
investigation/dk-phase-2-understand b658043 on-origin
ops/cut-browserless-harness-burn f9da813 on-origin
ops/data-use-boundary 05af683 on-origin
ops/notion-filed b0d90e2 local-only-but-proven-landed
ops/notion-filed-v2 8bc054c on-origin
ops/phase2-close-the-gates faf81eb on-origin
ops/phase3-debloat ed6ca0f on-origin
ops/session-closeout 3d07dde on-origin
ops/wire-shape-contract-gate e50caff on-origin
pr-120-head dd94144 local-only-but-proven-landed
pr144-work 5f36a41 local-only-but-proven-landed
pr175-work fa781c6 local-only-but-proven-landed
pr177-work 14014d5 local-only-but-proven-landed
refactor/in-ts-startup-migrations-convention 434fa32 on-origin
refactor/scheduled-testing-eligible-pr-a d7dfc26 on-origin
registries/greece-and-enumerations 00606f8 local-only-but-proven-landed
research/bundesapi-civic-tech-2026-05-06 d75fe82 local-only-but-proven-landed
research/compass-manz-at-2026-05-06 d105fe4 local-only-but-proven-landed
research/gap-recovery-candidates 84398f7 on-origin
research/gap8-direct-build-spikes 4093bd6 local-only-but-proven-landed
research/kyckr-evaluation 78aa040 local-only-but-proven-landed
research/midrebuild-verify-spikes a4d9f1a local-only-but-proven-landed
temp/at-origin-main-4 41c0542 local-only-but-proven-landed
test/openapi-com-sandbox-2026-05-06 131e0ed on-origin
test/us-court-search-fixture-restructure bacaeac local-only-but-proven-landed
test/wallet-do-coverage beae28d on-origin
tooling/session-state-marker 75fa750 on-origin
worktree-agent-a000fba7eea386276 644c1c5 local-only-but-proven-landed
worktree-agent-a00dbe2d51f8f438a 9e27faa local-only-but-proven-landed
worktree-agent-a1be42b28081d2e68 3074d20 local-only-but-proven-landed
worktree-agent-a1cb38635ceb3b233 ed3bff9 local-only-but-proven-landed
worktree-agent-a287263730d032165 00606f8 local-only-but-proven-landed
worktree-agent-a290b1bc434586e94 9e27faa local-only-but-proven-landed
worktree-agent-a2bdf00cf46ced996 ed3bff9 local-only-but-proven-landed
worktree-agent-a2d814d9e9d681c76 f24abbe local-only-but-proven-landed
worktree-agent-a3123d794791b36f2 795460c local-only-but-proven-landed
worktree-agent-a3aa8eca75756d799 f314399 local-only-but-proven-landed
worktree-agent-a43c2a480674475b2 6a19907 local-only-but-proven-landed
worktree-agent-a460addbd6cdeb055 00606f8 local-only-but-proven-landed
worktree-agent-a48eecb7c03bf6283 00606f8 local-only-but-proven-landed
worktree-agent-a4c85d1cdce5804ff 9e27faa local-only-but-proven-landed
worktree-agent-a4cc7574b5b39574f 00606f8 local-only-but-proven-landed
worktree-agent-a500d738d2c9f4280 3074d20 local-only-but-proven-landed
worktree-agent-a574365222cfb0430 00606f8 local-only-but-proven-landed
worktree-agent-a58dee7d8dbe46626 37bc360 local-only-but-proven-landed
worktree-agent-a6e1923723d514f77 8974438 local-only-but-proven-landed
worktree-agent-a6e9e0392e14ef7a3 00606f8 local-only-but-proven-landed
worktree-agent-a72f11f2a43e632e1 44522a6 local-only-but-proven-landed
worktree-agent-a7a8e582979057c47 62ae06b local-only-but-proven-landed
worktree-agent-a851af6f40976b18d 62ae06b local-only-but-proven-landed
worktree-agent-a8b1afaa4d393e36b f314399 local-only-but-proven-landed
worktree-agent-a8be2792eb8095434 795460c local-only-but-proven-landed
worktree-agent-aa01fbccbd4372fa6 c4c871f local-only-but-proven-landed
worktree-agent-aa46f4965c7431a87 62ae06b local-only-but-proven-landed
worktree-agent-aa8db325ef5def42f f24abbe local-only-but-proven-landed
worktree-agent-aabc1675b77eff892 37bc360 local-only-but-proven-landed
worktree-agent-aae3bde223f3ce7a3 37bc360 local-only-but-proven-landed
worktree-agent-abf2307cf548d9a32 7574e55 local-only-but-proven-landed
worktree-agent-ac4a146cc48a046d8 ded6c28 local-only-but-proven-landed
worktree-agent-ac9c0b4cb66fb16ff 6a19907 local-only-but-proven-landed
worktree-agent-ae0b26752b341548e 951851c local-only-but-proven-landed
worktree-agent-ae8bcd9fced1920b0 e5db629 local-only-but-proven-landed
worktree-agent-aee88430bb9fcb8bf 5df8f43 local-only-but-proven-landed
worktree-agent-af469aaa8f92a9b8f 37bc360 local-only-but-proven-landed
worktree-agent-afc8689d9c440849f ed3bff9 local-only-but-proven-landed
pr146-work bf94760 proven-landed-via-merged-PR
pr176-work 87a321c proven-landed-via-merged-PR
pr214-work 7af4d57 proven-landed-via-merged-PR
pr60-work 03fcf70 proven-landed-via-merged-PR
pr94-work 80425a8 proven-landed-via-merged-PR
worktree-agent-a56b14858dd576134 4348704 proven-landed-via-merged-PR
feat/retire-solutions-and-web3-assurance 06183f6 abandoned-preserved-on-origin
chore/window-failed-requests-show-failure-type 097587f superseded-by-since-last-ext-PR176
ops/automate-deploy-verification 7397851 merged-this-session
ops/fix-manifest-drift-db 0c5995b merged-this-session
```

---

## Remote (GitHub) cleanup — same day, same method

**156 remote branches reduced to 13.** Evidence tiers, none of it a judgement call:

| Evidence | Count |
|---|---|
| Merged PR exists for the branch | 113 |
| Merging it into main adds nothing (tree identical) | 12 |
| Squash-merge commit found on main by subject | 12 |
| Content was research found nowhere on main — **rescued to main first** (PR #337, #338), then deleted | 6 |

Nothing was deleted before its unique content was on main. Two rescue PRs landed 15 research documents (BG/CY/HU/LU registry build paths, capability-health blind spot, outage triage, cost audits) and the Openapi.com vendor evaluation with response fixtures for 14 countries.

**The PII guard earned its keep**: the Openapi rescue initially included an IT stakeholders fixture carrying real *codice fiscale* values. CI blocked it; the file was dropped rather than scrubbed.

### What deliberately remains (13)

- `main`
- `archive/retire-solutions-abandoned-2026-05` — abandoned work, preserved on purpose (it deletes the solutions surface; 104 solutions are live in production)
- 3 branches 1–3 days old, possibly still active: `feat/phase-3-extraction-lv`, `feat/phase-7a-it-stakeholders`, `fix/t02-quality-floor-reinstatement-audit`
- 7 `rescue/*` branches — the git janitor's snapshots of uncommitted work. These exist *to be* the recovery path; deleting them defeats their purpose.
- `tooling/session-state-marker` — a parked tooling proposal superseded by the session-close-check hygiene work

### Deleted remote branches (name, SHA, evidence)

```
origin 4242c61 adds-nothing
analysis/demand-mining d227a97 merged-PR
archive/company-scaffold-20260818 5af0496 squash-landed
catalog/mexican-company-data 8474141 merged-PR
catalog/official-source-batch d6fec8a merged-PR
chore/dk-cvr-retry-diagnostic-2026-05-06 95eaf72 adds-nothing
chore/eureg-manifest-pipeline-sync 791b1de merged-PR
chore/glama-maintainer-claim 5e0f011 adds-nothing
chore/hollow-package-guardrails 9cf9058 merged-PR
chore/land-stranded-research-docs d4ea657 merged-PR
chore/pii-fixture-audit-legal-representatives 01c2428 merged-PR
chore/promote-2026-05-13-handoffs b425319 merged-PR
chore/promote-handoff-notes-2026-05-11 302444f merged-PR
chore/script-cleanup 7829dc0 merged-PR
chore/stash-cleanup 5795d56 merged-PR
chore/sweep-input-schema-drift 2071d02 merged-PR
chore/system-account-dedup 4348704 merged-PR
claude/infallible-murdock-8d0bc1 89234a2 merged-PR
claude/phase-d-p2-medium-fixes 4e3ee77 merged-PR
design/receita-federal-ingest d81f907 merged-PR
dist/bazaar-facilitator-switch aab6ee1 merged-PR
docs/agents-md-refresh 378e9f7 merged-PR
docs/bazaar-indexing-mechanism aeb5fa6 merged-PR
docs/be-parity-audit f23548e adds-nothing
docs/confirm-promotion-tick 9a9287e merged-PR
docs/directory-map-clean e0f56ed merged-PR
docs/distribution-findings 581fdd7 merged-PR
docs/dq9-answered ccdc5df merged-PR
docs/growth-findings 19f2754 merged-PR
docs/handoff-2026-08-15-checkin-defects 9cde2a1 merged-PR
docs/handoff-coinbase-withdrawn 6c18939 merged-PR
docs/listing-copy-rewrite 3867f07 merged-PR
docs/mexico-token-blocked 3e989bc merged-PR
docs/mexico-token-diagnosed b4ede9c merged-PR
docs/phase-7b-enumeration a23b1e1 merged-PR
docs/retention-confirmed-inegi-steps e2752c8 merged-PR
docs/session-close 3bbf472 merged-PR
examples/agent-templates 6380b94 merged-PR
feat/agent-card-storefront ba070a2 merged-PR
feat/attribution-source-inference 9f93591 merged-PR
feat/customer-content-columns b0974de merged-PR
feat/cy-open-data-directors 099840f merged-PR
feat/dec-20260511-e-stuck-validating-sweep 551641a merged-PR
feat/digest-external-api-calls ab1b22d merged-PR
feat/growth-bundles 4ea80db merged-PR
feat/health-deep-endpoint 60dc2b7 merged-PR
feat/known-rate-limit-manifest-field 1b20699 merged-PR
feat/mcp-advertises-x402 16e315e merged-PR
feat/mcp-funnel-instrumentation bc6a926 merged-PR
feat/page-exists-capability c0f9d3e merged-PR
feat/phase-1-class-a-relabel-fr-sk-uk 87d21ae squash-landed
feat/phase-2-extraction-cz 5ff9161 merged-PR
feat/phase-2-extraction-no f812404 merged-PR
feat/pii-retention-tier 46ecd78 merged-PR
feat/pipeline-phase-1 34411c6 adds-nothing
feat/quality-aggregation f529a87 adds-nothing
feat/quality-capture 5b08d81 adds-nothing
feat/reindex-transactions-monthly 8812cd5 merged-PR
feat/revenue-heartbeat c9af00a merged-PR
feat/sk-company-data ab5845c merged-PR
feat/slovenian-company-data f90c666 merged-PR
feat/solutions d463dd9 adds-nothing
feat/test-suite-runner 58c432f adds-nothing
feat/trust-pipeline 7323950 adds-nothing
feat/x402-discovery-sellers-first 348f62c merged-PR
feat/x402-unmet-demand b33b9ab merged-PR
fix/activity-script-solution-labels d4316a2 merged-PR
fix/budget-alert-fatigue 75d3c0d merged-PR
fix/budget-counter-date-sql-code-review-json 81ecaa0 merged-PR
fix/canadian-name-search-post 5337714 merged-PR
fix/capability-discoverability 28151f4 merged-PR
fix/chromium-health-dead-wiring 4d6ab4a merged-PR
fix/company-enrich-json-parse ccf4688 squash-landed
fix/consolidate-registry-name-match 13e0c67 merged-PR
fix/cost-control-refusals-not-faults fc3da1b merged-PR
fix/credential-health-browserless-staleness cba7f41 merged-PR
fix/dk-harden-safe-parts 9fd43f5 merged-PR
fix/dk-phase-3-harden 54955d6 squash-landed
fix/dk-quota-headroom 2fe2f52 merged-PR
fix/eu-regulation-search-cellar 0f60b86 merged-PR
fix/failure-taxonomy-refusals c1bd2f0 merged-PR
fix/limitation-titles-undefined 28434f3 merged-PR
fix/llm-json-adoption a78fe1c merged-PR
fix/llm-json-truncation 3e6570e merged-PR
fix/llm-output-truncation 66b58ea merged-PR
fix/llm-price-table-refresh 2f4fa01 merged-PR
fix/name-match-confidence 59fd512 merged-PR
fix/officer-search-uk-filing-name-match b0295e5 merged-PR
fix/onboard-strict-cost-class-seed 3e087ba merged-PR
fix/phase4-tail 63e796a merged-PR
fix/promotion-interlock-post-review 2323947 merged-PR
fix/quality-floor-promotion-grace d026bca merged-PR
fix/quality-latency-internal-account-filter 20e3a7d merged-PR
fix/reclassify-throttled-free-unlimited 20270ae merged-PR
fix/refusals-not-capability-faults 53e6421 merged-PR
fix/retention-all-customer-content 57891ef merged-PR
fix/settlement-monitoring-gaps cb6b53d merged-PR
fix/solution-step-refs 0044b5e merged-PR
fix/sprint-9-credibility d6c4ce1 adds-nothing
fix/suggest-solutions-bias a3ae6a2 merged-PR
fix/swedish-known-answer-variety acad593 merged-PR
fix/ticker-resolution-and-x402-input-validation 179e5e7 merged-PR
fix/web-extract-shared-resilience c1fa263 merged-PR
fix/widen-pii-guard-scope cd5e7ff merged-PR
investigation/dk-phase-2-understand b658043 adds-nothing
ops/activity-crawler-split 9beaaef merged-PR
ops/automate-deploy-verification 050952b merged-PR
ops/branch-cleanup-record 78f0fff merged-PR
ops/checkin-first-run e53a4a9 merged-PR
ops/close-t21 6dad0be merged-PR
ops/company-scaffold af07ee1 merged-PR
ops/cut-browserless-harness-burn 6f583d9 merged-PR
ops/data-use-boundary f8f324d merged-PR
ops/fix-manifest-drift-db 0c5995b merged-PR
ops/frontend-verification 2214477 merged-PR
ops/notion-filed-v2 8bc054c merged-PR
ops/phase2-close-the-gates 4d06a70 merged-PR
ops/phase3-debloat 4e8432f merged-PR
ops/rescue-session-records 4b389b6 merged-PR
ops/session-closeout 689ac55 merged-PR
ops/ship-policy 0931bc2 merged-PR
ops/wire-shape-contract-gate 4bf9c47 merged-PR
refactor/eth-rpc-endpoint-pool 3b367f3 merged-PR
refactor/in-ts-startup-migrations-convention 434fa32 merged-PR
refactor/llm-extract-helper 492f6b2 merged-PR
refactor/scheduled-testing-eligible-pr-a d7dfc26 merged-PR
refactor/x402-gateway-v2-object-args 19a8cdb merged-PR
rescue/stale-2026-08-15-fix-activity-script-solution-labels-936750b 936750b squash-landed
rescue/stale-2026-08-15-fix-dk-phase-3-harden-88e8c6a 88e8c6a squash-landed
rescue/stale-2026-08-15-fix-llm-json-truncation-c5cb106 c5cb106 squash-landed
rescue/stale-2026-08-15-fix-onboard-strict-cost-class-seed-4b9c599 4b9c599 squash-landed
rescue/stale-2026-08-16-ops-company-scaffold-5af0496 5af0496 squash-landed
rescue/stale-2026-08-17-feat-dec-20260511-e-stuck-validating-sweep-03e3b64 03e3b64 squash-landed
rescue/stale-2026-08-17-feat-page-exists-capability-91d8d9b 91d8d9b squash-landed
rescue/stale-2026-08-17-fix-llm-json-adoption-42ea8f1 42ea8f1 squash-landed
test/wallet-do-coverage 957e675 merged-PR
worktree-agent-a9020b4c2f1bd73cd e243987 merged-PR
audit/anthropic-cost-may-2026 5d8df9e content-rescued-to-main-PR337
audit/conditional-llm-bypass-may-2026 4a5c3f1 content-rescued-to-main-PR337
docs/identity-field-coverage-2026-05-15 8eb8c0e content-rescued-to-main-PR337
docs/us-topograph-scout-2026-05-15 34036a0 content-rescued-to-main-PR337
research/gap-recovery-candidates 84398f7 content-rescued-to-main-PR337
test/openapi-com-sandbox-2026-05-06 131e0ed docs-rescued-to-main-PR338
```
