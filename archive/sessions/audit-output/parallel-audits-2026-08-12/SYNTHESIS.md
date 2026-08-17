# Parallel Audits — Synthesis & Prioritized Worklist (2026-08-12)

Eight read-only opus agents ran in parallel with the P2/P3 build (Readiness program,
DEC-20260812-A). Full reports in this folder; this is the merged, prioritized index.
Actions already taken today are marked ✔.

## P0 — acted on or must be next session

1. ✔ **15 solutions contained** (AT/NL/ES/PT × kyb-essentials/kyb-complete/invoice-verify
   + the 3 DK ones): step-1 always fails, and the **wallet path bills full price for zero
   executed checks** (x402 correctly refuses to settle the same case). Deactivated +
   x402-off, logged to health_monitor_events (`solution_contained`), reversal documented.
   [kyb-wiring-audit]
2. **Fix the billing defect properly**: `solution-executor.ts` marks input-starved steps
   `skipped` without feeding `stepErrors`, so `allFailed` never trips on the wallet path.
   Regression test per DEC-20260504-A (charge-on-success is the platform's inviolable
   rule). Then re-enable the 3 DK solutions once danish-company-data recovers; the
   AT/NL/ES/PT 12 stay off until their step-1 exists (Openapi addendum case 151296 or
   the free sources below). [kyb-wiring-audit]
3. **Audit-trail gap**: deactivated solution steps vanish from the audit record (says 14
   steps, lists 13, no gap marker) — category defect for an audit-trail product.
   [kyb-wiring-audit]
4. **GDPR Art. 22 classification wrong on sanctions-check + pep-check** (default
   `data_lookup`; CLAUDE.md names sanctions-check as THE `screening_signal` example).
   Two-line manifest fixes + resync; also wallet-risk-score, officer-search,
   uk-companies-house-officers, resume-parse, us-ein-match, us-court-search.
   [legal-audit-m-z]
5. **product-search still scrapes Google Shopping** (the branch removed from
   price-compare today) and the blocklist misses Google ccTLDs (google.se/.de still
   execute). Same treatment as price-compare + widen the blocklist rule.
   [legal-audit-m-z]
6. **Bare-`fetch()` ToS side doors** (~10 executors incl. free-tier url-to-text,
   html-to-pdf → Browserless /pdf ungated, company-enrich forwarding caller URLs to
   Browserless, social-profile-check spoofing a Chrome UA): sweep to safeFetch/gate +
   a CI grep guard for bare `fetch(` in capabilities/. [legal-audit-a-l, m-z, kyb-wiring]
7. **Weekly drift cron can never fail** (`tee` swallows every exit code; one step invokes
   a deleted script). Two XS workflow edits restore the platform's only cross-repo drift
   alarm. [enforcement-inventory, scripts-rightsizing]
8. **email-pattern-discover** is live doing what email-finder was shelved for
   (CNIL/Kaspr class) with `processes_personal_data: false`. Shelve or fix declaration —
   same reasoning as the DEACTIVATED-map entry. [legal-audit-a-l]

## P1 — high value, pre-researched

- **anyOf data campaign**: 55 ready YAML blocks in [anyof-campaign]; sequence AFTER
  verifying deployed DB schemas per-slug (report's own caveat + sync via
  sync-manifest-canonical-to-db.ts; #180's do.ts wiring is live). Highest-value first:
  danish/finnish name paths (live blocked #168-class), then CA/JP/SI opens; gate CZ
  behind match-confidence; 4 registries have no name path — don't open those.
- **Name-resolution rollout**: classifyNameMatch used by only 6 of ~26 lookup caps;
  ~20 take result[0]. Roll out scored refusal (officer-search first — personal data).
  But diagnose the german HRB-text case study first. [kyb-wiring-audit]
- **KYB free-source builds** ([kyb-coverage-research], founder-directed):
  P0 repair-before-expand; then officer-extraction sweep NO/CZ/EE/SK/UK/LV (data already
  fetched, not parsed — only 3 of 31 handlers set tier_2_available); **DK CVR S2S
  application** (3-week clock; unlocks DK officers + the only free non-UK UBO);
  **Austria Firmenbuch HVD** (free, CC BY 4.0, official — currently misclassified as
  paid-only); ES via OpenMercantil + BOE/BORME. DE has NO free path; UBO is structurally
  Tier-1/2 only (CJEU) — the offering is procurement/payee-fraud shaped, not bank EDD.
- **Attribution gaps** (~21 mechanical manifest backfills, templates named) +
  `primary_source_reference` missing across the Openapi vendor set. [legal audits]
- **Misdeclarations**: hs-code-lookup (claims WCO DB, is Claude recall — product
  decision), pii-redact (says regex/NLP, is an LLM), serp-analyze provenance says
  google.com while calling Serper, shipping-track claims scraping it doesn't do,
  charity-lookup-uk names the wrong source. [legal audits]

## P2 — right-sizing & guards (execution plans in the reports)

- Scripts: 182 → ~66 files (17 DELETE with evidence, 55 ARCHIVE, 62 MERGE→7 targets,
  4 PROMOTE-TO-CI); duplicate clusters incl. the 9-file EXCLUDED_EMAILS spread (canonical
  suffix module shipped in P3 ✔ — migrate consumers), postgres/manifest/dotenv
  boilerplate. [scripts-rightsizing]
- Enforcement backlog top-10 (CLAUDE.md citation-integrity test is the leverage pick);
  wire the 3 orphaned guards; check-platform-facts-drift into CI with --strict.
  [enforcement-inventory]
- Doctrine tension to rule on: DEC-20260428-A absolutist reading vs DEC-20260518-F
  per-call parsing of statutorily-public registry pages (decides GR/MT/HU/BE-Moniteur —
  and the canadian/japanese-company-data Browserless scrapes now live+charging under
  the same question). **Petter decision.** [kyb-coverage, kyb-wiring]

## P5 — distribution (drafts ready, submissions are human actions)

- **Bazaar facilitator switch** — the one engineering change that self-indexes all 456
  endpoints into the largest x402 discovery surface (money-path change: review + Petter).
- Verified-gap submissions drafted: x402-list.com, awesome-x402, awesome-mcp-servers,
  x402.org metadata.json, agent-tools MCP/A2A legs. Already listed: official MCP
  registry, LangChain (merged 2026-08-07), Glama (unclaimed), Smithery (stale count).
- llms.txt does NOT drive LLM citation; structured task-shaped docs do (10-page list with
  target queries in the report). Composio-strale package exists unaudited — check before
  outreach. [distribution-playbook]

## Standing cautions from the audits

- `.claude/settings.json` (untracked) carries a live-format Strale API key in a
  permission rule — one `git add -A` from a leak. Move it out. **(Petter)**
- OpenOwnership Register closed Nov 2024 — direction-plan UBO vendor line is stale.
- credit-report-summary: live-looking manifest declaring sensitive personal data with no
  executor file.
- Inherited-report corrections noted in [kyb-wiring-audit] §corrections (swiss provider
  is fine; anyOf report describes manifests, not deployed DB).
