---
doc_type: m2-closing-review-round
round: 9
commit: fcfceb59f68228c0e9910581a67e67b1810ee1fa
route: fresh-read-only-claude-agent
reviewed_at: '2026-09-06'
verdict: FAIL
status: complete
complete: true
phase: M2
authority_scope: none
authority_active: false
---

> [!CAUTION]
> **M2 CANDIDATE RECORD — NOT ACTIVE PROJECT AUTHORITY.**
> The recorded decision status is historical source data. Existing `AGENTS.md`, `CLAUDE.md`, and Notion-backed workflows remain authoritative until M4 cutover.

## Method

Round 9 of the M2 closing independent review, run at commit
`fcfceb59f68228c0e9910581a67e67b1810ee1fa` (the commit that merged round
8's archive and `DEC-20260905-I`). Six fresh, read-only reviewers, none
the author of any reviewed content, applied the quotation convention
`DEC-20260905-D`/`-E`/`-F`/`-G`/`-H`/`-I` state unchanged (normalize
quotation and source before comparing: transliterate symbols, lowercase,
strip non-alphanumerics; an ellipsis splits a quotation into ordered
segments; a relation substantiated by an amending record, or narrated in
the target record's own body rather than the source record's, is
substantiated, not a defect; a figure stated as of a date is a dated
observation, not a defect, when unrelated work later moves it) and ran
the operator checker, `scripts/m2-quote-fidelity.mjs`, against the parsed
Notion export and the sibling `strale-frontend` checkout, at the default
25-character threshold and a second pass at `--min-chars 12`, in addition
to the prior rounds' own method: each partition set up a detached,
read-only worktree at the reviewed commit, checked frontmatter validity,
the CAUTION banner, the five protected sections, every quotation, every
evidence path, every relation target, at least ten code claims, and, for
`--notion-` and `--git-` qualified records, the collision-registry and
M2-closure-register bindings. P1 through P4 each took a contiguous slice
of bare-keyed records; P5 took the `--notion-` qualified records
belonging to this batch's id-collisions; P6 took the remaining qualified
records for this batch plus the eight prior withdrawal records
`DEC-20260905-B` through `DEC-20260905-I` themselves, checked like any
other candidate record.

Alongside the six partitions, a named-source quotation sweep ran over the
whole corpus: six sweepers, one per partition's file list, each extracted
every double-quoted span of twelve or more normalized characters from
every candidate record's body and checked it, by reading, against the
specific source the sentence surrounding it names (a Notion row field via
`dump_rows.py`, a repository file at the reviewed commit, a sibling
decision record, `CLAUDE.md`, or the sibling `strale-frontend` checkout
at a pinned commit) rather than against the operator checker's own
best-effort match. This closes the class of defect the checker itself
cannot see: a span misattributed to one named source passes the checker
when the same words happen to exist verbatim in some other file the
checker also treats as a candidate source, because the checker accepts
any candidate source, not the one the record's own sentence names.
Reviewers, in both the partitions and the sweep, could additionally
verify Notion page bodies read-only, beyond the parsed row-property
export, where a partition or sweep needed to. Below, every heading in
each reproduced partition report and each reproduced sweep report is
demoted by exactly one level (`##` to `###`, `###` to `####`; a report's
own top-level `#` title is left as-is under its wrapper heading) so this
file keeps one heading hierarchy throughout; nothing else in any report
is edited.

## Quotation sweep

### Sweep P1

# Named-source quotation sweep — partition P1

Partition P1, commit `fcfceb59f68228c0e9910581a67e67b1810ee1fa`, 41 records.
Script: extracted every double-quoted span of 12+ normalized characters from
each record's body (frontmatter YAML excluded, fenced/inline code blanked
out) with a small Python tool that tracks line numbers through the
blanking. Each span was then read in its sentence to find the source it
names, that exact source was loaded (repo file at this commit, the parsed
Notion row via `dump_rows.py`, a sibling record, CLAUDE.md, or the
`strale-frontend` checkout at the pinned SHA), and classified by
normalizing both sides (transliterate symbols, lowercase, strip
non-alphanumerics, strip bracketed insertions) and testing substring
inclusion.

### Ledger

DEC-20260224-P-a1b2.md:70 | The data layer for AI agents: independently te | docs/company/GOALS.md (Mission) | FAITHFUL
DEC-20260224-P-a1b2.md:76 | library-as-product, x402 primary rail | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260224-P-a1b2.md:78 | is retired as primary product. | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260224-P-a1b2.md:81 | Founder is the only provider for first 3 months | CLAUDE.md DEC-4 | FAITHFUL
DEC-20260224-P-a1b2.md:85 | Agent Quality | row's own Decision field (title) | FAITHFUL
DEC-20260224-P-a1b2.md:95 | marketplace is the primary product | row's own Rationale field | FAITHFUL
DEC-20260224-P-a1b2.md:96 | specialized operators | claimed as this row's own phrase | MISATTRIBUTED
DEC-20260224-P-a1b2.md:96 | seeding volume | row's own Decision field (title) | FAITHFUL
DEC-20260224-P-a1b2.md:106 | library-as-product | CLAUDE.md | FAITHFUL
DEC-20260224-P-c3d4.md:48 | After building full-spec CI prototypes ... disc | DEC-20260225-P-m1n2 row Rationale | FAITHFUL
DEC-20260224-P-c3d4.md:49 | Don't build: CI reports, PDF engines, domain-spe | DEC-20260225-P-m1n2 row Rationale | FAITHFUL
DEC-20260224-P-c3d4.md:70 | drifted far from marketplace vision | DEC-20260225-P-m1n2 row Rationale | FAITHFUL
DEC-20260224-P-c3d4.md:71 | the commerce protocol for the agent economy, | DEC-20260225-P-m1n2 row Decision | FAITHFUL
DEC-20260224-P-c3d4.md:74 | 7 verticals (company-data, compliance, developer | CLAUDE.md capability paragraph | FAITHFUL
DEC-20260224-P-c3d4.md:79 | library-as-product, x402 primary rail, | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260224-P-e5f6.md:32 | Honest assessment: a savvy user can prompt Claud | row's own Rationale field | FAITHFUL
DEC-20260224-P-e5f6.md:64 | The data layer for AI agents: independently test | docs/company/GOALS.md (Mission) | FAITHFUL
DEC-20260224-P-e5f6.md:69 | acceptance criteria, | row's own Rationale field | FAITHFUL
DEC-20260224-P-e5f6.md:73 | library-as-product, x402 primary rail, | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260224-P-e5f6.md:79 | specialized operators, | row's own Rationale field | FAITHFUL
DEC-20260224-P-e5f6.md:80 | contractual accountability, | row's own Rationale field | FAITHFUL
DEC-20260224-P-e5f6.md:80 | guaranteed outcomes | row's own Rationale field | FAITHFUL
DEC-20260224-P-g7h8.md:33 | Name chosen for: (1) soft, professional sound ma | row's own Rationale field | FAITHFUL
DEC-20260224-P-g7h8.md:61 | We run Strale (api.strale.io) | docs/company/coinbase-bazaar-email.md | FAITHFUL
DEC-20260224-P-g7h8.md:62 | petter@strale.io | docs/company/coinbase-bazaar-email.md | FAITHFUL
DEC-20260224-P-g7h8.md:65 | Get a key and trial credits at strale.dev | README.md | FAITHFUL
DEC-20260224-P-g7h8.md:73 | Long-term ambition is tens/hundreds of thousands | CLAUDE.md / project memory | ALREADY_WITHDRAWN DEC-20260905-C item 1
DEC-20260225-P-a3b4.md:80 | Invoice extraction price raised to €0.50 | CLAUDE.md DEC-13 | FAITHFUL
DEC-20260225-P-a3b4.md:82 | Auto-generated from database on 2026-03-17 | manifests/*.yaml header comment | FAITHFUL
DEC-20260225-P-a3b4.md:84 | screenshot-url and eu-address-validate dropped; | CLAUDE.md DEC-12 | FAITHFUL
DEC-20260225-P-a3b4.md:99 | intentionally stale relative to the multi-provid | manifests/vat-validate.yaml comment | FAITHFUL
DEC-20260225-P-e7f8.md:60 | Use this tool when you need real-world data you  | packages/langchain/src/index.ts | FAITHFUL
DEC-20260225-P-e7f8.md:64 | drops into existing agent tool arrays | row's own Decision field | FAITHFUL
DEC-20260225-P-e7f8.md:78 | PyPI published | CLAUDE.md Project Structure | FAITHFUL
DEC-20260225-P-g9h0.md:63 | MVP Decisions (Feb 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260225-P-g9h0.md:64 | DEC-4: Founder is the only provider for first 3  | CLAUDE.md | FAITHFUL
DEC-20260225-P-g9h0.md:70 | Not a third-party provider marketplace (a much l | docs/strategy/2026-08-05-direction-plan.md | FAITHFUL
DEC-20260225-P-g9h0.md:72 | is how the platform scales to third-party provid | CLAUDE.md Onboarding section | FAITHFUL
DEC-20260225-P-g9h0.md:79 | Payments: Stripe Checkout (wallet top-ups only,  | CLAUDE.md Tech Stack | FAITHFUL
DEC-20260225-P-g9h0.md:91 | is retired as primary product | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260225-P-g9h0.md:92 | library-as-product, x402 primary rail | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260225-P-i1j2.md:57 | New solutions (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260225-P-i1j2.md:61 | 100+ bundled solutions across 6 categories, | CLAUDE.md capability paragraph | FAITHFUL
DEC-20260225-P-i1j2.md:65 | disclosing withdrawn ones through the solution t | apps/api/src/routes/solutions.ts comment | FAITHFUL
DEC-20260225-P-i1j2.md:70 | EU vendor onboarding = registry + VAT + address + | row's own Decision field | FAITHFUL
DEC-20260225-P-k3l4.md:32 | pretend global coverage. | row's own Decision field | FAITHFUL
DEC-20260225-P-k3l4.md:45 | honest about coverage, ambitious about trajector | row's own Rationale field | FAITHFUL
DEC-20260225-P-k3l4.md:65 | global platform | row's own Decision field | FAITHFUL
DEC-20260225-P-k3l4.md:70 | the static global price range | docs/company/claims.yaml comment | FAITHFUL
DEC-20260225-P-k3l4.md:75 | wedge, not niche | claimed as row's phrase | ALREADY_WITHDRAWN DEC-20260905-I item 1
DEC-20260225-P-k3l4.md:77 | 7 verticals (company-data, compliance, developer | CLAUDE.md capability paragraph | FAITHFUL
DEC-20260225-P-k3l4.md:81 | brand, API, SDK, docs are global from day one | row's own Decision field | FAITHFUL
DEC-20260225-P-k3l4.md:86 | eventually through external providers from other | row's own Decision field | FAITHFUL
DEC-20260225-P-m1n2.md:49 | first vertical: market research and competitive  | claimed as DEC-20260224-P-c3d4's own text | ALREADY_WITHDRAWN DEC-20260905-D item 1
DEC-20260225-P-m1n2.md:51 | drifted far from marketplace vision | row's own Rationale field | FAITHFUL
DEC-20260225-P-m1n2.md:80 | MCP server + SDK | row's own Decision field | FAITHFUL
DEC-20260225-P-m1n2.md:82 | x402 primary rail | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260225-P-m1n2.md:84 | Readiness program adopted | CLAUDE.md DEC-20260812-A bold lede | FAITHFUL
DEC-20260225-P-m1n2.md:84 | x402 Payment Gateway (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260225-P-m1n2.md:86 | no signup or API key needed — payment IS the aut | CLAUDE.md x402 paragraph | FAITHFUL
DEC-20260225-P-m1n2.md:90 | strale-mcp vs x402 | "this batch's brief" (not repo/row/frontend/PR) | UNVERIFIABLE
DEC-20260225-P-m1n2.md:102 | Payments: Stripe Checkout (wallet top-ups only,  | CLAUDE.md Tech Stack | FAITHFUL
DEC-20260225-P-m1n2.md:109 | not CI reports | record's own compressed label for the row's build list | NOT_A_QUOTATION
DEC-20260225-P-m1n2.md:109 | MCP server + SDK | row's own Decision field | FAITHFUL
DEC-20260225-P-m5n6.md:31 | that shoe company in Stockholm founded by Bjorn | row's own Decision field | FAITHFUL
DEC-20260225-P-m5n6.md:39 | fuzzy input advantage | row's own Rationale field | FAITHFUL
DEC-20260225-P-m5n6.md:66 | Swedish organisationsnummer (10 digits, e.g. 556 | manifests/swedish-company-data.yaml | FAITHFUL
DEC-20260225-P-m5n6.md:70 | Model registry | CLAUDE.md heading (T14 section) | FAITHFUL
DEC-20260225-P-m5n6.md:75 | MVP Decisions (Feb 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260225-P-m5n6.md:76 | swedish-company-data accepts fuzzy natural-langu | CLAUDE.md bullet | FAITHFUL
DEC-20260225-P-m5n6.md:90 | swedish-company-data (with fuzzy input) | DEC-20260226-P-q1r2 row Rationale | FAITHFUL
DEC-20260225-P-o7p8.md:59 | Auto-generated from database on 2026-03-17, | manifests/ted-procurement.yaml | FAITHFUL
DEC-20260225-P-o7p8.md:59 | EU Procurement Tender Search, | manifests/ted-procurement.yaml | FAITHFUL
DEC-20260225-P-o7p8.md:60 | Search EU public procurement tenders on TED (Ten | manifests/ted-procurement.yaml | FAITHFUL
DEC-20260225-P-o7p8.md:65 | query active government contracts by keyword. | row's own Decision field | FAITHFUL
DEC-20260225-P-q3r4.md:33 | Crypto solves real problems for Strale (portable | row's own Rationale field | FAITHFUL
DEC-20260225-P-q3r4.md:79 | smart contract. | row's own Rationale field | FAITHFUL
DEC-20260225-P-q3r4.md:79 | x402 Payment Gateway (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260225-P-q3r4.md:83 | when providers want instant settlement (month 3- | DEC-20260225-P-s5t6 row Rationale | FAITHFUL
DEC-20260225-P-q3r4.md:93 | Merkle-rooted ingest | CLAUDE.md DEC-20260428-B entry | FAITHFUL
DEC-20260225-P-s5t6.md:33 | Gemini review identified fatal flaw: Stripe char | row's own Rationale field | FAITHFUL
DEC-20260225-P-s5t6.md:71 | Prepaid wallet via Stripe Checkout — internal le | CLAUDE.md DEC-2 | FAITHFUL
DEC-20260225-P-s5t6.md:73 | Stripe is LIVE in production (sk_live_ key on Ra | CLAUDE.md Tech Stack | FAITHFUL
DEC-20260225-P-s5t6.md:74 | x402 Payment Gateway (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260225-P-s5t6.md:76 | EUR is the canonical platform | apps/api/src/lib/x402-gateway.ts comment | FAITHFUL
DEC-20260225-P-s5t6.md:83 | config change, not rebuild | row's own Rationale field | FAITHFUL
DEC-20260225-P-s5t6.md:88 | hybrid model long-term | row's own Decision field | FAITHFUL
DEC-20260225-P-s5t6.md:93 | EUR is the canonical platform [currency] | apps/api/src/lib/x402-gateway.ts comment | FAITHFUL
DEC-20260225-P-s5t6.md:95 | ledger designed AS IF it were stablecoin system | row's own Rationale field | FAITHFUL
DEC-20260225-P-u7v8.md:58 | Runtime: Node.js + TypeScript | CLAUDE.md Tech Stack | FAITHFUL
DEC-20260225-P-u7v8.md:58 | Framework: Hono, | CLAUDE.md Tech Stack | FAITHFUL
DEC-20260225-P-u7v8.md:67 | TypeScript SDK ships before Python SDK, | CLAUDE.md DEC-23 | FAITHFUL
DEC-20260225-P-w9x0.md:85 | Bolagsverket Värdefulla datamängder API (Swedish | manifests/swedish-company-data.yaml | FAITHFUL
DEC-20260225-P-w9x0.md:90 | was completed, not deferred, | DEC-20260405-A.md Consequences | FAITHFUL
DEC-20260225-P-w9x0.md:91 | DEC-20260405-A Phase 2: replaced Allabolag scrap | apps/api/src/capabilities/swedish-company-data.ts | FAITHFUL
DEC-20260225-P-w9x0.md:101 | 3 of 5 use Puppeteer | row's own Decision field | FAITHFUL
DEC-20260225-P-y1z2.md:62 | Swedish company data, invoice extraction (€0.50) | row's own Rationale field | FAITHFUL
DEC-20260225-P-y1z2.md:64 | Revised seed capabilities post-review: drop scre | claimed as DEC-20260225-P-a3b4 row Decision | ALREADY_WITHDRAWN DEC-20260905-C item 3
DEC-20260225-P-y1z2.md:78 | Puppeteer self-hosting was flagged as #1 risk | row's own Rationale field | FAITHFUL
DEC-20260225-P-y1z2.md:79 | DEC-7: Use Browserless.io instead of self-hosted | CLAUDE.md | FAITHFUL
DEC-20260225-P-y1z2.md:80 | Trial credits flagged as non-negotiable | row's own Rationale field | FAITHFUL
DEC-20260225-P-y1z2.md:81 | DEC-10: €2.00 trial credits on signup, no card r | CLAUDE.md | FAITHFUL
DEC-20260225-P-y1z2.md:82 | Kill rating endpoint | row's own Decision field | FAITHFUL
DEC-20260225-P-y1z2.md:83 | DEC-11: Rating endpoint removed from MVP (unanim | CLAUDE.md | FAITHFUL
DEC-20260225-P-y1z2.md:83 | Kill screenshot + EU address capabilities | row's own Decision field | FAITHFUL
DEC-20260225-P-y1z2.md:84 | DEC-12: screenshot-url and eu-address-validate d | CLAUDE.md | FAITHFUL
DEC-20260225-P-y1z2.md:86 | Row-level wallet locking | row's own Decision field | FAITHFUL
DEC-20260225-P-y1z2.md:87 | DEC-8: SELECT FOR UPDATE row-level locking on wa | CLAUDE.md | FAITHFUL
DEC-20260225-P-y1z2.md:88 | Idempotency keys | row's own Decision field | FAITHFUL
DEC-20260225-P-y1z2.md:88 | DEC-9: Idempotency-Key header on POST /v1/do (un | CLAUDE.md | FAITHFUL
DEC-20260225-P-y1z2.md:89 | Structured error responses | row's own Decision field | FAITHFUL
DEC-20260225-P-y1z2.md:89 | DEC-19: Structured error responses with stable e | CLAUDE.md | ALREADY_WITHDRAWN DEC-20260905-C item 2
DEC-20260225-P-y1z2.md:97 | kill screenshot | row's own Decision field | FAITHFUL
DEC-20260226-P-q1r2.md:67 | Production: https://strale-production.up.railwa | CLAUDE.md Tech Stack | ALREADY_WITHDRAWN DEC-20260905-C item 4
DEC-20260226-P-q1r2.md:93 | swedish-company-data (with fuzzy input), invoice | row's own Rationale field | FAITHFUL
DEC-20260226-P-s3t4.md:38 | Competitive Defense Strategy | row's own Rationale field | FAITHFUL
DEC-20260226-P-s3t4.md:55 | build it now, cheaply | claimed as row's own words | ALREADY_WITHDRAWN DEC-20260905-I item 2
DEC-20260226-P-s3t4.md:77 | date-based API versioning | row's own Decision field | FAITHFUL
DEC-20260226-P-s3t4.md:78 | Date-based API versioning via Strale-Version hea | claimed as CLAUDE.md's own line | ALREADY_WITHDRAWN DEC-20260905-D item 3
DEC-20260226-P-u5v6.md:77 | 8 new capabilities built and deployed same day | row's own Rationale field | FAITHFUL
DEC-20260226-P-u5v6.md:79 | Actual build velocity produced 133+ capabilities | DEC-20260227-P-a1b2 row Rationale | FAITHFUL
DEC-20260226-P-w7x8.md:86 | European business data | row's own Rationale field | FAITHFUL
DEC-20260227-P-a1b2.md:45 | 5 seed capabilities | row's own Rationale field | FAITHFUL
DEC-20260227-P-a1b2.md:48 | the original Provider Growth doc, | claimed as row's own text | ALREADY_WITHDRAWN DEC-20260905-C item 5
DEC-20260227-P-a1b2.md:75 | Founder is the only provider for first 3 months | CLAUDE.md DEC-4 | FAITHFUL
DEC-20260227-P-a1b2.md:78 | provider recruitment timeline shifts...to month  | row's own Rationale field | FAITHFUL
DEC-20260227-P-i9j0.md:68 | the capability's own provider runs the code. | claimed as the row's original meaning | ALREADY_WITHDRAWN DEC-20260905-D item 4
DEC-20260227-P-i9j0.md:73 | provider-hosted execution | row's own Decision field | FAITHFUL
DEC-20260227-P-i9j0.md:86 | provider-hosted | row's own Decision field | FAITHFUL
DEC-20260227-P-m3n4.md:60 | developer tools (sandbox, scaffolding), | row's own Decision field | FAITHFUL
DEC-20260227-P-m3n4.md:61 | BYOD referrals | row's own Decision field | FAITHFUL
DEC-20260227-P-m3n4.md:66 | external providers | row's own Rationale field | FAITHFUL
DEC-20260227-P-m3n4.md:66 | provider ecosystem | row's own Rationale field | FAITHFUL
DEC-20260227-P-m3n4.md:71 | narrow wedge strategy, | row's own Decision field | FAITHFUL
DEC-20260227-P-m3n4.md:74 | the 2026-08-05 Direction Plan Part One (library- | CLAUDE.md DEC-20260812-A entry | FAITHFUL
DEC-20260227-P-m3n4.md:80 | broad coverage across 6 verticals | row's own Rationale field | FAITHFUL
DEC-20260227-P-o5p6.md:50 | Original: Phase 0 (months 1-3) = 5 capabilities. | row's own Rationale field | FAITHFUL
DEC-20260227-P-o5p6.md:56 | Phase 2 (month 3-4) = provider-lite model per DE | row's own Rationale field | FAITHFUL
DEC-20260227-P-o5p6.md:80 | recruit 3-5 MCP server authors | row's own Rationale field | FAITHFUL
DEC-20260227-P-o5p6.md:80 | provider-lite model... 10-20 providers | row's own Rationale field | FAITHFUL
DEC-20260227-P-o5p6.md:81 | open registration... 50+ providers | row's own Rationale field | FAITHFUL
DEC-20260227-P-o5p6.md:86 | Payments: Stripe Checkout (wallet top-ups only,  | CLAUDE.md Tech Stack | FAITHFUL
DEC-20260227-P-q7r8.md:63 | Agent Reputation Engine | row's own Decision field | FAITHFUL
DEC-20260227-P-q7r8.md:63 | Commerce Protocol | row's own Decision field | FAITHFUL
DEC-20260227-P-q7r8.md:69 | trustless agent reputation reader | apps/api/src/web3-assurance/evaluators/erc-8004-reputation.ts | FAITHFUL
DEC-20260227-P-q7r8.md:74 | x402 Payment Gateway (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260227-P-q7r8.md:75 | no signup or API key needed, payment IS the auth | CLAUDE.md x402 paragraph | FAITHFUL
DEC-20260227-P-q7r8.md:78 | Commerce Protocol | row's own Decision field | FAITHFUL
DEC-20260227-P-q7r8.md:85 | Capability Marketplace | row's own Decision field | FAITHFUL
DEC-20260227-P-s9t0.md:82 | visa/work permit | record's own descriptive label for a grep hit | NOT_A_QUOTATION
DEC-20260227-P-s9t0.md:86 | A2A reputation registry | row's own Decision field | FAITHFUL
DEC-20260227-P-s9t0.md:96 | Unit 3 may become unnecessary | row's own Decision field | FAITHFUL
DEC-20260227-P-s9t0.md:98 | Unit 3 becomes unnecessary because A2A/Visa TAP/ | claimed as row's own words | ALREADY_WITHDRAWN DEC-20260905-D item 5
DEC-20260227-P-s9t0.md:99 | Unit 3 was built as a standalone Commerce Protoc | claimed as row's own words | ALREADY_WITHDRAWN DEC-20260905-D item 6
DEC-20260227-P-u1v2.md:52 | a reputation registry | claimed as this row's own Decision text | MISQUOTE
DEC-20260227-P-u1v2.md:54 | the A2A reputation registry | DEC-20260227-P-s9t0 row Decision | FAITHFUL
DEC-20260227-P-u1v2.md:56 | Capability Marketplace, | DEC-20260227-P-q7r8 row Decision | FAITHFUL
DEC-20260227-P-u1v2.md:57 | Commerce Protocol | DEC-20260227-P-q7r8 row Decision | FAITHFUL
DEC-20260227-P-u1v2.md:74 | distribution multiplier | row's own Decision field | FAITHFUL
DEC-20260227-P-u1v2.md:80 | Distribution packages & protocol endpoints | claimed as CLAUDE.md's own area/heading | ALREADY_WITHDRAWN DEC-20260905-C item 6
DEC-20260227-P-u1v2.md:85 | force multipliers | row's own Rationale field | FAITHFUL
DEC-20260227-P-u1v2.md:88 | de facto A2A Agent Card registry | row's own Rationale field | FAITHFUL
DEC-20260302-A-0001.md:61 | price by cost structure, not by perceived value | DEC-20260411-A.md title | FAITHFUL
DEC-20260302-A-0001.md:78 | pricing experiments within the existing EUR 0.02 | docs/company/CHARTER.md | ALREADY_WITHDRAWN DEC-20260905-C item 7
DEC-20260302-A-0001.md:79 | pricing outside the existing band | docs/company/CHARTER.md | FAITHFUL
DEC-20260302-C.md:37 | Verify a Swedish company | row's own Rationale field | FAITHFUL
DEC-20260302-C.md:40 | Current Decisions (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260302-C.md:41 | DEC-20260302-C: Homepage leads with solutions an | claimed as CLAUDE.md's current bullet | ALREADY_WITHDRAWN DEC-20260905-C item 8
DEC-20260302-C.md:80 | removed from homepage (live on /capabilities). | row's own Rationale field | FAITHFUL
DEC-20260302-D.md:65 | Test Infrastructure Cost Principles | CLAUDE.md heading | FAITHFUL
DEC-20260302-D.md:75 | Reputation Layer | row's own Rationale field | FAITHFUL
DEC-20260302-D.md:75 | reputation-engine | code-search target (module name), not quoted text | NOT_A_QUOTATION
DEC-20260303-C.md:32 | Why this recommendation? | row's own Rationale field | FAITHFUL
DEC-20260303-C.md:35 | Strale does not accept payment for ranking posit | row's own Rationale field | FAITHFUL
DEC-20260303-C.md:60 | Strale does not accept payment for ranking posit | row's own Rationale field | FAITHFUL
DEC-20260303-C.md:69 | Why this recommendation? | row's own Rationale field | FAITHFUL
DEC-20260303-C.md:73 | previously documented the 'Strale Quality Score' | strale-frontend Methodology.tsx header comment | FAITHFUL
DEC-20260303-C.md:76 | rewritten to describe only what the live platfor | strale-frontend Methodology.tsx header comment | FAITHFUL
DEC-20260303-C.md:99 | semantic match quality | row's own Rationale field | FAITHFUL
DEC-20260303-C.md:102 | Strale does not accept payment for ranking posit | row's own Rationale field | FAITHFUL
DEC-20260305-E.md:42 | Shipped. 47 capabilities upgraded via re-export  | row's own Outcome field | FAITHFUL
DEC-20260305-E.md:69 | fetchRenderedHtml and getBrowserlessConfig are r | apps/api/src/capabilities/lib/browserless-extract.ts header | FAITHFUL
DEC-20260305-E.md:94 | Browserless v2 cloud (production-*.browserless. | claimed as browserless-extract.ts's own comment | ALREADY_WITHDRAWN DEC-20260905-C item 14
DEC-20260305-F.md:42 | 72/98 → 94/98 passing (96%). 21 field/data misma | row's own Outcome field | FAITHFUL
DEC-20260305-F.md:65 | generates all 5 test types (known_answer, schema | CLAUDE.md onboarding pipeline step | FAITHFUL
DEC-20260305-F.md:81 | Capabilities & Quality | CLAUDE.md heading | FAITHFUL
DEC-20260305-G.md:67 | SQS scoring engine deleted per DEC-20260503-B | CLAUDE.md | FAITHFUL
DEC-20260305-G.md:76 | 0 cap trust, 0 sol trust | apps/api/src/routes/public-trust.ts comment | FAITHFUL
DEC-20260305-G.md:81 | The retired SQS grades, guidance strategy, and r | apps/api/src/routes/public-trust.ts comment | FAITHFUL
DEC-20260305-G.md:106 | Wire-shape rule for /v1/public/ops/trust/* endpo | CLAUDE.md heading | FAITHFUL
DEC-20260306-D.md:34 | Tests Passing | row's own Rationale field | FAITHFUL
DEC-20260306-D.md:36 | Test Pass Rate | claimed as row's own Rationale field | ALREADY_WITHDRAWN DEC-20260905-C item 16
DEC-20260306-D.md:36 | Test Pass Rate, | claimed as row's own Rationale field | ALREADY_WITHDRAWN DEC-20260905-C item 16
DEC-20260306-D.md:66 | SQS scoring engine deleted | CLAUDE.md | FAITHFUL
DEC-20260306-D.md:80 | recreate a scoring surface the platform decided  | apps/api/src/routes/public-trust.ts comment | FAITHFUL
DEC-20260306-D.md:84 | Wire-shape rule for /v1/public/ops/trust/* endpo | CLAUDE.md heading | FAITHFUL
DEC-20260306-G.md:32 | RESOLVED, see SQS Constitution, | row's own Decision field | FAITHFUL
DEC-20260306-G.md:33 | Strale Quality Score — Design Spec. | row's own Decision field | FAITHFUL
DEC-20260306-G.md:61 | SQS scoring engine deleted per DEC-20260503-B (P | CLAUDE.md | FAITHFUL
DEC-20260306-G.md:78 | SQS Constitution | row's own Decision field | FAITHFUL
DEC-20260306-G.md:80 | Current Decisions (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260306-G.md:81 | DEC-20260307: SQS Constitution adopted as author | CLAUDE.md | FAITHFUL
DEC-20260306-G.md:84 | Platform pricing currency: EUR (not USD), | DEC-20260308-1.md title | FAITHFUL
DEC-20260306-H.md:42 | understand, try, trust, explore. | row's own Decision field | FAITHFUL
DEC-20260306-H.md:66 | One API call. Structured data. | strale-frontend CapabilityDetail.tsx | FAITHFUL
DEC-20260306-H.md:67 | Part of these solutions | strale-frontend CapabilityDetail.tsx | FAITHFUL
DEC-20260306-H.md:68 | HOW THIS IS VERIFIED — Replaces the former 'Qual | strale-frontend CapabilityDetail.tsx comment | FAITHFUL
DEC-20260306-H.md:73 | Related guides | strale-frontend CapabilityDetail.tsx | FAITHFUL
DEC-20260306-H.md:75 | SQS/quality-profile display removed: the scoring | strale-frontend CapabilityDetail.tsx comment | FAITHFUL
DEC-20260306-H.md:83 | how this is verified | strale-frontend CapabilityDetail.tsx comment | FAITHFUL
DEC-20260306-H.md:85 | quality dot merged into price line | row's own Decision field | FAITHFUL
DEC-20260306-H.md:98 | HOW THIS IS VERIFIED | strale-frontend CapabilityDetail.tsx comment | FAITHFUL
DEC-20260308-1.md:49 | Stablecoin rails (USDC) are ledger-level and una | row's own Rationale/Context field | FAITHFUL
DEC-20260308-1.md:71 | Stablecoin rails (USDC) are ledger-level and una | row's own Rationale/Context field | FAITHFUL
DEC-20260309-G.md:66 | risk framework | record's own search pattern | NOT_A_QUOTATION
DEC-20260309-G.md:66 | 12 categories | record's own search pattern | NOT_A_QUOTATION
DEC-20260309-G.md:72 | Companion to the Data Model Field Reference | row's own Rationale field | FAITHFUL
DEC-20260309-G.md:85 | upstream dependency | row's own Rationale field | FAITHFUL
DEC-20260309-G.md:85 | cascading failures | row's own Rationale field | FAITHFUL
DEC-20260309-G.md:86 | legal liability | row's own Rationale field | FAITHFUL
DEC-20260309-G.md:86 | data freshness | row's own Rationale field | FAITHFUL
DEC-20260309-G.md:86 | geographic coverage bias | row's own Rationale field | FAITHFUL
DEC-20260309-G.md:89 | Adding New Capabilities | CLAUDE.md heading | FAITHFUL
DEC-20260309-G.md:94 | the pipeline specification | DEC-20260320-B.md | FAITHFUL
DEC-20260309-G.md:98 | Capability Onboarding Protocol (DEC-20260320-B) | CLAUDE.md heading | FAITHFUL
DEC-20260309-H.md:80 | 8. Warranty and liability | strale-frontend Terms.tsx section title | FAITHFUL
DEC-20260309-H.md:81 | To the maximum extent permitted by law, our aggr | strale-frontend Terms.tsx | FAITHFUL
DEC-20260309-H.md:82 | Nothing in these terms limits liability for frau | strale-frontend Terms.tsx | FAITHFUL

### Findings

record: DEC-20260224-P-a1b2.md
line: 96
class: MISATTRIBUTED
record_text: "specialized operators"
source: this row's own Decision/Rationale fields, Notion page `31167c87082c81d0808ff56906e6ee26`
source_text: "not present" (the row's Rationale uses "external operators", e.g. "accepting they will be surpassed by external operators over time")
correction: The phrase "specialized operators" belongs to a different row in the same batch, `DEC-20260224-P-e5f6` ("specialized operators with battle-tested workflows..."), not to this row (`a1b2`), which uses "external operators" throughout. The sentence claims all three phrases are "the row's specific phrases," but only two of the three ("marketplace is the primary product", "seeding volume") are actually in this row's own fields.

record: DEC-20260225-P-m1n2.md
line: 90
class: UNVERIFIABLE
record_text: "strale-mcp vs x402"
source: "this batch's brief" (the session instructions that assigned this record set)
source_text: not present in any repository file, parsed row, sibling frontend checkout, or merged PR
correction: The record attributes this exact phrase to "this batch's brief" describing what `DEC-20260416-A.md` covers. The brief is an ephemeral orchestration document outside the repository (not evidence, not a row field, not a merged PR), so its exact wording cannot be checked against anything durable; the underlying pointer to `DEC-20260416-A.md` as the reconciling record is not disputed, only the literal quoted phrase's source.

record: DEC-20260225-P-m1n2.md
line: 109
class: (not a defect — reclassified NOT_A_QUOTATION, listed for completeness)
record_text: "not CI reports"
source: this row's own Decision field
source_text: "CI reports, PDF engines, domain-specific pipelines, and enterprise sales are explicitly not to be built"
correction: No defect. The quoted span is the record's own compressed label for a concept already paraphrased and correctly quoted earlier in the same record ("Don't build: CI reports..."), not a fresh claim that the row contains the literal string "not CI reports."

record: DEC-20260227-P-u1v2.md
line: 52
class: MISQUOTE
record_text: "a reputation registry"
source: this row's own Decision field, Notion page `31467c87082c81d0a71acc35c14f1c87`
source_text: "A build sequence established: a 20-step dependency-ordered plan running from distribution multipliers (an MCP server, A2A, framework plugins) through reputation registry to enterprise integrations." (no article before "reputation registry")
correction: The row's Decision field reads "...through reputation registry to enterprise integrations," with no leading "a"; the indefinite article was inserted when the record restated this as "this row's Decision text names 'a reputation registry' as a build-sequence destination."

### Coverage

DEC-20260224-P-a1b2.md | spans: 9 | findings: 1
DEC-20260224-P-c3d4.md | spans: 5 | findings: 0
DEC-20260224-P-e5f6.md | spans: 7 | findings: 0
DEC-20260224-P-g7h8.md | spans: 5 | findings: 0 (1 already-withdrawn)
DEC-20260225-P-a3b4.md | spans: 4 | findings: 0
DEC-20260225-P-e7f8.md | spans: 3 | findings: 0
DEC-20260225-P-g9h0.md | spans: 7 | findings: 0
DEC-20260225-P-i1j2.md | spans: 4 | findings: 0
DEC-20260225-P-k3l4.md | spans: 8 | findings: 0 (1 already-withdrawn)
DEC-20260225-P-m1n2.md | spans: 12 | findings: 2 (1 already-withdrawn)
DEC-20260225-P-m5n6.md | spans: 7 | findings: 0
DEC-20260225-P-o7p8.md | spans: 4 | findings: 0
DEC-20260225-P-q3r4.md | spans: 5 | findings: 0
DEC-20260225-P-s5t6.md | spans: 9 | findings: 0
DEC-20260225-P-u7v8.md | spans: 3 | findings: 0
DEC-20260225-P-w9x0.md | spans: 4 | findings: 0
DEC-20260225-P-y1z2.md | spans: 17 | findings: 0 (2 already-withdrawn)
DEC-20260226-P-q1r2.md | spans: 2 | findings: 0 (1 already-withdrawn)
DEC-20260226-P-s3t4.md | spans: 4 | findings: 0 (2 already-withdrawn)
DEC-20260226-P-u5v6.md | spans: 2 | findings: 0
DEC-20260226-P-w7x8.md | spans: 1 | findings: 0
DEC-20260227-P-a1b2.md | spans: 4 | findings: 0 (1 already-withdrawn)
DEC-20260227-P-i9j0.md | spans: 3 | findings: 0 (1 already-withdrawn)
DEC-20260227-P-m3n4.md | spans: 7 | findings: 0
DEC-20260227-P-o5p6.md | spans: 6 | findings: 0
DEC-20260227-P-q7r8.md | spans: 7 | findings: 0
DEC-20260227-P-s9t0.md | spans: 5 | findings: 0 (2 already-withdrawn; 1 not-a-quotation)
DEC-20260227-P-u1v2.md | spans: 8 | findings: 1 (1 already-withdrawn)
DEC-20260302-A-0001.md | spans: 3 | findings: 0 (1 already-withdrawn)
DEC-20260302-C.md | spans: 4 | findings: 0 (1 already-withdrawn)
DEC-20260302-D.md | spans: 3 | findings: 0 (1 not-a-quotation)
DEC-20260303-C.md | spans: 8 | findings: 0
DEC-20260305-E.md | spans: 3 | findings: 0 (1 already-withdrawn)
DEC-20260305-F.md | spans: 3 | findings: 0
DEC-20260305-G.md | spans: 4 | findings: 0
DEC-20260306-D.md | spans: 6 | findings: 0 (2 already-withdrawn)
DEC-20260306-G.md | spans: 7 | findings: 0
DEC-20260306-H.md | spans: 8 | findings: 0
DEC-20260308-1.md | spans: 2 | findings: 0
DEC-20260309-G.md | spans: 11 | findings: 0 (2 not-a-quotation)
DEC-20260309-H.md | spans: 3 | findings: 0

SWEEP COMPLETE

### Sweep P2

# Named-source quotation sweep — partition P2

Partition: P2. Commit: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`. Record count: 40 (`docs/decisions/records/`, listed in `closing9-P2.txt`).
Script: a Python extractor (`extract_quotes_P2.py`) strips fenced/inline code, then regex-matches every `"..."` span in each record body, keeping spans whose normalized form (case folded, punctuation stripped, `EUR`/`x`/`>=`/`<=`/`->`/`...` substitutions applied) is 12+ characters, reporting the line number where each span starts. Each span was then read against the sentence naming its source (a Notion row field via `dump_rows.py`, a repo file at this commit, another record, CLAUDE.md, or a frontend file at a pinned sha) and classified by substring test on the normalized text, not by eye.

### Ledger

DEC-20260310-E.md:4 | SQS quality/cost optimization spec created | record's own title | NOT_A_QUOTATION
DEC-20260310-E.md:61 | SQS scoring engine deleted per DEC-20260503-B (PR1 | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260310-E.md:73 | Piggyback traffic | record's own callback to its Decision-section item list | NOT_A_QUOTATION
DEC-20260310-E.md:74 | Test Infrastructure Cost Principles | CLAUDE.md section heading | FAITHFUL
DEC-20260310-E.md:84 | Prerequisite: test suite audit | Notion row Rationale field | FAITHFUL
DEC-20260310-E.md:89 | SQS Constitution | generic reference to a hypothetical record name, no specific source named | NOT_A_QUOTATION
DEC-20260310-F.md:4 | Data completeness rule expanded to include test de | record's own title | NOT_A_QUOTATION
DEC-20260310-F.md:62 | Adding New Capabilities | CLAUDE.md section heading | FAITHFUL
DEC-20260310-F.md:63 | at least 1 (every capability has limitations) | CLAUDE.md required-fields list | FAITHFUL
DEC-20260310-F.md:67 | fields must exist in all output paths | Notion row Rationale field | FAITHFUL
DEC-20260310-F.md:69 | structurally valid validation rules. | Notion row Rationale field | FAITHFUL
DEC-20260310-F.md:72 | data completeness rule | record's own title phrase, searched for as a term | NOT_A_QUOTATION
DEC-20260310-F.md:79 | the pipeline generates all 5 test types... and ver | CLAUDE.md ("Adding New Capabilities" pipeline description) | MISQUOTE
DEC-20260310-F.md:91 | data completeness rule | record's own title phrase | NOT_A_QUOTATION
DEC-20260313-C.md:4 | Show 'Unverified' SQS with capability still listed | record's own title | NOT_A_QUOTATION
DEC-20260313-C.md:32 | Building track record | Notion row Rationale field | FAITHFUL
DEC-20260313-C.md:57 | Paid capabilities are not proactively tested; qual | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260313-C.md:63 | structurally can't test | Notion row Rationale field | FAITHFUL
DEC-20260313-C.md:80 | still listed, signal absent rather than faked | "this row states" (Notion row Decision/Rationale) | MISQUOTE
DEC-20260313-C.md:83 | asserts... that Strale runs its own tests against  | apps/api/src/routes/public-trust.ts comment | FAITHFUL
DEC-20260313-E.md:32 | this is what we're about | Notion row Rationale field | FAITHFUL
DEC-20260313-E.md:64 | Trust covers methodology | Notion row Rationale field | FAITHFUL
DEC-20260313-E.md:69 | Show 'Unverified' SQS with capability still listed | DEC-20260313-C.md title | FAITHFUL
DEC-20260313-F.md:4 | Published to Official MCP Registry as io.github.st | record's own title | NOT_A_QUOTATION
DEC-20260313-F.md:65 | streamable-http | server.json remotes[0].type | FAITHFUL
DEC-20260313-F.md:66 | https://api.strale.io/mcp | server.json remotes[0].url | FAITHFUL

DEC-20260314-A.md:4 | Communication gate at March 24: Sprint 9A to 9E, l | record's own title | NOT_A_QUOTATION
DEC-20260314-A.md:39 | just tweets into the void. | Notion row Rationale field | FAITHFUL
DEC-20260314-A.md:68 | Dev.to #1 (week of Apr 21): 'How We Score 297 Agen | archive/growth-ops/tweets-v2.md line 24 | FAITHFUL
DEC-20260314-B.md:4 | Blog on Dev.to first; strale.dev/blog deferred unt | record's own title | NOT_A_QUOTATION
DEC-20260314-B.md:37 | a Lovable session that produces zero readers. | Notion row Rationale field | FAITHFUL
DEC-20260314-B.md:68 | Dev.to #1... 'How We Score 297 Agent Data Capabili | archive/growth-ops/tweets-v2.md line 24 | FAITHFUL
DEC-20260314-B.md:69 | Dev.to #2... 'Give Your LangChain Agent Verified D | archive/growth-ops/tweets-v2.md line 25 | FAITHFUL
DEC-20260314-B.md:70 | devto-sqs-methodology.md | archive/README.md line 29 | FAITHFUL
DEC-20260314-B.md:71 | dev.to fact-check pass | archive/README.md line 30 | FAITHFUL
DEC-20260314-B.md:81 | Blog Post #1 must be ready so launch day isn't jus | DEC-20260314-A's Notion row Rationale field | FAITHFUL
DEC-20260314-C.md:4 | Continuous multi-LLM evaluation as Sprint 11, mont | record's own title | NOT_A_QUOTATION
DEC-20260314-C.md:55 | ChatGPT evaluation | Notion row Rationale field | FAITHFUL
DEC-20260314-C.md:58 | exhaustive enumeration | archive/sessions/audit-output/ filenames and content | FAITHFUL

DEC-20260314-F.md:4 | AX (Agent Experience) as first-class quality dimen | record's own title | NOT_A_QUOTATION
DEC-20260314-F.md:33 | 2027.dev Agent Arena research (60+ devtool AX eval | Notion row Rationale field | FAITHFUL
DEC-20260314-F.md:61 | (tool names), (etc), work without an API key. (etc | packages/mcp-server/README.md line 78 | FAITHFUL
DEC-20260314-F.md:64 | *Free-tier capabilities work without an API key. | packages/mcp-server/README.md line 147 | FAITHFUL
DEC-20260314-F.md:69 | five free capabilities via MCP without auth | Notion row Rationale field | MISQUOTE
DEC-20260314-F.md:74 | Structured error responses with stable error_code  | CLAUDE.md Active Decisions list (DEC-19) | FAITHFUL
DEC-20260314-F.md:82 | completion_rate\|autonomous | grep pattern | NOT_A_QUOTATION
DEC-20260314-F.md:84 | completion_rate\|autonomous_completion\|autonomous | grep pattern | NOT_A_QUOTATION
DEC-20260314-G.md:4 | One API call. Verified data your agent can trust. | record's own title | NOT_A_QUOTATION
DEC-20260314-G.md:26 | One API call. Verified data your agent can trust. | strale-frontend@04c9fca9:src/pages/Index.tsx | FAITHFUL
DEC-20260314-G.md:32 | Any data your agent needs | Notion row Rationale field | FAITHFUL
DEC-20260314-G.md:38 | tested best for clarity + differentiation balance. | Notion row Rationale field | FAITHFUL
DEC-20260314-G.md:73 | is kept, not extended, until the apps/web site s | CLAUDE.md DEC-20260902-A | FAITHFUL
DEC-20260315-A.md:4 | Sprint 9F elevated to immediate priority | record's own title | NOT_A_QUOTATION
DEC-20260315-A.md:32 | Auth wall is the #1 blocker for autonomous agent  | Notion row Rationale field | FAITHFUL
DEC-20260315-A.md:36 | from Phase B Launch +3d to Launch day/+1d. | Notion row Rationale field | FAITHFUL
DEC-20260315-A.md:62 | free capabilities via MCP without auth | "the row's own description" (this row, DEC-20260315-A) | MISATTRIBUTED
DEC-20260315-A.md:70 | Phase B Launch +3d, | Notion row Rationale field | FAITHFUL

DEC-20260315-B.md:4 | Code pattern publishing starts Week 1 | record's own title | NOT_A_QUOTATION
DEC-20260315-B.md:33 | DEC-20260311-A (canonical code patterns) originall | Notion row Rationale field | FAITHFUL
DEC-20260315-B.md:64 | packages/sdk-typescript | context7.json folders array | FAITHFUL
DEC-20260315-B.md:64 | packages/sdk-python | context7.json folders array | FAITHFUL
DEC-20260315-B.md:65 | packages/mcp-server | context7.json folders array | FAITHFUL
DEC-20260315-B.md:65 | packages/langchain-strale | context7.json folders array | FAITHFUL
DEC-20260315-B.md:66 | packages/crewai-strale | context7.json folders array | FAITHFUL
DEC-20260315-B.md:66 | packages/semantic-kernel-strale | context7.json folders array | FAITHFUL
DEC-20260315-B.md:66 | packages/openai-agents-strale | context7.json folders array | FAITHFUL
DEC-20260315-B.md:67 | packages/pydantic-ai-strale | context7.json folders array | FAITHFUL
DEC-20260315-B.md:67 | packages/google-adk-strale | context7.json folders array | FAITHFUL
DEC-20260315-B.md:71 | Shift distribution from 'be listed' to 'be embedde | DEC-20260330-B.md title | FAITHFUL
DEC-20260315-H.md:4 | Launch clean with dual-profile model | record's own title | NOT_A_QUOTATION
DEC-20260315-H.md:33 | Zero external users, methodology not publicly mark | Notion row Rationale field | FAITHFUL
DEC-20260315-H.md:56 | SQS scoring engine deleted per DEC-20260503-B (PR1 | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260315-H.md:62 | SQS-based qualification gate retired (DEC-20260503 | apps/api/src/db/seed-solutions.ts line 391 | FAITHFUL
DEC-20260315-H.md:73 | Quality floor ... armed in prod | CLAUDE.md | MISATTRIBUTED

DEC-20260315-I.md:4 | Upstream failures not billed, only successful exec | record's own title | NOT_A_QUOTATION
DEC-20260315-I.md:33 | Agents should not pay for failures caused by exter | Notion row Rationale field | FAITHFUL
DEC-20260315-I.md:59 | Sync execution: lock -> execute -> debit on success | apps/api/src/routes/do.ts line 1987 | FAITHFUL
DEC-20260315-I.md:61 | the settle step runs only after the capability has | apps/api/src/routes/do.ts line 876-877 | FAITHFUL
DEC-20260315-I.md:63 | the catch block treats that as (execution_failed)  | apps/api/src/routes/do.ts line 2067-2069 | FAITHFUL
DEC-20260315-I.md:66 | Don't charge before execution succeeds - lock -> ex | CLAUDE.md Active Decisions list (DEC-14) | FAITHFUL
DEC-20260315-I.md:73 | Async execution: debit upfront -> 202 -> background  | apps/api/src/routes/do.ts line 2428 | FAITHFUL
DEC-20260315-I.md:75 | Failure: refund wallet + update transaction in a s | apps/api/src/routes/do.ts line 2802 | FAITHFUL
DEC-20260315-I.md:83 | WP4 removed (verifyX402Payment), a combined verify | apps/api/src/lib/x402-gateway.ts line 391 | FAITHFUL
DEC-20260315-I.md:84 | verify -> execute -> settle ordering (DEC-14); both  | apps/api/src/lib/x402-gateway.ts line 104-105 | FAITHFUL
DEC-20260315-I.md:90 | removed (verifyX402Payment), a combined verify-and | apps/api/src/lib/x402-gateway.ts line 391 | FAITHFUL
DEC-20260316-A.md:4 | Eliminate Combined Trust Grade (A/B/C/D) from all  | record's own title | NOT_A_QUOTATION
DEC-20260316-A.md:35 | issuer rating | Notion row Rationale field | FAITHFUL
DEC-20260316-A.md:64 | Combined Trust Grade. | apps/api/src/lib/trust-grade.ts line 171 section header | FAITHFUL
DEC-20260316-A.md:78 | The retired SQS grades, guidance strategy, and raw | apps/api/src/routes/public-trust.ts header comment | FAITHFUL
DEC-20260316-A.md:82 | one headline signal | Notion row Rationale field | MISQUOTE
DEC-20260316-A.md:87 | worst of SQS, freshness, latency | Notion row Rationale field | FAITHFUL

DEC-20260316-B.md:4 | SQS display hierarchy: number+word headline, QP/RP | record's own title | NOT_A_QUOTATION
DEC-20260316-B.md:39 | Quality A · Reliability B | Notion row Rationale field | FAITHFUL
DEC-20260316-B.md:50 | which is the real rating | DEC-20260316-A's Rationale/Notion row | MISQUOTE
DEC-20260316-B.md:62 | The dual-profile model (QP + RP + 5x5 matrix)... a | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260316-B.md:75 | never mixed inline | Notion row Rationale field | FAITHFUL
DEC-20260316-B.md:88 | letters as secondary, never the primary headline | record's own callback to its stated principle | NOT_A_QUOTATION
DEC-20260317-A.md:4 | Weekly digest plus interrupt email model, not dail | record's own title | NOT_A_QUOTATION
DEC-20260317-A.md:37 | At 229 capabilities and pre-revenue, daily emails  | Notion row Rationale field | FAITHFUL
DEC-20260317-A.md:67 | Send the weekly digest (or any platform health ema | apps/api/src/lib/digest-sender.ts line 23 | FAITHFUL
DEC-20260317-A.md:69 | Trigger the weekly health sweep on-demand | apps/api/src/routes/internal-health-monitor.ts line 28 | FAITHFUL
DEC-20260317-A.md:70 | Compile and send the weekly health digest immediat | apps/api/src/routes/internal-health-monitor.ts line 31 | FAITHFUL
DEC-20260317-A.md:73 | Sends time-sensitive interrupt emails for events t | apps/api/src/lib/interrupt-sender.ts lines 4-5 | FAITHFUL
DEC-20260317-A.md:77 | sendInterruptEmail | apps/api/src/lib/interrupt-sender.ts exported function name | FAITHFUL
DEC-20260317-A.md:85 | weekly digest | this record's own Decision text / Notion row Decision field | FAITHFUL
DEC-20260317-A.md:87 | The daily-digest pipeline (apps/api/src/jobs/daily | DEC-20260511-F.md's own Rationale/Context (quoting its Notion row) | FAITHFUL
DEC-20260317-A.md:100 | CEO morning brief | docs/company/DAILY-RUN.md heading | FAITHFUL

DEC-20260317-F.md:4 | Publication SQS threshold at or above 60, higher t | record's own title | NOT_A_QUOTATION
DEC-20260317-F.md:34 | Automated gate at SQS 50 = 'this works.' Publicati | Notion row Rationale field | FAITHFUL
DEC-20260317-F.md:43 | automated >= 50 qualification gate | record's own descriptive label for the row's concept | NOT_A_QUOTATION
DEC-20260317-F.md:45 | Eliminate Combined Trust Grade (A/B/C/D) from all  | DEC-20260316-A.md title | FAITHFUL
DEC-20260317-F.md:46 | SQS display hierarchy: number+word headline, QP/RP | DEC-20260316-B.md title | FAITHFUL
DEC-20260317-F.md:47 | ALL new capabilities must use manifest-driven pipe | DEC-20260318-A.md title | FAITHFUL
DEC-20260317-F.md:50 | Onboarding pipeline upgraded with --discover, --fi | DEC-20260318-B.md title | FAITHFUL
DEC-20260317-F.md:51 | automated >= 50 gate | record's own descriptive label for the row's concept | NOT_A_QUOTATION
DEC-20260317-F.md:67 | SQS scoring engine deleted per DEC-20260503-B (PR1 | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260317-F.md:73 | /v1/quality/:slug retired with the SQS engine (DEC | apps/api/src/app.ts line 513 | FAITHFUL
DEC-20260317-F.md:80 | SQS-based qualification gate retired (DEC-20260503 | apps/api/src/db/seed-solutions.ts lines 390-393 | FAITHFUL
DEC-20260317-F.md:86 | armed in prod, not dry-run | CLAUDE.md | MISATTRIBUTED
DEC-20260317-G.md:4 | Third-party providers must submit test fixtures wi | record's own title | NOT_A_QUOTATION
DEC-20260317-G.md:33 | Biggest failure mode in marketplace quality is pro | Notion row Rationale field | FAITHFUL
DEC-20260317-G.md:58 | Founder is the only provider for first 3 months, | CLAUDE.md Active Decisions list (DEC-4) | FAITHFUL
DEC-20260317-G.md:68 | the only sanctioned path for capability creation, | CLAUDE.md (Adding New Capabilities intro) | FAITHFUL
DEC-20260317-G.md:70 | Test suites (known_answer + dependency_health from | apps/api/scripts/onboard.ts header comment | FAITHFUL
DEC-20260317-G.md:72 | known_answer fixtures and verify via production tr | apps/api/scripts/onboard.ts comment (~line 14) | FAITHFUL
DEC-20260317-G.md:75 | The known_answer test input (a real entity you've  | CLAUDE.md line 394 | FAITHFUL
DEC-20260317-G.md:76 | What the pipeline does NOT do (human must provide) | CLAUDE.md line 393 | FAITHFUL

DEC-20260317-H.md:4 | Provider self-reported evidence weighted 0.5x agai | record's own title | NOT_A_QUOTATION
DEC-20260317-H.md:33 | Trust but verify. Provider results are one evidenc | Notion row Rationale field | FAITHFUL
DEC-20260317-H.md:42 | Strale independent tests | Notion row Decision/Rationale field | MISQUOTE
DEC-20260317-H.md:42 | provider results | Notion row Rationale field | FAITHFUL
DEC-20260317-H.md:61 | Founder is the only provider for first 3 months | CLAUDE.md Active Decisions list (DEC-4) | FAITHFUL
DEC-20260317-H.md:71 | SQS scoring engine deleted per DEC-20260503-B. | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260317-H.md:92 | Verifies the known_answer test passes against live | CLAUDE.md (Adding New Capabilities, step 4 bullet) | FAITHFUL
DEC-20260318-A.md:4 | ALL new capabilities must use manifest-driven pipe | record's own title | NOT_A_QUOTATION
DEC-20260318-A.md:53 | the workflow that scales to third-party providers. | Notion row Rationale field | MISATTRIBUTED
DEC-20260318-A.md:64 | Adding New Capabilities (MANDATORY PIPELINE) | CLAUDE.md section heading (line 332) | FAITHFUL
DEC-20260318-A.md:66 | The historical seed.ts file was deleted in PR #79; | CLAUDE.md (Adding New Capabilities intro) | FAITHFUL
DEC-20260318-A.md:77 | Auto-registered | CLAUDE.md step 2 heading | FAITHFUL
DEC-20260318-A.md:81 | shipped with SQS 39.3 because known_answer tests w | Notion row Rationale field | FAITHFUL
DEC-20260318-A.md:88 | Capabilities & Quality | CLAUDE.md section heading | FAITHFUL

DEC-20260318-B.md:4 | Onboarding pipeline upgraded with --discover, --fi | record's own title | NOT_A_QUOTATION
DEC-20260318-B.md:58 | the workflow that scales to third-party providers: | Notion row Rationale field | FAITHFUL
DEC-20260318-B.md:68 | Abort if execute-and-verify fails, | apps/api/scripts/onboard.ts line 15 / CLAUDE.md line 375 | FAITHFUL
DEC-20260318-B.md:71 | Execute-and-Verify (Enhancement 1) | apps/api/scripts/onboard.ts line 228 section header | FAITHFUL
DEC-20260318-B.md:74 | Adding New Capabilities (MANDATORY PIPELINE) | CLAUDE.md section heading | FAITHFUL
DEC-20260318-B.md:76 | Auto- correct high-confidence fixture mismatches, | CLAUDE.md line 374 | FAITHFUL
DEC-20260318-B.md:77 | Abort if execute-and-verify fails | apps/api/scripts/onboard.ts line 15 / CLAUDE.md line 375 | FAITHFUL
DEC-20260320-A.md:4 | Capability onboarding hardening: auto-import execu | record's own title | NOT_A_QUOTATION
DEC-20260320-A.md:77 | the previous filesystem-glob discovery, | apps/api/src/capabilities/auto-register.ts line 19 | FAITHFUL
DEC-20260320-A.md:78 | manual, 312-line app.ts import list | "this row's Rationale" (Notion row) | MISATTRIBUTED
DEC-20260320-A.md:88 | single source of truth for 'is this capability ful | apps/api/src/lib/capability-readiness.ts lines 2-3 | FAITHFUL
DEC-20260320-A.md:96 | The last two dimensions [reliability and limitatio | apps/api/src/lib/capability-readiness.ts lines 9-12 | FAITHFUL
DEC-20260320-A.md:108 | single enforcement gateway | record's own title / Notion row Decision field | FAITHFUL
DEC-20260320-A.md:113 | DB metadata -> schema required -> baselines -> heuris | Notion row Rationale field | FAITHFUL
DEC-20260320-A.md:116 | Field reliability rules | CLAUDE.md section heading | FAITHFUL

DEC-20260320-E.md:4 | OpenSanctions standard Commercial API tier (EUR 0. | record's own title | NOT_A_QUOTATION
DEC-20260320-E.md:66 | Keep sanctions and PEP on a Dilisense wrapper and  | DEC-20260429-A.md title | FAITHFUL
DEC-20260320-E.md:83 | leave Cobalt, EINsearch and sec-api in place, he w | docs/company/DECISION-QUEUE.md DQ-30 | FAITHFUL
DEC-20260320-E.md:95 | when approaching production volume, | Notion row Outcome field | FAITHFUL
DEC-20260320-F.md:4 | Raise compliance screening prices to EUR 0.25/call | record's own title | NOT_A_QUOTATION
DEC-20260320-F.md:49 | CC prompt created. Migration: UPDATE price_cents = | Notion row Outcome field | FAITHFUL
DEC-20260320-F.md:74 | Dilisense consolidated PEP database | CLAUDE.md line 312 | FAITHFUL
DEC-20260320-F.md:74 | Dilisense Adverse Media | CLAUDE.md line 313 | FAITHFUL
DEC-20260320-F.md:75 | Keep sanctions and PEP on a Dilisense wrapper and  | DEC-20260429-A.md title | FAITHFUL

DEC-20260321-A.md:4 | Solution batch endpoint: ORDER BY schedule_tier DE | record's own title | NOT_A_QUOTATION
DEC-20260321-A.md:35 | The solution batch trust endpoint used ORDER BY sc | Notion row Rationale field | FAITHFUL
DEC-20260321-A.md:42 | All solutions now show improving or stable. lei-lo | Notion row Outcome field | FAITHFUL
DEC-20260321-A.md:67 | schedule_tier\|scheduleTier\|ORDER BY | grep pattern | NOT_A_QUOTATION
DEC-20260321-A.md:70 | solution batch | Notion row Decision field | FAITHFUL
DEC-20260321-A.md:97 | All solutions now show improving or stable | Notion row Outcome field | FAITHFUL
DEC-20260323-A.md:4 | All trust data served from DB columns; write-time  | record's own title | NOT_A_QUOTATION
DEC-20260323-A.md:64 | (function names redacted) were retired with the SQ | apps/api/src/lib/test-runner.ts lines 2115-2118 | FAITHFUL
DEC-20260323-A.md:69 | read-time decay eliminated, write-time decay in fo | "the row states" (Notion row Decision/Rationale) | MISQUOTE
DEC-20260323-A.md:77 | PR2 will drop the residual schema columns (redacte | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260323-A.md:89 | A future per-product routing engine may reintroduc | apps/api/src/lib/lifecycle.ts lines 147-148 | FAITHFUL

DEC-20260324-A.md:4 | Stripe x402 deposit mode is US-only; use the open  | record's own title | NOT_A_QUOTATION
DEC-20260324-A.md:69 | Coinbase Developer Platform API key ID for the x40 | config/env-manifest.yaml line 284 | FAITHFUL
DEC-20260324-A.md:72 | x402 Payment Gateway (March 2026) | CLAUDE.md line 308 heading | FAITHFUL
DEC-20260324-C.md:4 | AgentCash is complementary, not competitive | record's own title | NOT_A_QUOTATION
DEC-20260324-C.md:57 | x402scan/agentcash discovery spec | apps/api/src/routes/x402-gateway-v2.ts line 1944 | FAITHFUL
DEC-20260324-C.md:70 | purchasable through x402/AgentCash | Notion row Rationale field | FAITHFUL
DEC-20260324-C.md:78 | x402 Payment Gateway (March 2026) | CLAUDE.md line 308 heading | FAITHFUL

DEC-20260329-A.md:4 | 7-color data/accent palette for strale.dev dark mo | record's own title | NOT_A_QUOTATION
DEC-20260329-A.md:34 | strale.dev had no chart/visualization palette. Com | Notion row Rationale field | FAITHFUL
DEC-20260330-B.md:4 | Shift distribution from 'be listed' to 'be embedde | record's own title | NOT_A_QUOTATION
DEC-20260330-B.md:28 | be embedded in coding workflow | this record's own Decision text / Notion row Decision field | FAITHFUL
DEC-20260330-B.md:61 | injected when developers ask about IBANs | Notion row Rationale field | FAITHFUL
DEC-20260330-B.md:69 | Every capability has a Strale Quality Score (SQS)  | context7.json rules[11] ("Rule 12") | MISQUOTE
DEC-20260330-B.md:70 | SQS scoring engine deleted per DEC-20260503-B | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260330-B.md:75 | Root contains exactly | CLAUDE.md line 706 | FAITHFUL
DEC-20260330-B.md:79 | be embedded in workflow | this record's own Decision text / Notion row Decision field | MISQUOTE

DEC-20260404-A.md:4 | Adopt Glama TDQS as a quality signal; rewrite stra | record's own title | NOT_A_QUOTATION
DEC-20260404-A.md:71 | Pending Glama re-scan | Notion row Outcome field | FAITHFUL
DEC-20260404-A.md:92 | what the API actually returns - no retired concept | packages/mcp-server/src/tools.ts lines 9-11 | FAITHFUL
DEC-20260404-A.md:95 | do NOT expose a numeric quality score. The dual-pr | packages/mcp-server/src/tools.ts line 974 | FAITHFUL
DEC-20260404-A.md:96 | DEC-20260503-B (SQS deletion). | packages/mcp-server/src/tools.ts line 980 | FAITHFUL
DEC-20260405-A.md:4 | Migrate Swedish company data off Allabolag.se onto | record's own title | NOT_A_QUOTATION
DEC-20260405-A.md:37 | remains active in principle; execution deferred, | Notion row Rationale field | FAITHFUL
DEC-20260405-A.md:52 | Bolagsverket | Notion row Rationale field | FAITHFUL
DEC-20260405-A.md:73 | No new capability may be built on a commercial agg | Notion row Rationale field | FAITHFUL
DEC-20260405-A.md:101 | DEC-20260405-A Phase 2: replaced Allabolag scrapin | apps/api/src/capabilities/swedish-company-data.ts line 8 | FAITHFUL
DEC-20260405-A.md:107 | PARKED 2026-04-09 | Notion row Rationale field | FAITHFUL

DEC-20260406-E.md:4 | Phase 3 Session 2 Closeout - Market Context and Co | record's own title | NOT_A_QUOTATION
DEC-20260406-E.md:33 | Session 2 produced two new canonical pages (Market | Notion row Rationale field | FAITHFUL
DEC-20260406-E.md:63 | Market Context | Notion row Rationale field | FAITHFUL
DEC-20260406-E.md:64 | Competitive Landscape | Notion row Rationale field | FAITHFUL
DEC-20260406-E.md:68 | operating manual | Notion row Rationale field | FAITHFUL
DEC-20260406-E.md:72 | standing recurring watch item | Notion row Rationale field | FAITHFUL
DEC-20260406-E.md:75 | Positioning page Lock 7 phrasing leftover | Notion row Rationale field | FAITHFUL
DEC-20260409-A.md:4 | Gate 2: Null-output correctness tier for SQS scori | record's own title | NOT_A_QUOTATION
DEC-20260409-A.md:41 | The german-company-data scraper returned all nulls | Notion row Rationale field | FAITHFUL
DEC-20260409-A.md:47 | Phase 3 hardening for the german-company-data null | Notion row Rationale field | FAITHFUL
DEC-20260409-A.md:51 | still pending a separate DEC | Notion row Rationale field | FAITHFUL
DEC-20260409-A.md:58 | a reasonable first cut; can be tuned with data, | Notion row Rationale field | FAITHFUL
DEC-20260409-A.md:69 | Gate 2: Null-output correctness tier (DEC-20260409 | apps/api/src/lib/null-field-ratio.ts line 2 | FAITHFUL
DEC-20260409-A.md:70 | Only applies to schemas with 3+ declared fields, | apps/api/src/lib/null-field-ratio.ts line 10 | FAITHFUL
DEC-20260409-A.md:71 | If >50% of declared fields are null/empty -> fail, | apps/api/src/lib/null-field-ratio.ts line 11 | FAITHFUL
DEC-20260409-A.md:72 | Fields marked as 'rare' or 'common' in outputField | apps/api/src/lib/null-field-ratio.ts line 12 | FAITHFUL
DEC-20260409-A.md:73 | Nested objects count as single fields (no recursio | apps/api/src/lib/null-field-ratio.ts line 13 | FAITHFUL
DEC-20260409-A.md:76 | Gate 2: Null-ratio check (DEC-20260409-A). | apps/api/src/lib/test-runner.ts line 1706 | FAITHFUL
DEC-20260409-A.md:82 | Feature flag - defaults to disabled; enable with N | apps/api/src/lib/test-runner.ts line 1603 | FAITHFUL
DEC-20260409-A.md:86 | Feature flag (DEC-20260409-A) enabling the null-ou | config/env-manifest.yaml line 750 | FAITHFUL
DEC-20260409-A.md:93 | SQS scoring engine deleted per DEC-20260503-B (PR1 | CLAUDE.md (Capabilities & Quality section) | FAITHFUL
DEC-20260409-A.md:103 | can be tuned with data | Notion row Rationale field | FAITHFUL

DEC-20260409-B.md:4 | Code-based lookup pattern + cross-validation for e | record's own title | NOT_A_QUOTATION
DEC-20260409-B.md:47 | (1) Bosch LEI lookup during SpendLatch evaluation  | Notion row Rationale field | FAITHFUL
DEC-20260409-B.md:52 | Registration numbers are unique within a jurisdict | Notion row Rationale field | FAITHFUL
DEC-20260409-B.md:55 | RELATED: DEC-20260409-A (Gate 2 null-output correc | Notion row Rationale field | FAITHFUL
DEC-20260409-B.md:61 | the executor already owns step sequencing and $ste | Notion row Rationale field | FAITHFUL
DEC-20260409-B.md:76 | Context propagation: after first group, extract re | apps/api/src/lib/solution-executor.ts lines 438-441 | FAITHFUL
DEC-20260409-B.md:91 | DEC-20260409-B Phase 1. | apps/api/src/lib/entity-validation.ts line 3 | FAITHFUL
DEC-20260409-D.md:4 | Gate 4 (revised): Four-layer solution test pyramid | record's own title | NOT_A_QUOTATION
DEC-20260409-D.md:55 | Supersedes DEC-20260409-C. Original Gate 4 plan wa | Notion row Rationale field | FAITHFUL
DEC-20260409-D.md:62 | genuinely requires live end-to-end execution. | Notion row Rationale field | FAITHFUL
DEC-20260409-D.md:63 | a class 1 bug - static, zero-cost to detect. | Notion row Rationale field | FAITHFUL
DEC-20260409-D.md:73 | the strongest quality signal when it is | Notion row Rationale field | FAITHFUL
DEC-20260409-D.md:77 | scoring integrity | Notion row Rationale field (SCORING INTEGRITY header) | FAITHFUL
DEC-20260409-D.md:90 | Gate 4b - Solution Dry-Run Composition Check (DEC- | apps/api/src/lib/gate4b-solution-dryrun.ts line 2 | FAITHFUL
DEC-20260409-D.md:92 | Runs the full solution step chain with mock output | apps/api/src/lib/gate4b-solution-dryrun.ts lines 4-6 | FAITHFUL
DEC-20260409-D.md:107 | Weekly health sweep (7d) | apps/api/src/jobs/test-scheduler.ts line 661 | FAITHFUL
DEC-20260409-D.md:109 | one representative solution per category against c | Notion row Rationale field | MISQUOTE
DEC-20260409-D.md:112 | Daily SQS snapshot retired with the SQS engine (DE | apps/api/src/jobs/test-scheduler.ts line 659 | FAITHFUL
DEC-20260409-D.md:119 | Gate 5 - Path Coverage Enforcement (DEC-20260411-B | apps/api/src/lib/gate5-path-coverage.ts line 2 | FAITHFUL
DEC-20260409-D.md:126 | until there's evidence of a bug class that needs i | Notion row Rationale field | FAITHFUL

DEC-20260410-A.md:4 | Progressive unlock: free-tier capabilities unlock  | record's own title | NOT_A_QUOTATION
DEC-20260410-A.md:37 | url-to-markdown is 45% of external traffic but alm | Notion row Rationale field | FAITHFUL
DEC-20260410-A.md:62 | 3 related capabilities per use | Notion row Decision field | FAITHFUL
DEC-20260410-A.md:63 | These capabilities are free for you for 24 hours - | apps/api/src/routes/do.ts line 1739 | FAITHFUL
DEC-20260410-A.md:65 | Check progressive unlock before rejecting (DEC-202 | apps/api/src/routes/do.ts line 850 | FAITHFUL
DEC-20260410-A.md:66 | Progressive unlock: record + include in response ( | apps/api/src/routes/do.ts line 1716 | FAITHFUL
DEC-20260410-A.md:71 | Agent self-signup (DEC-20260410-A) | apps/api/src/routes/auth.ts line 549 | FAITHFUL
DEC-20260410-A.md:71 | POST /v1/signup - autonomous agent signup. Returns | apps/api/src/routes/auth.ts line 550 | FAITHFUL
DEC-20260411-A.md:4 | Capability pricing framework: price by cost struct | record's own title | NOT_A_QUOTATION
DEC-20260411-A.md:69 | price by cost structure, not by perceived value | Notion row Decision field | FAITHFUL
DEC-20260411-A.md:72 | solution prices are derived from component prices  | DEC-20260302-A-0001.md lines 30-31 | FAITHFUL
DEC-20260411-A.md:85 | algorithmic = EUR 0.02 | Notion row Decision field | FAITHFUL
DEC-20260411-B.md:4 | Gate 5: Path coverage enforcement in capability on | record's own title | NOT_A_QUOTATION
DEC-20260411-B.md:69 | PRIMARY: ID-based lookup... SECONDARY: Name-based  | apps/api/src/lib/gate5-path-coverage.ts lines 2-13 | FAITHFUL
DEC-20260411-B.md:74 | Gate 5 multi-path fixture coverage, DEC-20260411-B | apps/api/scripts/onboard.ts lines 549-550 | FAITHFUL
DEC-20260411-B.md:81 | ID path (PRIMARY) needs strict coverage, name path | Notion row Rationale field | FAITHFUL

DEC-20260320-B.md | (no quotations — no double-quoted span of 12+ normalized characters found in the body)

### Findings

record: DEC-20260310-F.md
line: 79
class: MISQUOTE
record_text: "the pipeline\ngenerates all 5 test types... and verifies the known_answer test passes\nagainst live output,"
source: CLAUDE.md, Adding New Capabilities section (steps 4 and the intro line "The canonical pipeline is `apps/api/scripts/onboard.ts`")
source_text: "The canonical pipeline is `apps/api/scripts/onboard.ts` — it generates all 5 test types and is the only sanctioned path for capability creation." (elsewhere, a separate bulleted list under "The pipeline:" ends "- Generates all 5 test types (known_answer, schema_check, negative, edge_case, dependency_health)" then, as its own final bullet with no "and", "- Verifies the known_answer test passes against live output")
correction: CLAUDE.md never reads "the pipeline generates all 5 test types" as continuous text — "it generates all 5 test types" is a separate sentence from the intro paragraph, and the pipeline's own bullet list has "Generates..." and "Verifies..." as two independent bullets with no "and" connecting them; the record's quotation fuses non-adjacent wording into a single fabricated sentence.

record: DEC-20260313-C.md
line: 80
class: MISQUOTE
record_text: "still listed,\nsignal absent rather than faked"
source: Notion row (page id 32267c87082c8189a74ac57214ba5bec), Decision/Rationale fields, cited by "this row states"
source_text: Decision: "Show 'Unverified' SQS with capability still listed"; Rationale: "Distinct from 'Building track record' (tests exist, not enough runs). 'Unverified' = structurally can't test. Honesty, market incentive for Phase 2 providers, no removal of working functionality."
correction: the row states that the capability stays "still listed"; it never states the phrase "signal absent rather than faked" — that clause is the record author's own synthesis of the honesty rationale, not a quotation of the row.

record: DEC-20260314-F.md
line: 69
class: MISQUOTE
record_text: "five free capabilities via\nMCP without auth"
source: Notion row (page id 32367c87082c81bfaf90c949e06b8594), Rationale field
source_text: "Applied to: Sprint 9F (elevated to 5 free capabilities via MCP without auth)"
correction: the row says "5 free capabilities via MCP without auth" (a digit); the record's quotation spells the number out as "five," a word the row does not use.

record: DEC-20260315-A.md
line: 62
class: MISATTRIBUTED
record_text: "free capabilities via MCP without auth"
source: DEC-20260315-A's own Notion row (page id 32367c87082c81eda40dfa601fd6b444), attributed by "the row's own description of the target"
source_text: DEC-20260315-A's Rationale reads in full "Auth wall is the #1 blocker for autonomous agent activity. 2027.dev AX research confirms auth causes 40% of agent failures. Without zero-auth free tier, content launch drives discovery but agents can't convert to usage. Moving Sprint 9F from Phase B Launch +3d to Launch day/+1d." — no mention of a capability count or "free capabilities via MCP without auth" anywhere in it.
correction: that phrase (with "5," not "five") is DEC-20260314-F's Rationale, not this row's; the record misattributes a phrase (and a "the row's own text names five capabilities" claim) belonging to a different, same-week decision to DEC-20260315-A's own row.

record: DEC-20260315-H.md
line: 73
class: MISATTRIBUTED
record_text: "Quality floor\n... armed in prod"
source: CLAUDE.md, named by 'per DEC-20260812-A (CLAUDE.md: "Quality floor ... armed in prod")'
source_text: not present — CLAUDE.md's DEC-20260812-A entry reads "quality floor quarantine <70% / deactivate <30% on ≥10 real calls/30d, auto-promote on recovery" and never uses the words "armed in prod" anywhere in the file
correction: "armed in prod" is language from the user's separate project-memory note (project_quality_floor_armed_in_prod.md), not from CLAUDE.md; the record cites the wrong document for this phrase.

record: DEC-20260316-A.md
line: 82
class: MISQUOTE
record_text: "one headline signal"
source: Notion row (page id 32567c87082c819da00ffeb660efa605), Rationale field
source_text: "SQS (the dual-profile matrix output) is the issuer rating — the single headline signal."
correction: the row calls SQS "the single headline signal," not "one headline signal" — the record substitutes "one" for "single."

record: DEC-20260316-B.md
line: 50
class: MISQUOTE
record_text: "which is the real rating"
source: DEC-20260316-A.md's Rationale (and its Notion row, page id 32567c87082c819da00ffeb660efa605)
source_text: DEC-20260316-A.md: "The Combined Trust Grade created a competing letter that confused which signal was \"the\" rating"; the Notion row's Rationale: "creates a competing letter that confuses which signal is 'the' rating"
correction: neither source says "which is the real rating" — both say (a signal is) "'the' rating," and neither uses the word "real"; the record fabricates a different phrase.

record: DEC-20260317-F.md
line: 86
class: MISATTRIBUTED
record_text: "armed in\nprod, not dry-run"
source: CLAUDE.md, named by 'per DEC-20260812-A, CLAUDE.md: "armed in prod, not dry-run"'
source_text: not present — same as the DEC-20260315-H finding above, CLAUDE.md's DEC-20260812-A entry never uses the words "armed in prod"
correction: this phrase is from the user's project-memory note (project_quality_floor_armed_in_prod.md), not from CLAUDE.md; repeats the same misattribution found in DEC-20260315-H.md.

record: DEC-20260317-H.md
line: 42
class: MISQUOTE
record_text: "Strale independent tests"
source: Notion row (page id 32667c87082c81fb9d7df43e37be2954), Decision/Rationale fields
source_text: Decision: "...against Strale's own independent tests..."; Rationale: "...capabilities pass Strale's independent tests."
correction: both the row's Decision and Rationale say "Strale's independent tests" (possessive); the record drops the possessive "'s," which is not merely punctuation here since it changes "Strale's" to a different word "Strale."

record: DEC-20260318-A.md
line: 53
class: MISATTRIBUTED
record_text: "the workflow that scales\nto third-party providers."
source: DEC-20260318-A's own Notion row (page id 32767c87082c810581aefd19d1af8f34), cited by "per the row's own text"
source_text: DEC-20260318-A's Rationale only says "The old path doesn't scale to third-party providers." — the positive phrase belongs to DEC-20260318-B's Rationale instead: "This is the workflow that scales to third-party providers: they provide one input, the pipeline generates everything else."
correction: the exact phrase is real, but it is DEC-20260318-B's row talking about the upgraded pipeline, not DEC-20260318-A's own row (whose text on this subject is negative, about the old path).

record: DEC-20260320-A.md
line: 78
class: MISATTRIBUTED
record_text: "manual, 312-line\napp.ts import list"
source: named as "this row's Rationale" (Notion row, page id 32967c87082c81ea9912da343ea09960)
source_text: Rationale reads "(1) auto-register replaces 312-line manual import list — new executors discovered at startup automatically" — order is "312-line manual import list," no "app.ts"
correction: the exact wording "manual, 312-line `app.ts` import list" is this record's own Decision-section paraphrase (line 30), not the Notion Rationale it is attributed to; the Rationale states the words in a different order and without "app.ts."

record: DEC-20260323-A.md
line: 69
class: MISQUOTE
record_text: "read-time decay eliminated, write-time decay in force"
source: Notion row (page id 32c67c87082c81719ea5f67617482c43), Decision/Rationale, cited by "as the row states"
source_text: Decision: "All trust data served from DB columns. Write-time decay only. One score everywhere. Legacy single-composite model retained only for legacy_score field." Rationale: "...No live SQS computation on any read path."
correction: the row never phrases it as "read-time decay eliminated, write-time decay in force" — that exact wording is the record's own gloss, not a quotation of the row's Decision or Rationale.

record: DEC-20260330-B.md
line: 69
class: MISQUOTE
record_text: "Every capability has a Strale Quality Score (SQS) from 0-100. Check\nvia `GET /v1/quality/:slug`."
source: context7.json, "rules" array, 12th (last) entry, cited by the record as "Rule 12"
source_text: "There is no single 0-100 quality score anymore (the SQS engine and GET /v1/quality/:slug were removed 2026-05-05). Per-capability trust data (tested, pass_rate, last_tested_at) is public at GET /v1/public/ops/trust/capabilities/batch?slugs=slug1,slug2, and every /v1/do response carries a provenance + audit trail. Platform-wide counts and facts: GET /v1/platform/facts."
correction: rule 12 already says the opposite of what is quoted — it states there is no single 0-100 score anymore and that the SQS engine and GET /v1/quality/:slug were removed, then gives the current replacement endpoints. context7.json's rules array does not contain a rule claiming every capability has a 0-100 SQS or telling a developer to check GET /v1/quality/:slug; the "stale rule" this record reports finding does not exist — the file is already current on this point.

record: DEC-20260330-B.md
line: 79
class: MISQUOTE
record_text: "be embedded in workflow"
source: this record's own Decision text / Notion row Decision field
source_text: "Shift distribution strategy from \"be listed\" to \"be embedded in coding workflow\" via Context7, IDE rules, and vibe-coding-framed SEO."
correction: the established phrase (used earlier in this same record) is "be embedded in coding workflow"; this later reference drops the word "coding."

record: DEC-20260409-D.md
line: 109
class: MISQUOTE
record_text: "one representative solution per category\nagainst canonical test inputs"
source: Notion row (page id 33d67c87082c8118af3bf12a823aa540), Rationale field, cited by "as the row specifies"
source_text: "Runs weekly on one representative solution per category (KYB, validation, extraction, generation, etc.) against canonical test inputs."
correction: the row's sentence has a parenthetical "(KYB, validation, extraction, generation, etc.)" between "category" and "against"; the record's quotation drops it silently, with no ellipsis marking the omission, unlike the record's correct ellipsis use elsewhere.

### Coverage

DEC-20260310-E.md | spans: 6 | findings: 0
DEC-20260310-F.md | spans: 8 | findings: 1
DEC-20260313-C.md | spans: 6 | findings: 1
DEC-20260313-E.md | spans: 3 | findings: 0
DEC-20260313-F.md | spans: 3 | findings: 0
DEC-20260314-A.md | spans: 3 | findings: 0
DEC-20260314-B.md | spans: 7 | findings: 0
DEC-20260314-C.md | spans: 3 | findings: 0
DEC-20260314-F.md | spans: 8 | findings: 1
DEC-20260314-G.md | spans: 5 | findings: 0
DEC-20260315-A.md | spans: 5 | findings: 1
DEC-20260315-B.md | spans: 12 | findings: 0
DEC-20260315-H.md | spans: 5 | findings: 1
DEC-20260315-I.md | spans: 11 | findings: 0
DEC-20260316-A.md | spans: 6 | findings: 1
DEC-20260316-B.md | spans: 6 | findings: 1
DEC-20260317-A.md | spans: 10 | findings: 0
DEC-20260317-F.md | spans: 12 | findings: 1
DEC-20260317-G.md | spans: 8 | findings: 0
DEC-20260317-H.md | spans: 7 | findings: 1
DEC-20260318-A.md | spans: 7 | findings: 1
DEC-20260318-B.md | spans: 7 | findings: 0
DEC-20260320-A.md | spans: 8 | findings: 1
DEC-20260320-B.md | spans: 0 | findings: 0
DEC-20260320-E.md | spans: 4 | findings: 0
DEC-20260320-F.md | spans: 5 | findings: 0
DEC-20260321-A.md | spans: 6 | findings: 0
DEC-20260323-A.md | spans: 5 | findings: 1
DEC-20260324-A.md | spans: 3 | findings: 0
DEC-20260324-C.md | spans: 4 | findings: 0
DEC-20260329-A.md | spans: 2 | findings: 0
DEC-20260330-B.md | spans: 7 | findings: 2
DEC-20260404-A.md | spans: 5 | findings: 0
DEC-20260405-A.md | spans: 6 | findings: 0
DEC-20260406-E.md | spans: 7 | findings: 0
DEC-20260409-A.md | spans: 15 | findings: 0
DEC-20260409-B.md | spans: 7 | findings: 0
DEC-20260409-D.md | spans: 13 | findings: 1
DEC-20260410-A.md | spans: 8 | findings: 0
DEC-20260411-A.md | spans: 4 | findings: 0
DEC-20260411-B.md | spans: 4 | findings: 0

SWEEP COMPLETE

### Sweep P3

# Named-source quotation sweep — Partition P3

Commit `fcfceb59f68228c0e9910581a67e67b1810ee1fa`. Record count: 41 (from `closing9-P3.txt`; none are `DEC-20260905-*`, so none were skipped). Script: a Python extractor stripped YAML frontmatter, fenced code blocks, and inline code from each record body, then regex-matched every `"..."` span whose normalized form (transliterate €/×/≥/≤/→/…, lowercase, strip non-alphanumerics) was 12+ characters. Each span was then read against the sentence naming its source (a Notion row field via `dump_rows.py`, a repo file, another record, CLAUDE.md, or a frontend file) and classified by substring/segment-order comparison under the same normalization, never by eye.

### Ledger

DEC-20260413-A.md:61 | 290+ capabilities across 7 verticals (compan | CLAUDE.md, Capabilities & Quality | FAITHFUL
DEC-20260413-A.md:67 | Cross-Border Trade & Logistics | this record's own Decision text | FAITHFUL
DEC-20260413-A.md:67 | Web3 & DeFi Intelligence | this record's own Decision text | FAITHFUL
DEC-20260413-A.md:68 | Document Processing & Data Extraction | this record's own Decision text | FAITHFUL
DEC-20260413-A.md:69 | data-processing | CLAUDE.md (same list quoted at line 61) | FAITHFUL
DEC-20260413-A.md:76 | any company paying invoices, onboarding vend | this record's own Decision/Rationale text | FAITHFUL
DEC-20260413-A.md:79 | The thing that works is not the thing that g | docs/strategy/2026-08-05-direction-plan.md | FAITHFUL
DEC-20260413-A.md:86 | treats the compliance vertical as a separate | docs/strategy/2026-08-05-direction-plan.md | FAITHFUL
DEC-20260413-A.md:88 | added aggressively across all 7 verticals | this record's own Decision text | FAITHFUL
DEC-20260413-A.md:90 | aggressive addition when free to maintain | (record's own paraphrase label, unattributed) | NOT_A_QUOTATION
DEC-20260415-A.md:26 | Thinking-out-loud rhythm | (the new section's own name, unattributed) | NOT_A_QUOTATION
DEC-20260415-A.md:33 | Reddit reply edit pass on 2026-04-15 reveale | Notion row Rationale (DEC-20260415-A) | FAITHFUL
DEC-20260415-A.md:56 | Writing rules — as binding as the colours | docs/company/VOICE.md heading | FAITHFUL
DEC-20260415-A.md:57 | The claims half of voice | docs/company/VOICE.md heading | FAITHFUL
DEC-20260415-A.md:58 | thinking-out-loud, | (grep-style search term) | NOT_A_QUOTATION
DEC-20260415-A.md:58 | personal-account, | (grep-style search term) | NOT_A_QUOTATION
DEC-20260415-B.md:36 | Second Reddit reply edit pass on 2026-04-15 | Notion row Rationale (DEC-20260415-B) | FAITHFUL
DEC-20260415-B.md:61 | engagement-bait | (grep-style search term) | NOT_A_QUOTATION
DEC-20260416-A.md:63 | Bazaar discovery extension builder | apps/api/src/routes/x402-gateway-v2.ts comment | FAITHFUL
DEC-20260416-A.md:65 | x402 Payment Gateway (March 2026) | CLAUDE.md | FAITHFUL
DEC-20260416-A.md:66 | payment IS the auth | CLAUDE.md | FAITHFUL
DEC-20260416-A.md:70 | full SQS/provenance metadata | this record's own Rationale | FAITHFUL
DEC-20260416-A.md:72 | SQS scoring engine deleted | CLAUDE.md | FAITHFUL
DEC-20260416-A.md:82 | the first-party MCP is the only surface that | this record's own Rationale | FAITHFUL
DEC-20260419-A.md:106 | a new file added to the allowlist requires a | apps/api/scripts/check-no-new-console.mjs header comment (claimed) | MISATTRIBUTED
DEC-20260420-A.md:71 | the 0048 snapshot. | (record's own scare-quote, unattributed) | NOT_A_QUOTATION
DEC-20260420-A.md:104 | we still hand-write; just in TS, not SQL fil | DEC-20260511-C.md Decision text | MISQUOTE
DEC-20260421-J.md:104 | Adding New Capabilities | CLAUDE.md heading | FAITHFUL
DEC-20260421-J.md:122 | Predecessors that overlap the KYB families | CLAUDE.md | FAITHFUL
DEC-20260421-J.md:126 | un-revivable at current economics | DEC-20260421-L.md Decision text | FAITHFUL
DEC-20260421-J.md:128 | feat(singapore-company-data): migrate Tier-1 | commit bd25bc57 subject | FAITHFUL
DEC-20260421-L.md:84 | this is waiting. | (record's own rhetorical construction, unattributed) | NOT_A_QUOTATION
DEC-20260421-L.md:99 | feat(park): park company-intelligence-sdr so | commit b86d431a subject | FAITHFUL
DEC-20260421-L.md:114 | 12 remaining caps ... tombstoned with `deacti | apps/api/src/lib/capability-readiness.ts comment | FAITHFUL
DEC-20260421-L.md:127 | Predecessors that overlap the KYB families | CLAUDE.md | FAITHFUL
DEC-20260422-B.md:101 | Amazon CAPTCHA blocks datacenter IPs | apps/api/src/capabilities/auto-register.ts | FAITHFUL
DEC-20260422-B.md:118 | Predecessors that overlap the KYB families | CLAUDE.md | FAITHFUL
DEC-20260422-B.md:134 | leave the row, mark it, don't delete | (record's own paraphrase of its own discipline) | NOT_A_QUOTATION
DEC-20260422-C.md | (no quotations in this record) | | |
DEC-20260422-D.md:68 | notably EU High-Value Datasets under Reg. (E | apps/api/src/lib/provenance-builder.ts comment | FAITHFUL
DEC-20260422-D.md:70 | Capabilities sourcing from open-data APIs sh | apps/api/src/lib/provenance-builder.ts comment | FAITHFUL
DEC-20260422-D.md:83 | capabilities sourcing from open-data APIs | attributed to "the Decision's own scope" | MISATTRIBUTED
DEC-20260422-D.md:90 | Adding New Capabilities | CLAUDE.md heading | FAITHFUL
DEC-20260422-H.md:59 | The source partially superseded vendor-selec | DEC-20260430-A.md Consequences | FAITHFUL
DEC-20260422-H.md:64 | attempted to retire conflicting candidate li | DEC-20260430-A.md Context | FAITHFUL
DEC-20260422-H.md:71 | Retire Counterparty Assurance as Strale's pri | DEC-20260812-A.md Decision text | FAITHFUL
DEC-20260422-H.md:75 | retired as primary product, | CLAUDE.md | FAITHFUL
DEC-20260422-H.md:75 | a separate track gated on customer discovery | CLAUDE.md | FAITHFUL
DEC-20260423-A.md | (no quotations in this record) | | |
DEC-20260423-B.md | (no quotations in this record) | | |
DEC-20260424-A.md | (no quotations in this record) | | |
DEC-20260425-A.md:131 | third country transfer identification includ | GDPR Art. 30(1)(d)/(e) (external regulatory text) | UNVERIFIABLE
DEC-20260425-A.md:169 | processing_location keeps its current F-AUDI | this record's own Decision text | FAITHFUL
DEC-20260425-A.md:177 | sourced from a manifest-declared field per c | this record's own Decision text | FAITHFUL
DEC-20260425-A.md:181 | 'US' if the call invokes a US-hosted model p | apps/api/src/lib/provenance-builder.ts comment | FAITHFUL
DEC-20260425-A.md:182 | NOT YET captured (chunk 1.5 follow-up) | apps/api/src/lib/provenance-builder.ts comment | FAITHFUL
DEC-20260425-A.md:184 | Per-capability vendor-side jurisdictions, e. | apps/api/src/lib/provenance-builder.ts comment | FAITHFUL
DEC-20260425-B.md:83 | used to derive the EU AI Act data_jurisdicti | config/env-manifest.yaml (RAILWAY_REPLICA_REGION purpose) | FAITHFUL
DEC-20260425-B.md:85 | Not set in production on 2026-09-02 (Railway | config/env-manifest.yaml (STRALE_PROCESSING_REGION cost_note) | FAITHFUL
DEC-20260425-B.md:96 | processing_location keeps its current F-AUDI | DEC-20260425-A.md Decision text | FAITHFUL
DEC-20260425-B.md:100 | fix: read processing_location from RAILWAY_R | commit d165ae2 subject | FAITHFUL
DEC-20260427-A.md | (no quotations in this record) | | |
DEC-20260427-B.md | (no quotations in this record) | | |
DEC-20260427-H.md:44 | DEC-20260420-H established that capabilities | Notion row Rationale (DEC-20260427-H) | FAITHFUL
DEC-20260427-H.md:55 | Enforce DEC-20260420-H | this record's own title | FAITHFUL
DEC-20260427-H.md:73 | DEC-20260427-H-1: Runtime fetched patents.go | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260427-H.md:76 | DEC-20260427-H-2... Reactivation trigger: Tr | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260427-H.md:78 | DEC-20260427-H-3... Reactivation trigger: Gl | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260427-H.md:80 | DEC-20260427-H-4: Primary runtime fetched gl | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260427-H.md:82 | DEC-20260427-H-5: Runtime sent HEAD/GET prob | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260427-H.md:103 | the social-platform targets prohibited by DE | DEC-20260813-A.md | FAITHFUL
DEC-20260427-I.md:48 | Audit (docs/audits/2026-04-21-allabolag-patt | Notion row Rationale (DEC-20260427-I) | FAITHFUL
DEC-20260427-I.md:56 | Partially closed in practice 2026-05-07. DE | Notion row Outcome (DEC-20260427-I) | FAITHFUL
DEC-20260427-I.md:83 | REACTIVATED 2026-05-16 (Phase 2a/2b)... to O | apps/api/src/capabilities/auto-register.ts (dutch+portuguese comments) | MISQUOTE
DEC-20260427-I.md:85 | DEC-20260427-I-1 | auto-register.ts dutch-company-data comment | FAITHFUL
DEC-20260427-I.md:85 | DEC-20260427-I-2 | auto-register.ts portuguese-company-data comment | FAITHFUL
DEC-20260427-I.md:86 | REACTIVATED 2026-04-29: migrated from northd | auto-register.ts lithuanian-company-data comment | FAITHFUL
DEC-20260427-I.md:87 | REACTIVATED 2026-05-16 (Phase 2b): migrated | auto-register.ts spanish-company-data comment | FAITHFUL
DEC-20260427-I.md:90 | REACTIVATED 2026-05-06: migrated from northd | auto-register.ts german-company-data comment | FAITHFUL
DEC-20260427-I.md:91 | MIGRATED 2026-08-27: from Openapi.com WW-Top | auto-register.ts austrian-company-data comment | FAITHFUL
DEC-20260427-I.md:95 | REPLACES the prior northdata.com... scraper | apps/api/src/capabilities/dutch-company-data.ts | MISQUOTE
DEC-20260427-I.md:102 | 5 of the original 6... still in mid-rebuild | this record's own Outcome quote (line 56) | FAITHFUL
DEC-20260427-I.md:108 | The previous Browserless+northdata fallback | apps/api/src/capabilities/swiss-company-data.ts | FAITHFUL
DEC-20260427-I.md:109 | The northdata.com name-search... KRS-by-numb | apps/api/src/capabilities/polish-company-data.ts | MISQUOTE
DEC-20260427-I.md:111 | The northdata.com EU fallback was removed un | apps/api/src/capabilities/officer-search.ts | FAITHFUL
DEC-20260427-I.md:116 | Status is deliberately not restated here — r | CLAUDE.md | FAITHFUL
DEC-20260427-I.md:124 | a licensed registry or aggregator contract | this record's own Decision text | FAITHFUL
DEC-20260428-A.md | (no quotations in this record) | | |
DEC-20260428-B.md | (no quotations in this record) | | |
DEC-20260429-A.md | (no quotations in this record) | | |
DEC-20260430-A.md | (no quotations in this record) | | |
DEC-20260503-A.md | (no quotations in this record) | | |
DEC-20260503-B.md:51 | SQS scoring engine deleted per DEC-20260503- | CLAUDE.md | FAITHFUL
DEC-20260503-B.md:62 | PR2 will drop the residual schema columns (` | CLAUDE.md | FAITHFUL
DEC-20260503-B.md:73 | hourly free-only | this record's own Decision text | FAITHFUL
DEC-20260503-B.md:75 | Test scheduling now filters on test_suites.s | CLAUDE.md | FAITHFUL
DEC-20260503-B.md:81 | hourly free-only | this record's own Decision text | FAITHFUL
DEC-20260503-B.md:81 | Paid capabilities remain excluded from sched | apps/api/src/jobs/test-scheduler.ts header comment | FAITHFUL
DEC-20260503-B.md:88 | tiered audit trail (basic on capabilities, f | this record's own title | FAITHFUL
DEC-20260503-B.md:99 | *-Assurance products | this record's own title/Decision | FAITHFUL
DEC-20260503-B.md:103 | Daily SQS snapshot retired with the SQS engi | apps/api/src/jobs/test-scheduler.ts comment | FAITHFUL
DEC-20260505-A.md:37 | The 2026-05-02–05 drift (DEC-20260502-A Coun | Notion row Rationale (DEC-20260505-A) | FAITHFUL
DEC-20260505-A.md:42 | Direct application of Working rules Rule F ( | Notion row Rationale (DEC-20260505-A) | FAITHFUL
DEC-20260505-A.md:49 | closing-steps Rule 11 in project knowledge c | Notion row Rationale (DEC-20260505-A) | FAITHFUL
DEC-20260505-A.md:51 | chat reviews CC reports for the sweep step o | Notion row Rationale (DEC-20260505-A) | FAITHFUL
DEC-20260505-A.md:65 | Supersessions → ALWAYS use Contradiction Pro | CLAUDE.md Workflow Invariants | FAITHFUL
DEC-20260505-A.md:73 | Regenerated by `npm run archive:index`... Ch | handoff/README.md | FAITHFUL
DEC-20260505-B.md:37 | PR1 (commits 6e71d7d → ae338fb, pushed 2026- | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-B.md:45 | Implements DEC-20260503-B (SQS public-score | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-B.md:51 | transitionCapability, LifecycleState/Transit | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-B.md:54 | evaluateLifecycle, runLifecycleSweep, smokeT | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-B.md:56 | 8 capabilities sit in non-active states (1 d | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-B.md:59 | If automatic transitions are needed in the f | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-B.md:69 | Per DEC-20260503-B (SQS deletion), automatic | apps/api/src/lib/lifecycle.ts header comment | FAITHFUL
DEC-20260505-B.md:77 | evaluateLifecycle and runLifecycleSweep were | apps/api/src/lib/lifecycle.ts trailing comment | FAITHFUL
DEC-20260505-B.md:83 | --sweep mode was removed with the SQS engine | apps/api/scripts/lifecycle-transition.ts comment | FAITHFUL
DEC-20260505-B.md:94 | If automatic transitions are needed in the f | Notion row Rationale (DEC-20260505-B) | FAITHFUL
DEC-20260505-C.md:37 | PR1 (commits 6e71d7d → ae338fb, pushed 2026- | Notion row Rationale (DEC-20260505-C) | FAITHFUL
DEC-20260505-C.md:44 | Implements DEC-20260503-B (SQS public-score | Notion row Rationale (DEC-20260505-C) | FAITHFUL
DEC-20260505-C.md:49 | previously a solution required matrixSqs > 0 | Notion row Rationale (DEC-20260505-C) | FAITHFUL
DEC-20260505-C.md:53 | Prepush diagnostics confirmed 2.7% (3 of 113 | Notion row Rationale (DEC-20260505-C) | FAITHFUL
DEC-20260505-C.md:82 | for separate investigation | Notion row Rationale (self-quote, line 53) | FAITHFUL
DEC-20260505-G.md:40 | each call to your customers needs to corresp | Notion row Rationale (DEC-20260505-G) | FAITHFUL
DEC-20260505-G.md:54 | unit economics murdered | Notion row Rationale (DEC-20260505-G) | FAITHFUL
DEC-20260505-G.md:92 | Current Decisions (August 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260505-G.md:94 | compliance is a separate track gated on cust | CLAUDE.md | FAITHFUL
DEC-20260505-H.md:50 | Yes, you can store all of that for auditabil | Notion row Rationale (DEC-20260505-H) | FAITHFUL
DEC-20260505-H.md:75 | Register at https://openregister.de/keys (50 | apps/api/src/capabilities/german-company-data.ts | FAITHFUL
DEC-20260505-H.md:81 | not set in production | config/env-manifest.yaml OPENSANCTIONS_API_KEY cost_note (claimed) | MISQUOTE
DEC-20260505-H.md:92 | resolves the gating condition from DEC-20260 | DEC-20260508-D.md | FAITHFUL
DEC-20260506-G.md:69 | External spend: EUR 50/week | docs/company/CHARTER.md line 399 | FAITHFUL
DEC-20260506-G.md:71 | spending inside the EUR 50/week envelope | docs/company/CHARTER.md line 43 | FAITHFUL
DEC-20260506-G.md:87 | sales-gated pricing... collides with DEC-202 | attributed to DEC-20260507-D | MISATTRIBUTED
DEC-20260506-G.md:89 | consistent with DEC-20260506-G no-fixed-cost | DEC-20260507-E.md | FAITHFUL
DEC-20260507-D.md:31 | not available | (record's own Decision text, descriptive) | NOT_A_QUOTATION
DEC-20260507-D.md:34 | future BYO-endpoint augmentation | Notion "Counterparty Assurance product page" (external) | UNVERIFIABLE
DEC-20260507-D.md:67 | Current Decisions (August 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260507-D.md:68 | the readiness program adopted ... the Counte | CLAUDE.md | FAITHFUL
DEC-20260507-D.md:71 | per CA product page | (record's own paraphrase, unattributed) | NOT_A_QUOTATION
DEC-20260507-D.md:77 | x402 Payment Gateway (March 2026) | CLAUDE.md | FAITHFUL
DEC-20260507-E.md:42 | consistent with DEC-20260506-G no-fixed-cost | this record's own Context | FAITHFUL
DEC-20260507-E.md:56 | meaningful customer traffic | this record's own Decision text | FAITHFUL
DEC-20260507-E.md:71 | meaningful customer traffic | this record's own Decision text | FAITHFUL
DEC-20260507-E.md:80 | resolves the gating condition from DEC-20260 | DEC-20260508-D.md | FAITHFUL
DEC-20260507-F.md:50 | doctrinally cleaner per DEC-20260428-A. | Notion row Rationale (DEC-20260507-F) | FAITHFUL
DEC-20260507-F.md:79 | US v1 per-state Tier-1/Tier-2 classification | DEC-20260515-B.md title | FAITHFUL
DEC-20260507-G.md:38 | CC, 2026-05-07, commit 84398f7, | Notion row Rationale (DEC-20260507-G) | FAITHFUL
DEC-20260507-G.md:39 | Tier-1 doctrine-clean per DEC-20260428-A | Notion row Rationale (DEC-20260507-G) | FAITHFUL
DEC-20260507-G.md:84 | Gated behind OPENAPI_ENABLED flag pending re | manifests/bulgarian-company-data.yaml + cypriot | FAITHFUL
DEC-20260507-G.md:86 | Openapi case 151296, | manifests/bulgarian-company-data.yaml + cypriot | FAITHFUL
DEC-20260507-G.md:87 | MUST stay 'false' in production until the re | config/env-manifest.yaml OPENAPI_ENABLED | FAITHFUL
DEC-20260507-G.md:88 | 10 EU country capabilities. | config/env-manifest.yaml OPENAPI_COM_EMAIL | FAITHFUL
DEC-20260507-H.md:39 | CC, 2026-05-07, commit 84398f7 | Notion row Rationale (DEC-20260507-H) | FAITHFUL
DEC-20260507-H.md:76 | Gated behind OPENAPI_ENABLED flag pending re | manifests/luxembourgish + hungarian-company-data.yaml | FAITHFUL
DEC-20260507-H.md:78 | Openapi case 151296, | manifests/luxembourgish + hungarian-company-data.yaml | FAITHFUL
DEC-20260507-H.md:80 | MUST stay 'false' in production until the re | config/env-manifest.yaml OPENAPI_ENABLED | FAITHFUL
DEC-20260507-H.md:89 | Refines HU portion of DEC-20260507-H; LU por | DEC-20260508-A.md title | FAITHFUL

### Findings

record: DEC-20260419-A.md
line: 106
class: MISATTRIBUTED
record_text: "a new file added to the allowlist requires a justification comment"
source: apps/api/scripts/check-no-new-console.mjs, header comment (lines 1-24)
source_text: not present — the header comment describes migration phases and CI enforcement but never uses the words "justification comment"; the actual quote is this same record's own Decision text (line 65-66: "Any new file added to the allowlist requires a justification comment.")
correction: The sentence "requires a justification comment" is this record's own Decision-section wording, not language from the script's header comment; the header comment says nothing about justification comments.

record: DEC-20260420-A.md
line: 104
class: MISQUOTE
record_text: "we still hand-write; just in TS, not SQL files"
source: docs/decisions/records/DEC-20260511-C.md, Decision section, line 39
source_text: "the project still hand-writes migration logic; just in TS, not SQL files."
correction: DEC-20260511-C's Decision text reads "the project still hand-writes migration logic; just in TS, not SQL files," not "we still hand-write; just in TS, not SQL files" — the subject and verb form were altered.

record: DEC-20260422-D.md
line: 83
class: MISATTRIBUTED
record_text: "capabilities sourcing from open-data APIs"
source: apps/api/src/lib/provenance-builder.ts, line 39 (in-code comment)
source_text: "Capabilities sourcing from open-data APIs should set all four."
correction: The phrase is attributed to "the Decision's own scope," but the Decision text actually reads "Capabilities sourcing data from open-data APIs" (with "data"); the exact wording quoted only appears in the provenance-builder.ts code comment, not in the Decision section.

record: DEC-20260425-A.md
line: 131
class: UNVERIFIABLE
record_text: "third country transfer identification including safeguards"
source: GDPR Art. 30(1)(d)/(e)
source_text: not present in this repository, the parsed Notion row, the row's page body, the frontend checkout, or a merged pull request
correction: This is a quotation of external EU regulatory text (GDPR Article 30) that is not part of any source this sweep can check; its fidelity cannot be verified from repository evidence.

record: DEC-20260427-I.md
line: 83
class: MISQUOTE
record_text: "REACTIVATED 2026-05-16 (Phase 2a/2b)... to Openapi.com WW-Top / PT-Advanced (Tier 3 vendor aggregator)"
source: apps/api/src/capabilities/auto-register.ts, dutch-company-data and portuguese-company-data DEACTIVATED-map comments
source_text: dutch comment: "REACTIVATED 2026-05-16 (Phase 2a): migrated from northdata.com Browserless scrape (Tier 1 violation per DEC-20260427-I-1) to Openapi.com WW-Top (Tier 3 vendor aggregator)."; portuguese comment: "REACTIVATED 2026-05-16 (Phase 2b): migrated from northdata.com Browserless scrape (Tier 1 violation per DEC-20260427-I-2) to Openapi.com PT-Advanced (Tier 3 vendor aggregator)."
correction: Neither comment reads "(Phase 2a/2b)" or "WW-Top / PT-Advanced" — the record merged two separate comments' phase suffixes and vendor names into one string presented as a single verbatim quotation.

record: DEC-20260427-I.md
line: 95
class: MISQUOTE
record_text: "REPLACES the prior northdata.com... scraper"
source: apps/api/src/capabilities/dutch-company-data.ts, lines 1-4
source_text: "Phase 2a Openapi resolver replication. REPLACES the prior northdata.com scraping path (Tier 1 violation per DEC-20260427-I-1, deactivated 2026-04-29)."
correction: The file says "scraping path," not "scraper" — the word "scraper" does not appear anywhere in dutch-company-data.ts.

record: DEC-20260427-I.md
line: 109
class: MISQUOTE
record_text: "The northdata.com name-search... KRS-by-number is the only compliant path"
source: apps/api/src/capabilities/polish-company-data.ts, lines 17-19
source_text: "KRS-by-number is the only compliant path. The northdata.com name-search fallback was removed under DEC-20260427-I (commercial KYB-aggregator scraping ban)."
correction: The source states "KRS-by-number is the only compliant path" first and "The northdata.com name-search fallback was removed..." second — the record's ellipsis-joined quote reverses that sentence order.

record: DEC-20260505-H.md
line: 81
class: MISQUOTE
record_text: "not set in production"
source: config/env-manifest.yaml, OPENSANCTIONS_API_KEY entry (lines 797-806), cost_note field
source_text: "Held, not read. Documented so a credential audit reports it as a recorded decision rather than raising it again as a finding. An unused live credential is still a live credential; if it is ever not worth re-issuing, delete the Railway variable, not the account."
correction: OPENSANCTIONS_API_KEY's cost_note says "Held, not read," not "not set in production" — that exact phrase belongs to dozens of other rows' cost_notes (e.g. STRALE_PROCESSING_REGION, correctly quoted elsewhere in this same batch) but not to OPENSANCTIONS_API_KEY's.

record: DEC-20260506-G.md
line: 87
class: MISATTRIBUTED
record_text: "sales-gated pricing... collides with DEC-20260506-G no-fixed-cost stance"
source: docs/decisions/records/DEC-20260507-F.md (Kyckr rejection), Notion row Rationale field
source_text: "Sales-gated pricing (no public PAYG console, no published rates) collides with DEC-20260506-G no-fixed-cost stance."
correction: The Kyckr rejection carrying this exact phrase is DEC-20260507-F, not DEC-20260507-D; DEC-20260507-D is the unrelated "no BYO-credentials" record and never mentions Kyckr or sales-gated pricing.

record: DEC-20260507-D.md
line: 34
class: UNVERIFIABLE
record_text: "future BYO-endpoint augmentation"
source: the Counterparty Assurance product page (Notion, not one of this batch's evidence links, not fetched)
source_text: not present in this repository, the parsed Notion row, the row's page body, the frontend checkout, or a merged pull request
correction: This purports to quote removed language from a Notion product page outside the six evidence links checked by this sweep; its fidelity cannot be verified from available sources.

### Coverage

DEC-20260413-A.md | spans: 10 | findings: 0
DEC-20260415-A.md | spans: 6 | findings: 0
DEC-20260415-B.md | spans: 2 | findings: 0
DEC-20260416-A.md | spans: 6 | findings: 0
DEC-20260419-A.md | spans: 1 | findings: 1
DEC-20260420-A.md | spans: 2 | findings: 1
DEC-20260421-J.md | spans: 4 | findings: 0
DEC-20260421-L.md | spans: 4 | findings: 0
DEC-20260422-B.md | spans: 3 | findings: 0
DEC-20260422-C.md | spans: 0 | findings: 0
DEC-20260422-D.md | spans: 4 | findings: 1
DEC-20260422-H.md | spans: 5 | findings: 0
DEC-20260423-A.md | spans: 0 | findings: 0
DEC-20260423-B.md | spans: 0 | findings: 0
DEC-20260424-A.md | spans: 0 | findings: 0
DEC-20260425-A.md | spans: 6 | findings: 1
DEC-20260425-B.md | spans: 4 | findings: 0
DEC-20260427-A.md | spans: 0 | findings: 0
DEC-20260427-B.md | spans: 0 | findings: 0
DEC-20260427-H.md | spans: 8 | findings: 0
DEC-20260427-I.md | spans: 16 | findings: 3
DEC-20260428-A.md | spans: 0 | findings: 0
DEC-20260428-B.md | spans: 0 | findings: 0
DEC-20260429-A.md | spans: 0 | findings: 0
DEC-20260430-A.md | spans: 0 | findings: 0
DEC-20260503-A.md | spans: 0 | findings: 0
DEC-20260503-B.md | spans: 9 | findings: 0
DEC-20260504-A.md | spans: 0 | findings: 0
DEC-20260504-B.md | spans: 0 | findings: 0
DEC-20260504-C.md | spans: 0 | findings: 0
DEC-20260505-A.md | spans: 6 | findings: 0
DEC-20260505-B.md | spans: 10 | findings: 0
DEC-20260505-C.md | spans: 5 | findings: 0
DEC-20260505-G.md | spans: 4 | findings: 0
DEC-20260505-H.md | spans: 4 | findings: 1
DEC-20260506-G.md | spans: 4 | findings: 1
DEC-20260507-D.md | spans: 6 | findings: 1
DEC-20260507-E.md | spans: 4 | findings: 0
DEC-20260507-F.md | spans: 2 | findings: 0
DEC-20260507-G.md | spans: 6 | findings: 0
DEC-20260507-H.md | spans: 5 | findings: 0

SWEEP COMPLETE

### Sweep P4

# Named-source quotation sweep — Partition P4

Partition P4, commit `fcfceb59f68228c0e9910581a67e67b1810ee1fa`, 42 records. The
checker (`scripts/m2-quote-fidelity.mjs`) accepts a quoted span if it matches
ANY candidate source in the repo, not the specific source the sentence names,
and it skips short spans; this sweep instead extracted every double-quoted
span of 12+ normalized characters per record and read the exact source the
sentence names for it, once, classifying each by substring match after
normalization (case-folded, punctuation stripped, `€`/`×`/`≥`/`≤`/`→`/`…`
transliterated).

### Ledger

- `DEC-20260507-I.md:29` | I'm reaching out because... | record's own example phrase | NOT_A_QUOTATION
- `DEC-20260507-I.md:36` | Existing Brand & voice doctrine had a tens | Notion row Rationale (page 35967c87082c81a28b04d44b83d63c3b) | FAITHFUL
- `DEC-20260507-J.md:55` | Until now nothing routed them here: `test-r | apps/api/src/lib/circuit-breaker.ts:190-192 | FAITHFUL
- `DEC-20260507-J.md:64` | Phase 3 Harden Fix B — feeding test failure | apps/api/src/lib/test-runner.ts:844-859 | FAITHFUL
- `DEC-20260507-J.md:77` | Without this guard, every paid capability's | apps/api/src/lib/circuit-breaker.ts:192-195 | FAITHFUL
- `DEC-20260508-A.md:58` | változatlan tartalommal és formában | Notion row Rationale (page 35a67c87082c8139993eea13b6235b67) | FAITHFUL
- `DEC-20260508-A.md:62` | imprecise rationale ('no Tier-1 free path;  | same Notion row Rationale | FAITHFUL
- `DEC-20260508-A.md:78` | no Tier-1 path exists | record's own paraphrase, no source named | NOT_A_QUOTATION
- `DEC-20260508-A.md:78` | a Tier-1 path exists but has a fixed floor, | record's own paraphrase, no source named | NOT_A_QUOTATION
- `DEC-20260508-A.md:90` | Openapi case 151296 | manifests/hungarian-company-data.yaml:98 | FAITHFUL
- `DEC-20260508-D.md:44` | resolves the gating condition from DEC-2026 | Notion row Rationale (page 35a67c87082c81b7a60af143e1f3dec1) | FAITHFUL
- `DEC-20260508-D.md:52` | We will start integration on Pro using the  | same Notion row Rationale | FAITHFUL
- `DEC-20260510-A.md:37` | Trunk's handoff/_general/from-code/ accumul | Notion row Rationale (page 35c67c87082c81949063e8b6dd94980d) | FAITHFUL
- `DEC-20260510-A.md:46` | if untracked notes accumulate (>3 unresolve | same Notion row Rationale | FAITHFUL
- `DEC-20260510-A.md:53` | Per Rule F, structural enforcement is a clo | same Notion row Rationale | FAITHFUL
- `DEC-20260510-A.md:58` | remains an intentional handoff archive with | same Notion row Rationale | FAITHFUL
- `DEC-20260510-A.md:66` | handoff/ — session handoffs, auto-generated | handoff/README.md:1-5 | FAITHFUL
- `DEC-20260510-A.md:74` | 89+ tracked files | same Notion row Rationale (self-reference) | FAITHFUL
- `DEC-20260510-A.md:75` | 244 files (217 with a recorded intent, 27 w | handoff/README.md:12 | MISQUOTE
- `DEC-20260510-A.md:81` | PROMOTE-TO-TRACKED | Notion row Rationale (same page, label used there too) | FAITHFUL
- `DEC-20260510-A.md:84` | Receipts and migration ledger | docs/programs/cto-readiness/PROGRAM.md:94 | FAITHFUL
- `DEC-20260510-A.md:84` | Test and audit evidence is an immutable rec | docs/programs/cto-readiness/PROGRAM.md:94 | FAITHFUL
- `DEC-20260510-A.md:87` | promote a useful handoff note to tracked, | record's own compressed paraphrase, no source named | NOT_A_QUOTATION
- `DEC-20260511-B.md:40` | The May 2026 Haiku token spike (PRs #84/#85 | Notion row Rationale (page 35d67c87082c812c864dfeaa2b9afaff) | FAITHFUL
- `DEC-20260511-B.md:49` | hourly, free-only | docs/decisions/records/DEC-20260503-B.md:31 | FAITHFUL
- `DEC-20260511-B.md:75` | The rows block 0066 owns: suites whose capa | apps/api/src/lib/startup-migrations.ts:573-600 | FAITHFUL
- `DEC-20260511-B.md:86` | A startup migration rewrites the flag on ev | CLAUDE.md:324 | FAITHFUL
- `DEC-20260511-B.md:105` | PR B will force explicit `scheduledTestingE | apps/api/src/lib/startup-migrations.ts:562-565 | FAITHFUL
- `DEC-20260511-C.md:85` | CC does not reconcile silently. | attributed to "the 2026-05-13 cleanup prompt" | ALREADY_WITHDRAWN DEC-20260905-B item 6
- `DEC-20260511-C.md:90` | did X ship to main? | record's own rhetorical illustration, no source named | NOT_A_QUOTATION
- `DEC-20260511-C.md:112` | Evidence receipts and the migration ledger  | CLAUDE.md:123 | FAITHFUL
- `DEC-20260511-C.md:113` | Deploy Mechanism Verification Protocol (DEC | CLAUDE.md:601 | FAITHFUL
- `DEC-20260511-D.md` | (no quotations in this record) | — | —
- `DEC-20260511-E.md:39` | checkValidationQueueStuck already existed a | Notion row Rationale (page 35d67c87082c8111a057d140694d35c8) | FAITHFUL
- `DEC-20260511-E.md:68` | Staleness anchor for lifecycle-state checks | apps/api/src/lib/meta-monitoring.ts:420-427 | FAITHFUL
- `DEC-20260511-E.md:78` | Check 11: Validation queue stuck (DEC-20260 | apps/api/src/lib/meta-monitoring.ts:468-483 | FAITHFUL
- `DEC-20260511-E.md:84` | anchored on lifecycle_transition into 'prob | apps/api/src/lib/meta-monitoring.ts:541-544 | FAITHFUL
- `DEC-20260511-F.md:37` | The daily-digest pipeline (apps/api/src/job | Notion row Rationale (page 35d67c87082c81f9a4addf5904c35025) | FAITHFUL
- `DEC-20260511-F.md:69` | Usage: cd apps/api && npx tsx src/jobs/dail | apps/api/src/jobs/daily-digest.ts:5 | FAITHFUL
- `DEC-20260511-F.md:73` | Weekly digest scheduling lived in the delet | apps/api/src/jobs/test-scheduler.ts:1020-1022 | FAITHFUL
- `DEC-20260511-F.md:78` | Trigger digest email now | apps/api/src/routes/admin.ts:355 | FAITHFUL
- `DEC-20260511-F.md:87` | A later, unmigrated row, DEC-20260511-F (St | docs/decisions/records/DEC-20260317-A.md:84-92 | FAITHFUL
- `DEC-20260513-A.md:36` | Hosting plan in DEC-20260503-C partially su | Notion row Decision field (page 35e67c87082c8165ab1ac6f1999026be) | FAITHFUL
- `DEC-20260513-A.md:57` | The website redesign is built inside this r | CLAUDE.md:302 (DEC-20260902-A) | FAITHFUL
- `DEC-20260513-A.md:62` | sibling-repo structure retained (monorepo d | Notion row Decision field (repeat) | FAITHFUL
- `DEC-20260513-A.md:82` | sibling-repo structure retained (monorepo d | Notion row Decision field (repeat) | FAITHFUL
- `DEC-20260513-B.md:35` | Earlier 2026-05-13 sessions diagnosed CH as | Notion row Rationale (page 35f67c87082c813b9dfbced384cc310f) | FAITHFUL
- `DEC-20260513-B.md:65` | Bug-fix cycle fully closed across all four  | same Notion row Outcome field | FAITHFUL
- `DEC-20260513-B.md:88` | 'closed' = healthy, 'open' = suspended, 'ha | apps/api/src/db/schema.ts:972 | FAITHFUL
- `DEC-20260513-B.md:91` | Manual pin released same day at 10:23Z | Notion row Rationale (repeat) | FAITHFUL
- `DEC-20260513-C.md:34` | Phase 1 Contain for SK rate-limit issue. Ro | Notion row Rationale (page 35f67c87082c815ba77fd8ba706ec0fc) | FAITHFUL
- `DEC-20260513-C.md:49` | structural rate limit Strale can't engineer | same Notion row Rationale | FAITHFUL
- `DEC-20260513-C.md:63` | Two-arg form: `slugStaggerMinute(slug, test | apps/api/src/jobs/test-scheduler.ts:230-233 | FAITHFUL
- `DEC-20260513-C.md:69` | Per DEC-20260503-B + DEC-20260513-D (per-su | apps/api/src/jobs/test-scheduler.ts:310 | FAITHFUL
- `DEC-20260513-C.md:82` | burst-saturated Zenedge-fronted upstreams ( | apps/api/src/jobs/test-scheduler.ts:316-318 | FAITHFUL
- `DEC-20260513-C.md:90` | Before this, two suites sharing (slug, test | apps/api/src/jobs/test-scheduler.ts:333-338 | FAITHFUL
- `DEC-20260513-C.md:103` | The Slovak RPO API limits anonymous traffic | manifests/slovak-company-data.yaml:160 | FAITHFUL
- `DEC-20260513-C.md:105` | documented 60 req/min on api.statistics.sk. | Notion row Rationale (repeat) | FAITHFUL
- `DEC-20260513-C.md:111` | Bug-fix cycle fully closed across all four  | same Notion row Outcome field | FAITHFUL
- `DEC-20260513-D.md:34` | DEC-20260506-D pinned the DK CVR circuit br | Notion row Rationale (page 35f67c87082c81f78805c7f287969d33) | FAITHFUL
- `DEC-20260513-D.md:44` | supersede DEC-20260506-D manual pin | Notion row Decision field | FAITHFUL
- `DEC-20260513-D.md:61` | auto-recovery | record's own scare-quoted hypothetical schema label, no source named | NOT_A_QUOTATION
- `DEC-20260513-D.md:77` | danish-company-data's 4 duplicate known_ans | apps/api/src/jobs/test-scheduler.ts:333-338 | FAITHFUL
- `DEC-20260513-D.md:85` | Financial data from annual reports — can be | manifests/danish-company-data.yaml:160 | FAITHFUL
- `DEC-20260513-D.md:94` | DEC-20260506-D superseded. | Notion row Rationale (repeat) | FAITHFUL
- `DEC-20260513-E.md:31` | EUR 0.80 = scraping-era pricing convention | Notion row Rationale (page 35f67c87082c81f499a9cbb9ebb39553) | FAITHFUL
- `DEC-20260513-E.md:100` | Predecessors that overlap the KYB families | CLAUDE.md:322 | FAITHFUL
- `DEC-20260515-A.md:95` | build wherever data is free or no-material- | Notion row Rationale (page 36167c87082c8199bbc9e65480db6f80) | FAITHFUL
- `DEC-20260515-A.md:107` | supersedes DEC-20260502-A (Counterparty Ass | CLAUDE.md:302 | FAITHFUL
- `DEC-20260515-A.md:130` | Not set in production on 2026-09-02 (Railwa | config/env-manifest.yaml:310 | FAITHFUL
- `DEC-20260515-A.md:135` | leave Cobalt, EINsearch and sec-api in plac | docs/company/DECISION-QUEUE.md:17-18 | FAITHFUL
- `DEC-20260515-A.md:139` | US Employer Identification Number (EIN) loo | manifests/us-ein-match.yaml:4 | FAITHFUL
- `DEC-20260515-A.md:142` | Extended SEC EDGAR filings search via sec-a | manifests/us-sec-filings-extended.yaml:4 | FAITHFUL
- `DEC-20260515-A.md:146` | Search US federal court records (RECAP dock | manifests/us-court-search.yaml:4 | FAITHFUL
- `DEC-20260515-B.md` | (no quotations in this record) | — | —
- `DEC-20260515-C.md:31` | evaluating / not active in v1 | Notion row Rationale (page 36167c87082c8106badac48483871f00) | FAITHFUL
- `DEC-20260515-C.md:91` | Poslovni register Slovenije via data.gov.si | manifests/slovenian-company-data.yaml:11-12 | FAITHFUL
- `DEC-20260515-C.md:93` | The data.gov.si open-data dataset contains  | manifests/slovenian-company-data.yaml:132-134 | FAITHFUL
- `DEC-20260515-C.md:96` | a paid AJPES restPrsInfo contract with redi | manifests/slovenian-company-data.yaml:135-136 | MISQUOTE
- `DEC-20260517-A.md` | (no quotations in this record) | — | —
- `DEC-20260518-A.md:38` | not exposed by this registry | Notion row Rationale (page 36367c87082c81aabeebd8dcff8a2dcd) | FAITHFUL
- `DEC-20260518-A.md:51` | Evidence Tier | record's own defined term, no source named | NOT_A_QUOTATION
- `DEC-20260518-A.md:51` | Data Sourcing Tier | record's own defined term, no source named | NOT_A_QUOTATION
- `DEC-20260518-A.md:54` | Evidence Tier | record's own defined term, no source named | NOT_A_QUOTATION
- `DEC-20260518-A.md:55` | Data Sourcing Tier | record's own defined term, no source named | NOT_A_QUOTATION
- `DEC-20260518-A.md:93` | Beneficial ownership data available via UK  | apps/api/src/capabilities/uk-company-data.ts:227 | FAITHFUL
- `DEC-20260518-A.md:96` | Danish beneficial ownership data integratio | apps/api/src/capabilities/danish-company-data.ts:184 | FAITHFUL
- `DEC-20260518-A.md:100` | Evidence Tier 1/2/3 | record's own label, used while describing a grep search | NOT_A_QUOTATION
- `DEC-20260518-B.md:55` | can this country deliver T1/T2/T3 | record's own illustrative example, no source named | NOT_A_QUOTATION
- `DEC-20260518-B.md:64` | Enhanced Due Diligence | record's own label, used while describing a grep search | NOT_A_QUOTATION
- `DEC-20260518-B.md:66` | Enhanced Due Diligence | record's own label, used while describing a grep search | NOT_A_QUOTATION
- `DEC-20260518-C.md:60` | SEPA IBAN-based name matching, see the SEPA | manifests/uk-cop-check.yaml:223 | FAITHFUL
- `DEC-20260518-C.md:70` | feat(evidence-tier): labeling sweep across  | PR #131 title (github.com/strale-io/strale/pull/131) | FAITHFUL
- `DEC-20260518-D.md:43` | does Strale return this today | Notion row Rationale (page 36467c87082c818a914dddd0e74544dc) | MISQUOTE
- `DEC-20260518-D.md:82` | feat(evidence-tier): labeling sweep across  | PR #131 title (github.com/strale-io/strale/pull/131) | FAITHFUL
- `DEC-20260518-E.md` | (no quotations in this record) | — | —
- `DEC-20260518-F.md` | (no quotations in this record) | — | —
- `DEC-20260518-G.md` | (no quotations in this record) | — | —
- `DEC-20260812-A.md` | (no quotations in this record) | — | —
- `DEC-20260813-A.md` | (no quotations in this record) | — | —
- `DEC-20260815-A.md` | (no quotations in this record) | — | —
- `DEC-20260820-A-WEBSITE-HERO.md` | (no quotations in this record) | — | —
- `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md:26` | The burden collapses | strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/integration-burden-v1.3.md:13 | FAITHFUL
- `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md:26` | Separate Lenses | strale-io/strale-frontend@f704cb2:.../use-case-company-research-v1.4.md:14 | FAITHFUL
- `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md:42` | Separate Lenses | same frontend file | FAITHFUL
- `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md:28` | Selection Violet | strale-io/strale-frontend@f704cb2:.../use-case-enrichment-validation-v1.5.md:64 | FAITHFUL
- `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:26` | Commerce Amber | strale-io/strale-frontend@f704cb2:.../use-case-search-web-intelligence-v1.6.md:64 | FAITHFUL
- `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:28` | not a live ranking | same frontend file:35 | FAITHFUL
- `DEC-20260820-E-WEBSITE-SEARCH-WEB.md:63` | not a live ranking | same frontend file (repeat) | FAITHFUL
- `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md:34` | Execution Coral | strale-io/strale-frontend@f704cb2:.../use-case-risk-verification-v1.7.md:7 | FAITHFUL
- `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md:35` | Responsive and Content Conformance v1.0 | strale-io/strale-frontend@f704cb2:.../foundations/responsive-content-conformance-v1.0.md:1 | FAITHFUL
- `DEC-20260822-A.md` | (no quotations in this record) | — | —
- `DEC-20260827-A.md:40` | licensed contract with the Austrian Justizm | historical "DEC-20260427-I-6" Notion record (no row in repo, register, or parsed export) | UNVERIFIABLE
- `DEC-20260831-A.md` | (no quotations in this record) | — | —
- `DEC-20260901-A.md` | (no quotations in this record) | — | —
- `DEC-20260904-A.md:123` | or an explicitly reviewed rule classifies p | docs/project/m2-closure-register.yaml:5154-5156 (G1 closes_when) | FAITHFUL
- `DEC-20260904-A.md:158` | architecture, implementation, what to measu | CLAUDE.md:300 | FAITHFUL
- `DEC-20260904-A.md:160` | Global decisions → ALWAYS get confirmation | CLAUDE.md:712 | FAITHFUL
- `DEC-20260904-A.md:167` | Readiness program adopted | CLAUDE.md:302 | FAITHFUL
- `DEC-20260904-A.md:180` | Every row reaches formally_migrated, intent | docs/project/m2-closure-register.yaml:5154-5156 | FAITHFUL
- `DEC-20260904-B.md:101` | where did this id's authority come from | record's own rhetorical framing, no source named | NOT_A_QUOTATION

### Findings

record: `DEC-20260510-A.md`
line: 75
class: MISQUOTE
record_text: "handoff/README.md currently reports "244 files (217 with a recorded intent, 27 without),""
source: `handoff/README.md`, line 12
source_text: "273 files (246 with a recorded intent, 27 without)."
correction: At commit fcfceb59, `handoff/README.md` reports 273 files (246 with a recorded intent, 27 without), not the 244/217 figures quoted; the count moves with every handoff this repository records and had already changed by the time this record's cited commit was checked out, which is consistent with the record's own point that the figure is dated, but the quoted digits themselves no longer match the named source verbatim.

record: `DEC-20260515-C.md`
line: 96
class: MISQUOTE
record_text: "a paid AJPES restPrsInfo contract with redistribution rights, or a future EU High-Value-Dataset expansion"
source: `manifests/slovenian-company-data.yaml`, lines 135-136
source_text: "Reactivation trigger: paid AJPES restPrsInfo contract with redistribution rights, or a future EU High-Value-Dataset expansion."
correction: The manifest's limitation text reads "Reactivation trigger: paid AJPES restPrsInfo contract..." with no leading "a" before "paid"; the record's quotation inserts a word not present in the source.

record: `DEC-20260518-D.md`
line: 43
class: MISQUOTE
record_text: "does Strale return this today"
source: Notion row Rationale field, page `36467c87082c818a914dddd0e74544dc`
source_text: "does Strale return UBO data today for this country?"
correction: The row's actual phrasing of "the second question" is "does Strale return UBO data today for this country?"; the record's quotation drops "UBO data" and "for this country" and substitutes "this" for the dropped words.

record: `DEC-20260827-A.md`
line: 40
class: UNVERIFIABLE
record_text: "licensed contract with the Austrian Justizministerium for direct Firmenbuch API access"
source: the historical Notion record "DEC-20260427-I-6"
source_text: not present (no formal record, closure-register row, or parsed-export row exists for this id)
correction: The record itself states in its Consequences section that `DEC-20260427-I-6` "has no row anywhere in the M2 closure register or the collision registry." The phrase is corroborated by two repository code comments (`apps/api/src/capabilities/austrian-company-data.ts:8` and `apps/api/src/capabilities/auto-register.ts:199`) that cite the same wording, but those comments are themselves secondhand citations of the same unverifiable Notion row, not an independent source; the original row cannot be checked against any of the sweep's allowed sources.

### Coverage

- `DEC-20260507-I.md` | spans: 2 | findings: 0
- `DEC-20260507-J.md` | spans: 3 | findings: 0
- `DEC-20260508-A.md` | spans: 5 | findings: 0
- `DEC-20260508-D.md` | spans: 2 | findings: 0
- `DEC-20260510-A.md` | spans: 11 | findings: 1
- `DEC-20260511-B.md` | spans: 5 | findings: 0
- `DEC-20260511-C.md` | spans: 4 | findings: 0 (1 ALREADY_WITHDRAWN)
- `DEC-20260511-D.md` | spans: 0 | findings: 0
- `DEC-20260511-E.md` | spans: 4 | findings: 0
- `DEC-20260511-F.md` | spans: 5 | findings: 0
- `DEC-20260513-A.md` | spans: 4 | findings: 0
- `DEC-20260513-B.md` | spans: 4 | findings: 0
- `DEC-20260513-C.md` | spans: 9 | findings: 0
- `DEC-20260513-D.md` | spans: 6 | findings: 0
- `DEC-20260513-E.md` | spans: 2 | findings: 0
- `DEC-20260515-A.md` | spans: 7 | findings: 0
- `DEC-20260515-B.md` | spans: 0 | findings: 0
- `DEC-20260515-C.md` | spans: 4 | findings: 1
- `DEC-20260517-A.md` | spans: 0 | findings: 0
- `DEC-20260518-A.md` | spans: 8 | findings: 0
- `DEC-20260518-B.md` | spans: 3 | findings: 0
- `DEC-20260518-C.md` | spans: 2 | findings: 0
- `DEC-20260518-D.md` | spans: 2 | findings: 1
- `DEC-20260518-E.md` | spans: 0 | findings: 0
- `DEC-20260518-F.md` | spans: 0 | findings: 0
- `DEC-20260518-G.md` | spans: 0 | findings: 0
- `DEC-20260812-A.md` | spans: 0 | findings: 0
- `DEC-20260813-A.md` | spans: 0 | findings: 0
- `DEC-20260815-A.md` | spans: 0 | findings: 0
- `DEC-20260820-A-WEBSITE-HERO.md` | spans: 0 | findings: 0
- `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md` | spans: 1 | findings: 0
- `DEC-20260820-C-WEBSITE-COMPANY-RESEARCH.md` | spans: 2 | findings: 0
- `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md` | spans: 1 | findings: 0
- `DEC-20260820-E-WEBSITE-SEARCH-WEB.md` | spans: 3 | findings: 0
- `DEC-20260820-F-WEBSITE-RISK-RESPONSIVE.md` | spans: 2 | findings: 0
- `DEC-20260822-A.md` | spans: 0 | findings: 0
- `DEC-20260827-A.md` | spans: 1 | findings: 1
- `DEC-20260831-A.md` | spans: 0 | findings: 0
- `DEC-20260901-A.md` | spans: 0 | findings: 0
- `DEC-20260904-A.md` | spans: 5 | findings: 0
- `DEC-20260904-B.md` | spans: 1 | findings: 0

SWEEP COMPLETE

### Sweep P5

# Named-source quotation sweep — Partition P5

Partition: P5. Commit: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`. Record count: 33 (from `closing9-P5.txt`; none are `DEC-20260905-*`).

The script: every double-quoted span of 12+ normalized characters was extracted from each record's body (frontmatter, fenced code, and inline code excluded), then read against the specific source the sentence names (a Notion row field via `dump_rows.py`, a repo file at this commit, another decision record, CLAUDE.md, or a `strale-frontend` file at the pinned SHA). Each span was classified by normalizing both span and source (transliterating symbols, lowercasing, stripping non-alphanumerics) and checking substring containment, segment by segment across any ellipsis.

### Ledger

DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:36 | Unmet Demand Ledger | row Rationale (page 31267c87082c81279b14f3859f6f2038) | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:39 | Here are 47 requests for Finnish company data this m | row Rationale | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:72 | to capture unauthenticated free-tier failures, | apps/api/src/db/schema.ts comment | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:77 | one INSERT on the failure path | row Rationale | MISQUOTE
DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md:81 | DEC-20260225-P-c5d6: 6th table, failed_requests (id, | CLAUDE.md | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md:81 | Dev.to #1... 'How We Score 297 Agent Data Capabilitie | archive/growth-ops/tweets-v2.md | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md:82 | Dev.to #2... 'Give Your LangChain Agent Verified Data | archive/growth-ops/tweets-v2.md | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md:84 | dev.to fact-check pass | archive/README.md | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md:95 | in the Show HN or outreach emails | archive/sessions/strale-spike-correlation-analysis-2026-04-08.md | FAITHFUL
DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md:100 | a second top-up | docs/company/GOALS.md | FAITHFUL
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md:47 | Not what you need? Tell me more | row Rationale | FAITHFUL
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md:75 | maps directly to `POST /v1/suggest` | row Rationale | FAITHFUL
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md:81 | rotating placeholder examples | row Rationale | FAITHFUL
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md:82 | GET /v1/suggest/typeahead` and the SQS engine itself | strale-frontend SearchHero.tsx comment | FAITHFUL
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md:89 | Not what you need? Tell me more → | strale-frontend RecommendationCard.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md:95 | Try/Details/Copy actions | row Rationale | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:68 | 5× response schemas | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:69 | custom retry logic | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:69 | DIY audit trail | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:69 | silent failures at 2am | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:70 | consistent JSON | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:70 | retries built in | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:71 | audit trail on every call | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:71 | MCP + A2A discovery | strale-frontend ProblemSection.tsx | FAITHFUL
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md:78 | tangled multicolor vs clean green | row Rationale | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:28 | Built for Agents | record's own decision paraphrase | NOT_A_QUOTATION
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:39 | Built for Agents | row Rationale | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:57 | Built for Agents | row Rationale | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:67 | goes from 11 to 10 sections | row Rationale | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:73 | Built for Agents (is gone) | record's own verification prose (checks absence in Index.tsx) | NOT_A_QUOTATION
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:73 | Built for Agents (named ... appears) | record's own verification prose | NOT_A_QUOTATION
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:84 | tabbed integrations. | row Decision text | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:87 | comparison back to #2 | row Decision text | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:92 | Homepage restructure: 11-section order | CLAUDE.md DEC-20260303-G entry | MISQUOTE
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:95 | Static discovery | row Decision text | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:95 | Solutions showcase (with discovery demo folded in) | strale-frontend Index.tsx comment | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:99 | static discovery | row Decision text | FAITHFUL
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md:109 | Built for Agents | record's own reversal-conditions prose | NOT_A_QUOTATION
DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md:38 | €1.50 solution + €0.80 capability | row Rationale | FAITHFUL
DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md:39 | €1.50 for KYC verification. | row Rationale | FAITHFUL
DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md:42 | kill DIY calculator | record's own nickname for sibling row | NOT_A_QUOTATION
DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md:58 | €1.50 for KYC verification | row Rationale | FAITHFUL
DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md:78 | No component_sum_cents in any discovery API response | row Decision text | FAITHFUL
DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md:36 | kill DIY calculator | record's own nickname for sibling row | NOT_A_QUOTATION
DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md:58 | capabilities | strale-frontend StatsStrip.tsx | FAITHFUL
DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md:58 | automated tests | strale-frontend StatsStrip.tsx | FAITHFUL
DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md:59 | free — no signup | strale-frontend StatsStrip.tsx | FAITHFUL
DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md:65 | Cert-audit Y-1+Y-3: ... will catch them). | strale-frontend StatsStrip.tsx comment | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:28 | Compare with DIY | row Decision text | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:34 | Components individually: €1.10. Solution: €1.50 with orchestration, | row Rationale | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:36 | €1.50 vs 2 weeks of integration work | row Rationale | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:37 | €1.50 vs €1.10 | row Rationale | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:40 | hide component prices | record's own nickname for sibling row | NOT_A_QUOTATION
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:41 | trust data must never be displayed with false confidence | record's own nickname for sibling row | NOT_A_QUOTATION
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:43 | never show component sum. | row Rationale | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:51 | kill DIY calculator | record's own nickname for own subject | NOT_A_QUOTATION
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:67 | Compare with DIY | row Decision text | FAITHFUL
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md:81 | hide component prices | record's own nickname for sibling row | NOT_A_QUOTATION
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md:37 | quality infrastructure | row Rationale | FAITHFUL
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md:37 | product recommendation. | row Rationale | FAITHFUL
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md:51 | here is quality infrastructure data | row Rationale (attributed "as the row states it") | MISQUOTE
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md:51 | here is a suggested product to buy. | row Rationale (attributed "as the row states it") | MISQUOTE
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md:61 | Show 'Unverified' SQS with capability still listed, | DEC-20260313-C.md title | FAITHFUL
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md:75 | lighter border | row Rationale | FAITHFUL
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:46 | a trust violation worse than showing nothing. | row Rationale | FAITHFUL
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:74 | Trust display centralization | CLAUDE.md | FAITHFUL
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:74 | Metric consistency, | CLAUDE.md | FAITHFUL
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:84 | Every component rendering trust data must call getTrustDisplayState() first, | strale-frontend trust-display.ts comment | FAITHFUL
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:91 | the worst of (SQS grade, freshness grade, latency grade), | apps/api/src/lib/trust-grade.ts comment | MISQUOTE
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md:93 | Reference data (stale: Nd since update, cycle Nd). | apps/api/src/lib/trust-grade.ts (illustrative "e.g." paraphrase of template literal) | NOT_A_QUOTATION
DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md:69 | The previous filesystem-glob discovery pulled in test files (.test.ts) and any unrelated .ts file, ... smoke-test. | apps/api/src/capabilities/auto-register.ts header comment | FAITHFUL
DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md:72 | regex-based XML parsing (no new dependency) | row Rationale | FAITHFUL
DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md:85 | 9/10 verification checks | row Rationale | FAITHFUL
DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md:86 | 11 smoke test steps | row Outcome | FAITHFUL
DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md:89 | ABR API GUID obtained, capability onboarded through the full Onboarding Pipeline (DEC-20260320-B). | row Rationale | FAITHFUL
DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md:69 | Drift problem (cert audit 2026-04-30) | apps/api/src/lib/platform-facts.ts header | FAITHFUL
DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md:70 | free-tier list: 5 in marketing, 11 in manifests, 5 different in production. | apps/api/src/lib/platform-facts.ts header | FAITHFUL
DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md:76 | Architecture | apps/api/src/lib/platform-facts.ts header | FAITHFUL
DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md:77 | Live values (capability counts, country counts, free-tier slugs) are computed from the DB on demand and cached at the route layer. | apps/api/src/lib/platform-facts.ts header | FAITHFUL
DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md:64 | pep-check` — ... Transparency: algorithmic, | CLAUDE.md capability list | FAITHFUL
DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md:72 | New capabilities (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md:78 | split out of seed-solutions.ts on 2026-08-16 so the definitions can be imported, validated and tested | apps/api/src/db/solution-catalogue.ts header | FAITHFUL
DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md:86 | Seed 60 new solutions (KYB Essentials, KYB Complete, Invoice Verify) across 20 countries, and deprecate 5 old solutions | apps/api/scripts/seed-kyb-solutions.ts header | FAITHFUL
DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md:114 | New solutions (March 2026) | CLAUDE.md heading | FAITHFUL
DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md:63 | Free-tier: 11 capabilities as of 2026-08 (email-validate, ... require no auth/signup. | CLAUDE.md | FAITHFUL
DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md:67 | free-tier list: 5 in marketing, 11 in manifests, 5 different in production, | apps/api/src/lib/platform-facts.ts header | FAITHFUL
DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md:76 | SQS scoring engine deleted per DEC-20260503-B (PR1 shipped 2026-05-05)... the automatic lifecycle transitions ... are all gone. | CLAUDE.md | FAITHFUL
DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md:80 | solution executions have no single capability | apps/api/src/db/schema.ts comment | FAITHFUL
DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md:82 | set for solution executions, null for capability executions. | apps/api/src/db/schema.ts comment | FAITHFUL
DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md:90 | A solution execution writes one transaction with capability_id = NULL and its step outcomes inside an output.steps JSONB blob... Verified against production: 694 solution rows, all with a null capability_id, and 126 sub-calls in the trailing 30 days recorded nowhere else. | apps/api/src/lib/startup-migrations.ts block 0101 comment | FAITHFUL
DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md:50 | Phase 4, a separate decision on credit-report-summary (DEC-20260405-B, no formal record exists for that id on main and it is not in docs/decisions/id-collisions.yaml, so it is mentioned here in prose only). | DEC-20260405-A.md | FAITHFUL
DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md:72 | DEC-20260405-B / DEC-20260422-SE-D: Swedish credit ratings, credit limits, and risk indicators are proprietary products of commercial bureaus ... not a credit bureau. | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md:76 | no free source for Swedish credit ratings exists | row Decision text | FAITHFUL
DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md:89 | Reactivation trigger: licensed credit-bureau contract (UC, Bisnode, Creditsafe), or a Strale solution that synthesises a risk score ... bureau-grade credit data). | apps/api/src/capabilities/auto-register.ts comment | FAITHFUL
DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md:48 | number or null | row Outcome (solution-execution-smoke.mts assertion) | FAITHFUL
DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md:64 | DEC-20260405-B explicitly specified per-step latencyMs as required. | row Rationale | FAITHFUL
DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md:88 | wraps each step with Date.now() timing on both success and failure branches. | row Outcome | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:75 | Workflow Protocol | CLAUDE.md heading | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:78 | Session contract | CLAUDE.md heading | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:80 | single governed page | row Rationale | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:81 | AMENDS DEC-20260812-A's escalation contract | docs/company/CHARTER.md | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:82 | if they ever diverge, this file is the text and the other two are pointers to it | docs/company/CHARTER.md | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:84 | Working Rules page is the canonical source | row Rationale | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:86 | execution records, not project truth, | docs/programs/README.md | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:92 | Notion Governance Rules (enforced) | CLAUDE.md heading | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:92 | Check before creating, | CLAUDE.md | FAITHFUL
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md:93 | ONE page per topic, | CLAUDE.md | FAITHFUL
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md:81 | $input.<field> — resolves to caller's inputs[<field>] | apps/api/src/lib/solution-executor.ts module header | FAITHFUL
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md:82 | $steps[N].<field> — resolves to step N's output[<field>] (0-indexed by execution order) | apps/api/src/lib/solution-executor.ts module header | FAITHFUL
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md:83 | $all_results — resolves to an object of ALL prior step outputs keyed by slug. | apps/api/src/lib/solution-executor.ts module header | FAITHFUL
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md:86 | $input.<path> → walk path from inputs (supports nested: $input.company.name) | apps/api/src/lib/solution-executor.ts resolveInputRef doc comment | FAITHFUL
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md:87 | $steps[N].<path> → walk path from completedSteps[N] (supports nested: $steps[0].license.spdx) | apps/api/src/lib/solution-executor.ts resolveInputRef doc comment | FAITHFUL
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md:93 | 10 new test cases | row Outcome | FAITHFUL
DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md:82 | Notion Workspace Structure (8 sections under Project Home) | CLAUDE.md heading | FAITHFUL
DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md:85 | Operating Manual | CLAUDE.md (checking its absence as a page name) | NOT_A_QUOTATION
DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md:87 | four-layer model: canonical pages / databases / archives / not-Strale. | row Rationale | FAITHFUL
DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md:96 | day-to-day operation | docs/company/CHARTER.md | FAITHFUL
DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md:97 | Programs are execution records, not project truth... Project truth lives in docs/project/ (candidate until M4) and docs/decisions/. | docs/programs/README.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:33 | Operating Manual (DEC-20260406-B) established the governance layer. ... obscure the canonical set. | row Rationale | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:57 | supersession without archival | row Rationale | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:68 | Repo-native migration continuation — pre-cutover | CLAUDE.md heading | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:69 | Candidate project documents remain inactive and Notion-backed workflows remain authoritative until the explicit atomic cutover, | CLAUDE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:77 | Notion Governance Rules (enforced) | CLAUDE.md heading | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:78 | Check before creating, | CLAUDE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:78 | ONE page per topic, | CLAUDE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md:79 | Superseded pages archived same session (prefix + move to archive), | CLAUDE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:29 | we're trying to solve that | row Rationale | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:30 | the strongest AI tell in 2026. | row Rationale | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:34 | The prior memory rule said 'never I built framing, use we or third-person institutional.' ... duplicate the wording. | row Rationale | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:75 | No jargon, ever, | docs/company/VOICE.md | MISQUOTE
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:75 | Say what it means for the business, | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:76 | Decisions are written as questions you can answer, | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:77 | Never dress up a number, | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:77 | Say the uncomfortable thing first | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:79 | internal reports, customer-facing copy, PR descriptions, session summaries — should read | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:82 | Formatting details... stay in strale-content-rules.md | row Rationale | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:89 | Say the uncomfortable thing first | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:90 | Never dress up a number | docs/company/VOICE.md | FAITHFUL
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md:92 | tentative over declarative | row Rationale | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:46 | all 12 constituent capabilities had clean SQS scores, but the solution was broken end-to-end due to input mapping bugs. | row Rationale | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:50 | €2.50 × 100 solutions × daily cadence = ~€250/day if all run every 24h | row Rationale | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:52 | final gate from the SpendLatch incident, | row Rationale | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:80 | Gate 4 (revised): Four-layer solution test pyramid, free-first | DEC-20260409-D.md title | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:81 | Original Gate 4 plan was 'run every solution end-to-end on the scheduler,' which would cost ~€1,500/month at full enablement... Most solution bug classes don't actually require live execution to catch. | DEC-20260409-D.md | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:86 | Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D Layer B) | apps/api/src/lib/gate4b-solution-dryrun.ts header | FAITHFUL
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md:89 | every solution end-to-end on the scheduler | attributed as "this row's own" phrase | MISATTRIBUTED
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:42 | SA.2b.a audit surfaced 6 open questions; all 6 decided and shipped as SA.2b.b (5 commits: B1 migration, B2 runtime, B3 manifest backfill, B4 maintenance_class repair, B5 dutch-company-data fixture repair). F-A-003 ... closed in prod as of 2026-04-20. | row Rationale | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:50 | this one only touches input so we said false | row Decision field (OQ #2) | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:51 | exactly F-A-003 | row Decision field (OQ #2) | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:54 | Warning-phase gates silently become permanent warnings | row Decision field (OQ #5) | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:76 | DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path semantics), DEC-20260420-C (SA.2a DELETE handler). | row Decision field (References) | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:102 | SA.2b.d: heuristic detectPersonalData was removed after migration 0050 | apps/api/src/lib/audit-helpers.ts comment | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:103 | during backfill | row Decision title | FAITHFUL
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md:111 | SA.2b.c (full 260-backfill) is blocked on the drift audit. | row Decision field | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:41 | F-A-005.a audit surfaced 6 open questions; all 6 decided and shipped as F-A-005.b (single commit a253d91). | row Rationale | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:43 | always-redact, | row Rationale (Design path heading) | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:44 | inherits the manifest-drift surface SA.2b.b discovered | row Rationale | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:46 | would leak silently | row Rationale | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:48 | breaks the no-signup-no-auth free-tier UX that makes the endpoint valuable. | row Rationale | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:54 | requires Content-Range per RFC 7233 which doesn't map to field-level redaction | row Rationale | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:58 | Adding body_redacted marker would confuse API clients that handle this response as a hash receipt. | row Rationale | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:62 | DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path), DEC-20260420-C (SA.2a DELETE handler), DEC-20260420-D (SA.2b PII classification). | row Rationale (References) | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:70 | Product architecture and first wedge | sibling row Decision text | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:95 | F-A-005: explicit body redaction marker. input, output, error, ... | apps/api/src/routes/transactions.ts comment | FAITHFUL
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md:98 | F-A-005: Unauthenticated lookups return a redacted envelope — body fields | apps/api/src/routes/transactions.ts comment | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:25 | Product architecture and first wedge, | row Decision text (own title) | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:43 | Product architecture and first wedge | row Decision text (own title) | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:59 | Direction Plan | docs/strategy/2026-08-05-direction-plan.md title | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:60 | Part Two — The compliance vertical, as a separate brand from scratch | docs/strategy/2026-08-05-direction-plan.md heading | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:62 | Not "a KYB API" — Trulioo, Creditsafe, Kyckr, and Moody's own that phrase. Three viable wedges: | docs/strategy/2026-08-05-direction-plan.md | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:65 | product architecture | row Decision text (own title, lowercase) | FAITHFUL
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:67 | library-as-product, | attributed to docs/strategy/2026-08-05-direction-plan.md | MISATTRIBUTED
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md:68 | supersedes... the Counterparty Assurance rename/ICP, | attributed to DEC-20260812-A (existing record) | MISATTRIBUTED
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:45 | F-A-006/007.a audit surfaced 9 open questions; all 9 decided and shipped as F-A-006/007.b across 2 commits. | row Rationale | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:48 | matches compliance-archive norms... and the existing retention grace period | row Rationale (OQ #1) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:50 | cleaner parsing... trivial backwards-compat distinction | row Rationale (OQ #2) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:52 | signals to clients that re-issue is the right next action, not retry-with-new-credentials | row Rationale (OQ #3) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:56 | Silent-failure on key validation is the worst outcome for a rotation mechanism | row Rationale (OQ #8) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:58 | no practical attack surface. | row Rationale (OQ #9) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:65 | DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path), DEC-20260420-C (SA.2a DELETE handler), DEC-20260420-D (SA.2b PII classification), DEC-20260420-E (F-A-005 free-tier redaction). | row Rationale (References) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:74 | Capability rationalization and site rebuild | sibling row Decision text | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:98 | F-A-007: optional rotation fallback, | apps/api/src/lib/audit-token.ts comment | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:99 | F-A-006: default token TTL. 90 days..., | apps/api/src/lib/audit-token.ts comment | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:99 | F-A-006 + F-A-007: verify with expiry check and two-key ring fallback | apps/api/src/lib/audit-token.ts comment | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:101 | F-A-006: expires_at is the new-format discriminator. Absent = legacy token (pre-F-A-006 deploy), accepted during sunset window | apps/api/src/routes/audit.ts comment | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:104 | This audit URL was issued under a pre-F-A-006 format that has been sunset. Re-issue via POST /v1/transactions/:id/audit-token | apps/api/src/routes/audit.ts message string | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md:115 | Operational follow-up | row Rationale heading | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md:26 | Capability rationalization and site rebuild, | row Decision text (own title) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md:44 | Capability rationalization and site rebuild | row Decision text (own title) | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md:62 | The website redesign is built inside this repository as apps/web (monorepo)... strale-frontend was swept and its design material preserved... and is kept, not extended, until the apps/web site serves production. | CLAUDE.md | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md:69 | Hosting plan in DEC-20260503-C partially superseded: strale-frontend on Cloudflare Pages (not Railway as planned); sibling-repo structure retained (monorepo deferred); payment rails portion of DEC-20260503-C remains active | DEC-20260513-A.md title | FAITHFUL
DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md:82 | capability rationalization | row Decision text (own title, lowercase) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:38 | max_depth_reached (N=50) | row Rationale (OQ #7) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:43 | F-A-012.a audit surfaced 7 open questions; all 7 decided and shipped as F-A-012.b in commit b26addc. Tightens pre-existing DoS mitigations that were insufficient at prod's observed chain-length distribution (median 25, P95 1,308, max 1,592). | row Rationale | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:47 | any sane cap truncates P95-day walks, so the cap choice is about per-request memory cost, not genesis-reachability | row Rationale (OQ #1) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:50 | lazy-security posture | row Rationale (OQ #2) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:51 | Legitimate human usage is one-off verification of specific transactions | row Rationale (OQ #3) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:54 | N-cap bounds wall-clock; rate limit bounds aggregate; Railway platform catches stuck handlers | row Rationale (OQ #6) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:57 | there's only one truncation reason today. | row Rationale (OQ #7) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:63 | DEC-20260420-A (hand-written migrations), DEC-20260420-B (SA.2a read-path), DEC-20260420-C (SA.2a DELETE handler), DEC-20260420-D (SA.2b PII classification), DEC-20260420-E (F-A-005 free-tier redaction), DEC-20260420-F (F-A-006/007 HMAC token lifecycle). | row Rationale (References) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:71 | Entity resolution as priority engineering investment | sibling row Decision text | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:97 | F-A-012: tighter caps than the original 200/50 (30 req/min). Prod chain... | apps/api/src/routes/verify.ts comment | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:98 | F-A-012: 10 req/min per IP (was 30). See archive/sessions/audit-reports/F_A_012_a_audit.md, | apps/api/src/routes/verify.ts comment | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:100 | F-A-012: true when the walk stopped at maxDepth before reaching... | apps/api/src/routes/verify.ts comment | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:101 | F-A-012: loop exited due to the depth cap (rather than genesis...). | apps/api/src/routes/verify.ts comment | FAITHFUL
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md:114 | Series closure | row Rationale heading | FAITHFUL
DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:27 | Entity resolution as priority engineering investment, | row Decision text (own title) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:45 | Entity resolution as priority engineering investment | row Decision text (own title) | FAITHFUL
DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:63 | Code-based lookup pattern + cross-validation for entity resolution, | DEC-20260409-B.md title | FAITHFUL
DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md:65 | Part 2, the cross-validation layer, was built as a standalone module but... file is itself orphaned: no capability executor under [wired into the solution executor]; the cross-validation half is dead code. | DEC-20260409-B.md | MISQUOTE
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:25 | Strale positioning and ICP clarification, | row Decision text (own title) | FAITHFUL
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:43 | Strale positioning and ICP clarification | row Decision text (own title) | FAITHFUL
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:57 | direct connections only. No scraping. Full ToS compliance with every provider | DEC-20260420-I row Rationale | MISQUOTE
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:59 | Amends DEC-20260420-H | DEC-20260420-I row Decision field | FAITHFUL
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:82 | library-as-product | attributed to docs/strategy/2026-08-05-direction-plan.md | MISATTRIBUTED
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:83 | supersedes... DEC-20260502-A (Counterparty Assurance rename/ICP)... the Counterparty Assurance framing is retired as primary product. | attributed to DEC-20260812-A (existing record) | MISATTRIBUTED
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md:86 | positioning and ICP clarification | row Decision text (own title, lowercase) | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:50 | DB is serving correct values for all classes — drift is invisible to users, only blocks the onboarding pipeline. | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:56 | the drift isn't a user-visible bug | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:57 | Session 1 is the natural rewrite point | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:58 | CC's investigation during implementation showed the mapping only fires on INSERT (net-new), not UPDATE (backfill). The actual SA.2b.b blocker was maintenance_class (Class 1), | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:61 | the single highest-priority fix. | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:63 | causes onboard.ts --backfill to execute the capability live, hitting prod APIs, | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:64 | a billing event and rate-limit risk, | row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:69 | DEC-20260420-A through DEC-20260420-G (complete SA.2 + F-A series). | row Rationale (References) | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:70 | the SA.2 + F-A series | row Rationale ("the row's own subject") | MISQUOTE
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:81 | Strale positioning and ICP clarification | sibling row Decision text | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:92 | ToS-prohibited targets (DEC-20260420-H social platforms, DEC-20260427-H-4 Google) | CLAUDE.md DEC-20260813-A entry | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:93 | DEC-20260420-H established that capabilities sourcing data via ToS-prohibited scraping are banned | DEC-20260427-H.md | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:95 | the social-platform targets prohibited by DEC-20260420-H | DEC-20260427-H.md (quoting DEC-20260813-A) | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:97 | the same legal reasoning as DEC-20260420-H (ToS-prohibited commercial-aggregator scraping). | DEC-20260427-I.md | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:101 | Strale positioning and ICP clarification | sibling row (own reference) | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:106 | Strale's doctrine under DEC-20260420-H states "direct data connections only. No scraping. Full ToS compliance with every provider." | DEC-20260420-I row Rationale | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:109 | Adopt split-by-data-source-type as the operable form of the "direct connections only" doctrine. Amends DEC-20260420-H. | DEC-20260420-I row Decision field | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:111 | direct connections only | DEC-20260420-I row Decision field | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:112 | social platforms | CLAUDE.md / DEC-20260427-H.md general framing | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:114 | social platforms. | checking absence in DEC-20260420-I's own quote | NOT_A_QUOTATION
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:139 | case "ai_assisted": return "ai_assisted"; | apps/api/scripts/onboard.ts | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:143 | Cluster 2 Phase 4a: --force-override-authority interactive guard | apps/api/scripts/onboard.ts comment | FAITHFUL
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md:155 | Path forward for SA.2b.c | row Rationale heading | FAITHFUL

### Findings

record: DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md
line: 77
class: MISQUOTE
record_text: "one INSERT on the failure path"
source: Notion row DEC-20260225-P-c5d6 (page 31267c87082c81279b14f3859f6f2038), Rationale field
source_text: "one INSERT on failure path"
correction: The row's Rationale says "one INSERT on failure path"; the record inserts the word "the" that is not in the source.

record: DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md
line: 92
class: MISQUOTE
record_text: "Homepage restructure: 11-section order"
source: CLAUDE.md, DEC-20260303-G bullet under Current Decisions (March 2026)
source_text: "DEC-20260303-G: Historical eleven-section homepage order; superseded for the apps/web redesign by DEC-20260905-A. Evidence still belongs near the claim it supports."
correction: CLAUDE.md names DEC-20260303-G "Historical eleven-section homepage order," not "Homepage restructure: 11-section order"; the record's parenthetical is a fabricated title, not a quotation of CLAUDE.md.

record: DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md
line: 51
class: MISQUOTE
record_text: "here is quality infrastructure data" (and, same sentence, "here is a suggested product to buy.")
source: Notion row DEC-20260304-C (page 31867c87082c810197f9efa520332024), Rationale field
source_text: "Dashboard aesthetic ... distinguishes it and communicates 'quality infrastructure' vs 'product recommendation'."
correction: The row's Rationale contrasts the bare phrases "quality infrastructure" and "product recommendation"; it never says "here is quality infrastructure data" or "here is a suggested product to buy." — the record invents an illustrative sentence and presents it as the row's own words under "The rationale, as the row states it:".

record: DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md
line: 91
class: MISQUOTE
record_text: "the worst of (SQS grade, freshness grade, latency grade),"
source: apps/api/src/lib/trust-grade.ts, line 211
source_text: "Combined grade = worst of (SQS grade, freshness grade, latency grade)"
correction: The comment says "worst of (...)", not "the worst of (...)"; the record inserts a word not in the source.

record: DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md
line: 75
class: MISQUOTE
record_text: "No jargon, ever,"
source: docs/company/VOICE.md, "Writing rules" list
source_text: "**Use audience-appropriate terms (DEC-20260905-A).** Use *tools* as the primary marketing catalogue noun; use *data services* when explaining the underlying service. ..." (the first of VOICE.md's five current rules)
correction: VOICE.md's five writing rules today are "Use audience-appropriate terms," "Say what it means for the business," "Decisions are written as questions you can answer," "Never dress up a number," and "Say the uncomfortable thing first" — there is no "No jargon, ever" rule in the file at this commit; the record lists a rule that does not exist there.

record: DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md
line: 89
class: MISATTRIBUTED
record_text: "Layer D (this row's own "every solution end-to-end on the scheduler" design) was never built."
source named: this row (DEC-20260409-C, page 33d67c87082c81c19655cb04fb7d3ecf)
source_text: not present (row's Decision/Rationale never uses this exact phrase)
correction: The phrase "run every solution end-to-end on the scheduler" is DEC-20260409-D's own characterization of "Original Gate 4 plan" (quoted earlier in this same record from docs/decisions/records/DEC-20260409-D.md), not text found in this row's own Decision or Rationale; attributing it here as "this row's own" phrase misattributes DEC-20260409-D's paraphrase to DEC-20260409-C's row.

record: DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md
line: 65
class: MISQUOTE
record_text: "Part 2, the cross-validation layer, was built as a standalone module but... file is itself orphaned: no capability executor under [wired into the solution executor]; the cross-validation half is dead code."
source: docs/decisions/records/DEC-20260409-B.md, Consequences section
source_text: "**Part 2, the cross-validation layer, was built as a standalone module but has zero capability callers.**" ... [several sentences later, different paragraph] ... "That file is itself orphaned: no capability executor under `apps/api/src/capabilities/` imports `northdata.ts` today ..." ... [next paragraph] "**Net effect:** the context-propagation half of this decision is live and wired into the solution executor; the cross-validation half is dead code, ..."
correction: The first segment ("Part 2, the cross-validation layer, was built as a standalone module but") is faithful, but the bracketed insertion "[wired into the solution executor]" splices together two non-adjacent fragments from different paragraphs ("no capability executor under ..." and "the cross-validation half is dead code") as if they were one continuous sentence; in the source these are separated by an intervening sentence about `northdata.ts` and a paragraph break, with "wired into the solution executor" itself belonging to a different, later sentence ("Net effect: ... is live and wired into the solution executor").

record: DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md
line: 67
class: MISATTRIBUTED
record_text: "library-as-product,"
source named: docs/strategy/2026-08-05-direction-plan.md, "Part One"
source_text: "## 3. Part One — The library, built properly" (direction-plan.md never uses the phrase "library-as-product")
correction: "library-as-product" is CLAUDE.md's own shorthand label for the Direction Plan's Part One ("The 2026-08-05 Direction Plan Part One (library-as-product, x402 primary rail)..." in the DEC-20260812-A bullet), not a phrase used by the direction-plan.md document itself.

record: DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md
line: 68
class: MISATTRIBUTED
record_text: "supersedes... the Counterparty Assurance rename/ICP,"
source named: `DEC-20260812-A` (existing record)
source_text: docs/decisions/records/DEC-20260812-A.md's actual text is "Retire Counterparty Assurance as Strale's primary framing; compliance work becomes a separate track that requires customer evidence." It never uses the words "supersedes" or "rename/ICP."
correction: The quoted text ("Supersedes DEC-20260502-A (Counterparty Assurance rename/ICP) ... the Counterparty Assurance framing is retired as primary product") is CLAUDE.md's DEC-20260812-A bullet, not the formal decision record file docs/decisions/records/DEC-20260812-A.md, which paraphrases the same substance in different words.

record: DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md
line: 57
class: MISQUOTE
record_text: "direct connections only. No scraping. Full ToS compliance with every provider"
source: Notion row DEC-20260420-I (page 34867c87082c81c8b9d4c6b5568bbcef), Rationale field
source_text: "Strale's doctrine under DEC-20260420-H states "direct data connections only. No scraping. Full ToS compliance with every provider.""
correction: The doctrine text says "direct data connections only," not "direct connections only" — the record drops the word "data." (Notably, the sibling record DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md quotes the same source correctly with "data" included.)

record: DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md
line: 82
class: MISATTRIBUTED
record_text: "docs/strategy/2026-08-05-direction-plan.md states Part One ("library-as-product")"
source named: docs/strategy/2026-08-05-direction-plan.md
source_text: "## 3. Part One — The library, built properly" (the phrase "library-as-product" does not appear anywhere in this file)
correction: "library-as-product" is CLAUDE.md's shorthand for the Direction Plan's Part One, not a phrase the direction-plan.md document itself uses.

record: DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md
line: 83
class: MISATTRIBUTED
record_text: "which states it "supersedes... DEC-20260502-A (Counterparty Assurance rename/ICP)... the Counterparty Assurance framing is retired as primary product.""
source named: `DEC-20260812-A` (existing record)
source_text: docs/decisions/records/DEC-20260812-A.md says "Retire Counterparty Assurance as Strale's primary framing; compliance work becomes a separate track that requires customer evidence." — no "supersedes" or "rename/ICP" wording.
correction: This exact wording is CLAUDE.md's DEC-20260812-A bullet ("Supersedes DEC-20260502-A (Counterparty Assurance rename/ICP) ... the Counterparty Assurance framing is retired as primary product"), not the formal decision record file this sentence names.

record: DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md
line: 70
class: MISQUOTE
record_text: "the SA.2 + F-A series"
source: Notion row DEC-20260420-H (page 34867c87082c81c6a58dfbc5f46ed3f6), Rationale field
source_text: "Prior DECs: DEC-20260420-A through DEC-20260420-G (complete SA.2 + F-A series)."
correction: The row's own References text calls it the "complete SA.2 + F-A series," not "the SA.2 + F-A series" as "the row's own subject"; the exact three-word phrase quoted does not occur in the row.

### Coverage

DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md | spans: 5 | findings: 1
DEC-20260225-P-c5d6--notion-31267c87082c818e9d46cd25ac0236a8.md | spans: 5 | findings: 0
DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md | spans: 6 | findings: 0
DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md | spans: 9 | findings: 0
DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md | spans: 13 | findings: 1
DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md | spans: 6 | findings: 0
DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md | spans: 5 | findings: 0
DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md | spans: 10 | findings: 0
DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md | spans: 6 | findings: 2
DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md | spans: 6 | findings: 1
DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md | spans: 1 | findings: 0
DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md | spans: 4 | findings: 0
DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md | spans: 4 | findings: 0
DEC-20260320-J--notion-32967c87082c8192b920f8d8cfb40aa7.md | spans: 1 | findings: 0
DEC-20260320-K--notion-32967c87082c818e8cbbc29a3a0c1bed.md | spans: 4 | findings: 0
DEC-20260320-K--notion-32967c87082c81e890bfe564a3c2e917.md | spans: 3 | findings: 0
DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md | spans: 3 | findings: 0
DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md | spans: 4 | findings: 0
DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md | spans: 3 | findings: 0
DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md | spans: 10 | findings: 0
DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md | spans: 6 | findings: 0
DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md | spans: 5 | findings: 0
DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md | spans: 8 | findings: 0
DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md | spans: 13 | findings: 1
DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md | spans: 7 | findings: 1
DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md | spans: 8 | findings: 0
DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md | spans: 11 | findings: 0
DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086.md | spans: 8 | findings: 2
DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md | spans: 14 | findings: 0
DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35.md | spans: 5 | findings: 0
DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md | spans: 14 | findings: 0
DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1.md | spans: 4 | findings: 1
DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md | spans: 7 | findings: 3
DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md | spans: 26 | findings: 1

SWEEP COMPLETE

### Sweep P6

# Named-source quotation sweep — partition P6

Partition: P6. Commit: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`. Record count: 40 files listed, 8 `DEC-20260905-*` files skipped per instructions (amending records already verified by their own reviews), 32 records swept.

The script (`extract_quotes.py`) walks each record file with fenced code blocks blanked out, finds every `"..."` span (handling spans that wrap lines), normalizes it (lowercase, strip everything but letters/digits, transliterate the listed symbols), and reports every span whose normalized form is 12 or more characters, in file order with its starting line number. Front-matter `title:` fields are YAML metadata, not body prose, so double-quoted text inside them is excluded from the ledger; every other span was read against its named source by hand (Notion row dump, sibling record, CLAUDE.md, or a repository file) and classified with a normalized substring check, never by eye alone.

### Ledger

DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md:42 | 'processes PII' means the capability's inherent be | row Rationale (34867c87082c8172a41ac4c9d52904de) | FAITHFUL
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md:46 | the user is the data controller | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md:53 | DEC-20260420-H established direct-SQL as the right | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md:59 | Option C for 238-slug manifest drift... SA.2b.c wi | DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6 title | FAITHFUL
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md:69 | Prior DECs: DEC-20260420-D (SA.2b PII classificati | row Rationale (own References) | FAITHFUL
DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md:77 | direct connections only | record's own label for the sibling collision row's topic | NOT_A_QUOTATION
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:28 | Strale's doctrine under DEC-20260420-H states 'dir | row Rationale (34867c87082c81c8b9d4c6b5568bbcef) | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:31 | not viable for Q2 2026 shipping. | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:39 | 7-12 countries with a clean compliance story, not  | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:46 | tighter compliance, not softer | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:47 | conflates a CC-BY government dataset with a ToS-vi | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:48 | machine-checkable at capability onboarding | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:53 | 26-50,000 euros per violation | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:56 | Relationship to DEC-H and other DECs | row Rationale (own section heading) | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:56 | DEC-H remains active. DEC-I is a structural amendm | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:58 | full ToS compliance with every provider. | row Rationale (parenthetical) | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:65 | Strale positioning and ICP clarification | DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:69 | direct connections only. No scraping. Full ToS com | row Rationale (34867c87082c81c8b9d4c6b5568bbcef) | MISQUOTE
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:76 | DEC-H remains active | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:76 | amends DEC-20260420-H | row Decision field | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:82 | DEC-E (Payee Assurance v1 scope) is not directly a | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:85 | Payee Assurance v1 scope | row Rationale (own DEC-E label) | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:85 | F-A-005 free-tier transaction lookup redaction | DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228 title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:86 | Product architecture and first wedge, | DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086 title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:88 | Payee Assurance v1 scope | row Rationale (own DEC-E label, dup) | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:89 | F-A-006 + F-A-007 HMAC audit token lifecycle | DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:90 | Capability rationalization and site rebuild, | DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35 title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:92 | capability rationalization | DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35 title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:115 | Strale uses direct government APIs and licensed co | row Rationale | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:130 | capabilities declaring govt-portal-scraping or com | row Rationale (Implementation requirements) | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:140 | Adopt a three-tier doctrine for third-party scrapi | DEC-20260428-A title | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:141 | Strale does not operate scraper infrastructure | DEC-20260428-A body | FAITHFUL
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md:148 | constrained per-call parsing | DEC-20260813-A title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:43 | Strale's compliance infrastructure has no outstand | row Rationale (34867c87082c81478c15cb6985d10137) | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:49 | some orphans may be revived in Session B; silent m | row Rationale | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:52 | F-A-001: shipped (DEC-20260420-C)... F-A-003: ship | row Rationale (Closes Session A findings) | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:63 | F-A-005 free-tier transaction lookup redaction...  | DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228 title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:65 | F-A-006 + F-A-007 HMAC audit token lifecycle...	 | DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:68 | Product architecture and first wedge | DEC-20260420-E--notion-34867c87082c81d5a898f48cc1554086 title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:69 | Capability rationalization and site rebuild | DEC-20260420-F--notion-34867c87082c810b8df1e8e459039d35 title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:71 | F-A-012 verify endpoint DoS hardening... | DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:72 | Entity resolution | DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1 title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:75 | DEC-20260420-D OQ #6 (heuristic retention): closed | row Rationale | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:78 | Manifest/DB drift cleanup (238 slugs Class 4): def | row Rationale | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:81 | Option C for 238-slug manifest drift... defer full | DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6 title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:83 | Strale positioning and ICP clarification | DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f title | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:86 | Prior Session A DECs: DEC-20260420-A through DEC-2 | row Rationale (own References) | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:97 | belt-and- suspenders | row Rationale (NOT NULL migration section) | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:99 | F-A-003 (input-PII missed by heuristic): closed. H | row Rationale | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:101 | Exact same anti-pattern as F-A-003 | DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4 Rationale | FAITHFUL
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md:157 | formally complete, | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:34 | manifest-canonical | row Rationale (34867c87082c8198b6ecf3569a68a9b4) | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:52 | resolves trivially | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:52 | from DEC-20260420-H. | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:54 | Option C for 238-slug manifest drift | DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6 title | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:56 | Strale positioning and ICP clarification | DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f title | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:59 | DEC-20260420-D: SA.2b PII classification framework | row Rationale (own References) | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:65 | SA.2b.d closes Session A... | DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137 title | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:70 | Standard Unix pattern (rm -rf, rsync --delete). | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:71 | `--skip-gates=<reason>`... goes into the onboardin | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:95 | formalizes what's already happening in production | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:97 | decorative authoring hints | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:98 | Mathematical fact, not product decision | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:99 | Visible in command history, shell logs, CI traces | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:100 | silent bypass with no telemetry | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:100 | Exact same anti-pattern as F-A-003 which was delet | row Rationale (self) | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:109 | authority decisions (hybrid: fill-null-only; manif | apps/api/scripts/onboard.ts (code comment, line 1127) | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:111 | Cluster 2 Phase 4a | apps/api/scripts/onboard.ts (code comment, line 135) | FAITHFUL
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md:127 | solution count crosses ~150, OR a third-party cont | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:26 | v1 ships with bank verification, or v1 does not sh | row Rationale (34867c87082c81e3a62bf051cc0575c4) | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:30 | v1 ship date slips until one does | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:35 | logged earlier 2026-04-20, same session | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:36 | Petter confirmed the v1 vision of Payee Assurance  | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:37 | Supersedes DEC-20260420-J. | row Decision field | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:41 | Original decision (defer bank verification to v1.1 | superseded sibling row (34867c87082c81dc803bc3709bd5fdd6) Decision field | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:47 | SA.2b.d closes Session A... | DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137 title | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:51 | IBAN validation | superseded sibling row (34867c87082c81dc803bc3709bd5fdd6) Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:54 | If no vendor responds within 2 weeks... If no vend | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:57 | reversible: if a vendor response lands within time | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:63 | The source partially superseded vendor-selection c | DEC-20260430-A Context section | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:69 | Vendor-selection content | DEC-20260430-A Context section (self, dup) | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:86 | produces a weaker first impression and creates an  | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:87 | produces a slower launch but a real one, | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:88 | a pre-revenue solo-founder startup, this is the ri | row Rationale | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:97 | IBAN/name match — all rejected per DEC-20260430-A | apps/api/src/lib/platform-facts.ts (code comment, line 137) | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:110 | Retire Counterparty Assurance as Strale's primary  | DEC-20260812-A Decision | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:113 | the Counterparty Assurance framing... as primary p | CLAUDE.md (Active Decisions, DEC-20260812-A summary) | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:114 | a separate track gated on customer discovery | CLAUDE.md (same passage) | FAITHFUL
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md:125 | if a vendor response lands within timeline, v1 shi | row Rationale (self, dup) | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:36 | different risk profiles | row Rationale (34867c87082c81babd35eba5856ded79) | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:38 | independently valuable if C2 slipped | row Rationale | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:39 | deserved its own audit because camelCase/snake_cas | row Rationale | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:41 | (DEC-20260420-M) | row Rationale | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:42 | not a commit count | row Rationale | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:76 | Cluster 2 Design: Unified Onboarding Engine | archive/sessions/audit-reports/cluster_2_design.md (title) | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:80 | if nothing, say the plan is not tracked | this sweep's own batch instructions (meta-commentary about method, no source in the candidate set) | NOT_A_QUOTATION
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:89 | OUTSIDE the transaction. Design doc §4.3 | apps/api/src/lib/capability-persistence.ts (line 303) | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:96 | C1 shipped at 8f6eff9 (255 tests passing, +8 from  | row Outcome | FAITHFUL
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md:99 | Both commits shipped same day and pushed | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:28 | ideally the only input needed would be Spotify AB. | row Rationale (34967c87082c813c825cc3e4dca30a98) | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:30 | ~70-80% of real inputs | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:33 | from 'priority' to 'v1 launch blocker'. | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:37 | This extends DEC-20260420-G, which established ent | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:40 | F-A-012 verify endpoint DoS hardening | DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef title | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:41 | Entity resolution as priority engineering investme | DEC-20260420-G--notion-34867c87082c81dcafe3dea59cc119b1 title | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:47 | name, country, any identifiers | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:48 | company name required; identifiers optional; juris | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:49 | six deterministic presets (Spotify AB default, cro | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:50 | a disambiguation response pattern for custom input | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:52 | now depends on three parallel tracks: website rebu | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:70 | leads the product input shape | row Rationale | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:80 | entity resolution engine | row Decision field | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:86 | company name only | row Decision field | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:93 | Retire Counterparty Assurance as Strale's primary  | DEC-20260812-A Decision | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:96 | library-as-product | DEC-20260812-A body (Reversal conditions) | FAITHFUL
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md:97 | the Counterparty Assurance framing... as primary p | CLAUDE.md (DEC-20260812-A summary) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:32 | 30s+ external calls, | row Rationale (34867c87082c81dab702f98b2034aa5d) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:43 | C1 (8f6eff9) placed the onCapabilityCreated hook i | row Rationale | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:46 | Cluster 2 Phase 3 split into C1 and C2 | DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79 title | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:46 | C1 shipped at 8f6eff9, | DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79 Outcome | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:50 | the Manifest→DB-row normalizer (apps/api/src/lib/c | row Rationale | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:53 | its one update(capabilities) call is inside the ho | row Rationale | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:56 | Event-ordering invariant (tx-end precedes hook-cal | row Rationale | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:56 | locked in by explicit test assertion, | row Rationale | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:58 | still calls hook directly — out of Cluster 2 scope | row Rationale | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:87 | OUTSIDE the transaction. Design doc §4.3 — `onCapa | apps/api/src/lib/capability-persistence.ts (line 303) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:89 | Post-commit: call `onCapabilityCreated(slug)` in t | apps/api/src/lib/capability-persistence.ts (line 312) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:92 | `capability-persistence.ts` has, since the DEC-202 | apps/api/src/jobs/onboarding-retry.ts (header comment) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:95 | Phase 6 retry scheduler | apps/api/src/jobs/onboarding-retry.ts (header comment) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:96 | was never built | apps/api/src/jobs/onboarding-retry.ts (header comment) | FAITHFUL
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md:110 | Shipped in commit a070ba0 (+668/-214 across 6 file | row Outcome | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:28 | Strale delivers decision-ready outcomes for agents | row Rationale (34967c87082c81828e3fe183dd5e8072) | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:30 | External copy leads with Payee Assurance (the prod | row Rationale | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:32 | Counterparty verification for AI agents, in one ca | row Decision field | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:33 | Payee Assurance returns identity, sanctions, owner | row Rationale | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:40 | Brand & Voice Section 7.1 (locked under DEC-202604 | row Rationale | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:45 | Strale positioning and ICP clarification, | DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f title | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:52 | Supersedes DEC-20260420-H's Section 7.1 primary-he | row Rationale | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:76 | future-proofs | row Rationale | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:96 | live today, verbatim, | DEC-20260314-G Consequences (line 60) | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:97 | Counterparty verification for AI agents, in one ca | row Decision field (self, dup) | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:102 | Retire Counterparty Assurance as Strale's primary  | DEC-20260812-A Decision | FAITHFUL
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md:105 | the Counterparty Assurance framing... as primary p | CLAUDE.md (DEC-20260812-A summary) | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:39 | Cluster 2 Phase 3 originally gated on a 7-day traf | row Rationale (34867c87082c81a6bb52ca8dbd61dc25) | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:42 | Cluster 2 Phase 3 split into C1 and C2 | DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79 title | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:44 | Strale has virtually zero onboarding traffic... 7  | row Rationale | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:47 | when traffic is thin or absent, replace time-based | row Rationale | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:51 | real-path upsert on lei-lookup pass (with authorit | row Outcome | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:59 | Phase 4 split into 4a and 4b | DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf title | MISQUOTE
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:90 | kept in repo as a reusable pattern for future fail | row Outcome | FAITHFUL
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:105 | Validation ran same-day (2026-04-20). Commit 2f8b1 | row Outcome | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:28 | No scraping. Every underlying call runs against a  | row Rationale (34967c87082c81bd8c6bf8e92e901711, quoting the landing-page copy) | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:35 | a P0 sweep for the complete 9-country resolution. | row Rationale | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:40 | consistent with Brand & Voice 4.1 (data-source-typ | row Rationale | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:42 | Data-source-type doctrine | DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef title/topic | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:45 | Adopt split-by-data-source-type as the operable fo | DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef title | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:50 | some specific countries (PL, DK, BR migrations) | row Rationale | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:70 | weakens differentiation | row Rationale | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:71 | the x402 MCP wrapper crowd, | row Rationale | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:80 | migrated to a direct API or a licensed aggregator | row Decision/Rationale (34967c87082c81bd8c6bf8e92e901711) | MISQUOTE
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:91 | Adopt a three-tier doctrine for third-party scrapi | DEC-20260428-A title | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:92 | Affirm constrained per-call parsing as the scrapin | DEC-20260813-A title | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:95 | must be migrated | row Decision field | FAITHFUL
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md:96 | per-call parsing | DEC-20260813-A body | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:31 | manifest `price_cents=10` overwriting admin-tuned  | row Rationale (34867c87082c81a2a12cc95010bf25bf) | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:34 | 242+ slugs currently missing required manifest fie | row Rationale | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:40 | have different risk profiles and different prerequ | row Rationale | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:41 | the active footgun immediately | row Rationale | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:43 | would block backfill on most of the catalog. | row Rationale | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:44 | Same reasoning pattern as C1/C2 split from Phase 3 | row Rationale | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:46 | Cluster 2 Phase 3 split into C1 and C2 | DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79 title | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:48 | Design doc (DEC-20260420-M) describes Phase 4 as a | row Rationale | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:53 | 4a shipped same-day as commit `085c902` (300 tests | row Outcome | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:82 | Cluster 2 Phase 4a | apps/api/scripts/onboard.ts (code comment, line 135) | FAITHFUL
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:87 | strip DB-canonical fields from backfill payloads | row Rationale (34867c87082c81a2a12cc95010bf25bf) | MISQUOTE
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md:100 | 4a shipped same-day as commit 085c902 (300 tests p | row Outcome | FAITHFUL
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md:31 | 7-10 days of focused frontend work (Framer Motion  | row Rationale (34967c87082c810695c2e365deb8f2c8) | FAITHFUL
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md:36 | all nine reference sites the user liked (Stripe, M | row Rationale | FAITHFUL
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md:40 | must stay in sync with sandbox presets and product | row Rationale | FAITHFUL
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md:41 | a three-surface schema contract (landing animation | row Rationale | FAITHFUL
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md:71 | {/* 2. Solutions showcase (with discovery demo fol | strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx (line 215) | FAITHFUL
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md:85 | Supporting P0 to-do created to track build. | row Rationale | FAITHFUL

DEC-20260422-A--git-3b256587.md: no ledger lines (both double-quoted spans in the body, "looks fine." and "Shame on you", normalize below the 12-character threshold)
DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md: no ledger lines (no double-quoted spans in the body)

DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md:33 | The 2026-05-04 outreach to contatti@infocamere.it  | row Rationale (35767c87082c81059f67e756f5c5eefa) | FAITHFUL
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md:38 | (1) pre-revenue financials vs InfoCamere's stated  | row Rationale | FAITHFUL
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md:38 | sub-license through an existing Distributore Uffic | row Rationale | FAITHFUL
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md:49 | Final EU30 country to reach code parity — Phase 2c | apps/api/src/capabilities/auto-register.ts (code comment, line 259) | FAITHFUL
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md:49 | InfoCamere integration per DEC-20260507-C. | apps/api/src/capabilities/auto-register.ts (code comment, line 262) | FAITHFUL
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md:37 | The earlier 'hold v1 at 6 target countries' framin | row Rationale (35767c87082c81d3897fe47a2ec7a4c1) | FAITHFUL
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md:38 | 17 already-live countries (SE, NO, DK, FI, FR, UK, | row Rationale | FAITHFUL
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md:42 | Validating that integrations work via early build  | row Rationale | FAITHFUL
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md:46 | Engineering kickoff on ES BORME and DE bundesAPI s | row Outcome | FAITHFUL
DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md:33 | HMRC's Software Developer Checklist (received 2026 | row Rationale (35767c87082c813481a8efa27ea37438) | FAITHFUL
DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md:37 | (1) silent submission followed by revocation is st | row Rationale | FAITHFUL
DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md:37 | Email sent 2026-05-05 with completed checklist (.d | row Rationale | FAITHFUL
DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md:30 | Topograph commercial call 2026-05-04 disclosed €1, | row Rationale (35767c87082c81e2ba50d630d0b95f9d) | FAITHFUL
DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md:34 | Tier 1 (Strale-built) civic-tech OSS paths exist f | row Rationale | FAITHFUL
DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md:38 | Topograph remains viable only under: platform fee  | row Outcome | FAITHFUL
DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9.md:32 | 2026-04-30 gap-8 audit misclassified SK by probing | row Rationale (35967c87082c81a9abc3da329b92a0f9) | FAITHFUL
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md:33 | Drift-check scripts derive their reference lists f | row Rationale (35967c87082c81b0ad02d69148811b57) | FAITHFUL
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md:37 | New invariant in platform-facts.test.ts: every nam | row Rationale | FAITHFUL
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md:45 | Reference lists derive from `apps/api/src/lib/plat | apps/api/scripts/check-platform-facts-drift.ts (header comment, line 29) | FAITHFUL
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md:46 | update **only** the canonical source and let consu | CLAUDE.md (Drift-prevention surfaces) | FAITHFUL
DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md:32 | CC has full gh CLI auth (it opens the PRs) so it c | row Rationale (35967c87082c81ec9db7cba5b6fecb76) | FAITHFUL
DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md:42 | **Shipping is never Petter's decision** — the sess | CLAUDE.md (DEC-20260822-A) | FAITHFUL
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md:37 | Mid-rebuild verification spike (CC, 2026-05-07) fo | row Rationale (35967c87082c817cad56ec58c707d895) | FAITHFUL
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md:54 | Direct Registo Comercial / publicacoes.mj.pt integ | apps/api/src/capabilities/auto-register.ts (code comment, line 173) | FAITHFUL
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md:54 | quality upgrade per DEC-20260507-C. | apps/api/src/capabilities/auto-register.ts (code comment, line 174) | FAITHFUL
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md:55 | InfoCamere integration per DEC-20260507-C. | apps/api/src/capabilities/auto-register.ts (code comment, line 262) | FAITHFUL
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md:63 | MUST stay 'false' in production until the resale a | config/env-manifest.yaml (OPENAPI_ENABLED purpose, line 778) | FAITHFUL
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md:63 | Gated off (OPENAPI_ENABLED=false) in production un | config/env-manifest.yaml (OPENAPI_COM_EMAIL cost_note, line 776) | FAITHFUL
DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md:32 | Closes the 2026-05-06 incident root cause (no bran | row Rationale (35967c87082c81f187e7f1881a6d74c4) | FAITHFUL
DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md:46 | `main` changes only through reviewed PRs merged on | CLAUDE.md (Session contract) | FAITHFUL
DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md:47 | pre-push refuses a direct push to `main`, | CLAUDE.md (Session contract, git hooks) | FAITHFUL
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md:35 | Strale's positioning is 'each fact returned with p | row Rationale (35a67c87082c8119a22bf1414e307e5f) | FAITHFUL
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md:39 | Resolves a doctrinal ambiguity that would otherwis | row Rationale | FAITHFUL
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md:44 | attribution string in provenance; consumers republ | manifests/austrian-company-data.yaml (limitations, line 369) | FAITHFUL
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md:47 | For vendor-mediated data, capability provenance in | DEC-20260428-A body (line 35) | FAITHFUL
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md:35 | Three concurrent CC sessions on 2026-05-07 produce | row Rationale (35a67c87082c814bbb8df7036fccf8e1) | FAITHFUL
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md:40 | trunk @ 9625aca, strale-work detached @ 9625aca, s | row Rationale | FAITHFUL
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md:41 | 22 .claude/worktrees/* orphans (separate cleanup p | row Rationale | FAITHFUL
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md:51 | the trunk stays on `main` and clean | CLAUDE.md (Session contract) | FAITHFUL
DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md:36 | With DEC-20260508-B locking detached HEAD as the c | row Rationale (35a67c87082c8170a19af278e67abd46) | FAITHFUL
DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md:39 | Closes the structural-enforcement gap from the 202 | row Rationale (self, ellipsis-joined) | FAITHFUL
DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md:54 | check `git status` | CLAUDE.md (Shared-Checkout Rule item 3) | FAITHFUL
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md:33 | Supersedes DEC-20260507-B for the eligibility ques | row Decision field (35a67c87082c817eb9b5d491786dc67b) | FAITHFUL
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md:35 | Conditional on Strale (Swedish AB) eligibility for | superseded DEC-20260507-B sibling row (35967c87082c81f38091f6afba337a8a) Rationale | FAITHFUL
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md:40 | KVK official response (Mirjam Boele, Deskaccountma | row Rationale | FAITHFUL
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md:44 | Fallbacks (BRIS, Open Data Sets, manual channel) d | row Rationale | FAITHFUL
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md:25 | Files I will modify | row title (35a67c87082c81dd8477cdb92d1403f2) | FAITHFUL
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md:32 | Worktree consolidation (DEC-20260508-B) created th | row Rationale | FAITHFUL
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md:36 | Mode-2 (planned-but-not-yet-touched overlap) and m | row Rationale | FAITHFUL
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md:41 | audit-first template, | row title (self-referential label) | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md:36 | This decision does not change KVK direct-API statu | row Rationale (35e67c87082c8122a29ef35f256d5958) | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md:42 | Mirjam Boele (KVK Deskaccountmanager Dataverstrekk | row Rationale | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md:46 | The Option B parallel investigation is closed; onl | row Rationale | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md:37 | The 2026-05-11 DE/DK/SK investigation found 95% (5 | row Rationale (35e67c87082c8188a014f4b1f963cf77) | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md:41 | Phase A0b (PR #95, merged 2026-05-12 as 4c3573d) s | row Rationale | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md:46 | Phase B complete 2026-05-12 via PRs #98-102. 287 c | row Outcome | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md:51 | Block 0069: reconcile scheduled_testing_eligible f | apps/api/src/lib/startup-migrations.ts (code comment, line 811) | FAITHFUL
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md:52 | rewrites the flag on every boot: `SET scheduled_te | CLAUDE.md (Capabilities & Quality) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:33 | PR #109's runtime sentinel began emitting guarante | row Rationale (35f67c87082c81269b79cb7d0367dc46) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:37 | Semantic claim: manifest-drift is maintainer signa | row Rationale | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:38 | if a customer-critical field is declared guarantee | row Rationale | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:42 | Shipped via PR #112 (commit 03ffac6, 2026-05-13T13 | row Outcome | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:44 | PR #109 sentinel: declared-guaranteed field absent | apps/api/src/lib/trust-helpers.ts (line 367) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:45 | guaranteed_field_missing: | apps/api/src/lib/trust-helpers.ts (line 386) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:46 | manifest_drift | apps/api/src/lib/trust-helpers.ts (line 386) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md:48 | DEC-20260513-B + DEC-20260513-C | apps/api/src/lib/trust-helpers.ts (code comment, line 375) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md:38 | DK and DE — quota-blocked at audit-time per DEC-20 | row Rationale (35f67c87082c81c09fbfc2253cf4e24c) | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md:41 | Per the v1 Identity coverage audit completed 2026- | row Rationale | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md:45 | Verdict-documentation DEC; not always-enforce; sup | row Rationale | FAITHFUL
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md:55 | supersedes nothing | row Rationale (self, dup) | FAITHFUL

### Findings

record: DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md
line: 69
class: MISQUOTE
record_text: "direct connections only. No scraping. Full ToS compliance with every provider"
source: Notion row 34867c87082c81c8b9d4c6b5568bbcef (this record's own subject), Rationale field — the same field this record correctly quotes at its own line 28
source_text: "Strale's doctrine under DEC-20260420-H states 'direct data connections only. No scraping. Full ToS compliance with every provider.'"
correction: The row's own quoted doctrine text is "direct DATA connections only" (as the record itself correctly quotes 41 lines earlier); this second quotation of the identical passage drops the word "data".

record: DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md
line: 59
class: MISQUOTE
record_text: "Phase 4 split into 4a and 4b"
source: DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md, title field
source_text: "DEC-20260421-D — Phase 4 split into 4a (authority enforcement) and 4b (manifest completeness + bulk regen)"
correction: The sibling record's actual title carries parenthetical labels for each half ("authority enforcement" for 4a, "manifest completeness + bulk regen" for 4b) that this quotation drops, turning a specific title into a shorter phrase that is not a literal substring of it.

record: DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md
line: 80
class: MISQUOTE
record_text: "migrated to a direct API or a licensed aggregator"
source: Notion row 34967c87082c81bd8c6bf8e92e901711 (this record's own subject) — Decision field: "must be migrated to direct APIs or licensed aggregator contracts before launch"; Rationale field: "Every scraping country must migrate to a direct government-registry API or a licensed commercial aggregator before v1 launch."
source_text: "must migrate to a direct government-registry API or a licensed commercial aggregator before v1 launch"
correction: Both of the row's own fields specify "government-registry API" and "commercial aggregator" (or, in the Decision field, "direct APIs ... aggregator contracts"); this quotation's shorter "a direct API or a licensed aggregator" is not a literal substring of either field — it drops "government-registry" and "commercial" and alters "APIs...contracts" to "API...aggregator".

record: DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md
line: 87
class: MISQUOTE
record_text: "strip DB-canonical fields from backfill payloads"
source: Notion row 34867c87082c81a2a12cc95010bf25bf (this record's own subject), Rationale field
source_text: "it strips DB-canonical fields from backfill payloads"
correction: The row's verb is "strips" (third person, matching "it strips"); this quotation changes it to "strip", a one-letter word change from the source.

### Coverage

DEC-20260420-I--notion-34867c87082c8172a41ac4c9d52904de.md | spans: 6 | findings: 0
DEC-20260420-I--notion-34867c87082c81c8b9d4c6b5568bbcef.md | spans: 27 | findings: 1
DEC-20260420-J--notion-34867c87082c81478c15cb6985d10137.md | spans: 18 | findings: 0
DEC-20260420-K--notion-34867c87082c8198b6ecf3569a68a9b4.md | spans: 18 | findings: 0
DEC-20260420-K--notion-34867c87082c81e3a62bf051cc0575c4.md | spans: 20 | findings: 0
DEC-20260421-A--notion-34867c87082c81babd35eba5856ded79.md | spans: 10 | findings: 0
DEC-20260421-A--notion-34967c87082c813c825cc3e4dca30a98.md | spans: 17 | findings: 0
DEC-20260421-B--notion-34867c87082c81dab702f98b2034aa5d.md | spans: 15 | findings: 0
DEC-20260421-B--notion-34967c87082c81828e3fe183dd5e8072.md | spans: 12 | findings: 0
DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md | spans: 8 | findings: 1
DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711.md | spans: 13 | findings: 1
DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf.md | spans: 12 | findings: 1
DEC-20260421-D--notion-34967c87082c810695c2e365deb8f2c8.md | spans: 6 | findings: 0
DEC-20260422-A--git-3b256587.md | spans: 0 | findings: 0
DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md | spans: 0 | findings: 0
DEC-20260505-D--notion-35767c87082c81059f67e756f5c5eefa.md | spans: 5 | findings: 0
DEC-20260505-D--notion-35767c87082c81d3897fe47a2ec7a4c1.md | spans: 4 | findings: 0
DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438.md | spans: 3 | findings: 0
DEC-20260505-E--notion-35767c87082c81e2ba50d630d0b95f9d.md | spans: 3 | findings: 0
DEC-20260507-A--notion-35967c87082c81a9abc3da329b92a0f9.md | spans: 1 | findings: 0
DEC-20260507-A--notion-35967c87082c81b0ad02d69148811b57.md | spans: 4 | findings: 0
DEC-20260507-B--notion-35967c87082c81ec9db7cba5b6fecb76.md | spans: 2 | findings: 0
DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895.md | spans: 6 | findings: 0
DEC-20260507-C--notion-35967c87082c81f187e7f1881a6d74c4.md | spans: 3 | findings: 0
DEC-20260508-B--notion-35a67c87082c8119a22bf1414e307e5f.md | spans: 4 | findings: 0
DEC-20260508-B--notion-35a67c87082c814bbb8df7036fccf8e1.md | spans: 4 | findings: 0
DEC-20260508-C--notion-35a67c87082c8170a19af278e67abd46.md | spans: 3 | findings: 0
DEC-20260508-C--notion-35a67c87082c817eb9b5d491786dc67b.md | spans: 4 | findings: 0
DEC-20260508-C--notion-35a67c87082c81dd8477cdb92d1403f2.md | spans: 4 | findings: 0
DEC-20260512-A--notion-35e67c87082c8122a29ef35f256d5958.md | spans: 3 | findings: 0
DEC-20260512-A--notion-35e67c87082c8188a014f4b1f963cf77.md | spans: 5 | findings: 0
DEC-20260513-F--notion-35f67c87082c81269b79cb7d0367dc46.md | spans: 9 | findings: 0
DEC-20260513-F--notion-35f67c87082c81c09fbfc2253cf4e24c.md | spans: 4 | findings: 0

SWEEP COMPLETE

## Partition reports

### P1

# Closing review round 9, partition P1

Commit: fcfceb59f68228c0e9910581a67e67b1810ee1fa
Partition: P1 (the founding and February to early-March records)
Record count: 41

Files reviewed (41): DEC-20260224-P-a1b2, DEC-20260224-P-c3d4, DEC-20260224-P-e5f6,
DEC-20260224-P-g7h8, DEC-20260225-P-a3b4, DEC-20260225-P-e7f8, DEC-20260225-P-g9h0,
DEC-20260225-P-i1j2, DEC-20260225-P-k3l4, DEC-20260225-P-m1n2, DEC-20260225-P-m5n6,
DEC-20260225-P-o7p8, DEC-20260225-P-q3r4, DEC-20260225-P-s5t6, DEC-20260225-P-u7v8,
DEC-20260225-P-w9x0, DEC-20260225-P-y1z2, DEC-20260226-P-q1r2, DEC-20260226-P-s3t4,
DEC-20260226-P-u5v6, DEC-20260226-P-w7x8, DEC-20260227-P-a1b2, DEC-20260227-P-i9j0,
DEC-20260227-P-m3n4, DEC-20260227-P-o5p6, DEC-20260227-P-q7r8, DEC-20260227-P-s9t0,
DEC-20260227-P-u1v2, DEC-20260302-A-0001, DEC-20260302-C, DEC-20260302-D,
DEC-20260303-C, DEC-20260305-E, DEC-20260305-F, DEC-20260305-G, DEC-20260306-D,
DEC-20260306-G, DEC-20260306-H, DEC-20260308-1, DEC-20260309-G, DEC-20260309-H.

### Setup

Detached worktree at the pinned commit (`C:/tmp/strale-closing9-P1`), `npm ci`
run there, removed at the end via `git worktree remove --force` after
confirming with PowerShell `Get-ChildItem -Recurse -Force -Attributes
ReparsePoint` that every reparse point under the worktree (the six
`node_modules` junctions npm creates for workspace packages) targets a path
inside the worktree itself, so the removal discarded nothing external.

All 41 rows' Notion pages were dumped in one call: `python dump_rows.py
<out.json> PAGE:<id> PAGE:<id> ...` using the page id from each record's
`evidence[0]` Notion URL; `dump_rows.py`'s own console summary confirmed 41
of 41 selected and printed each row's null-field list, which I cross-checked
against every record's "both null in the source" Reversal-conditions claim
(see below).

### Script used

`node scripts/m2-quote-fidelity.mjs` extracts every double-quoted span of at
least `--min-chars` normalized characters from each record's body, normalizes
both the span and every candidate source (transliterate the stated symbols,
lowercase, strip all non-alphanumerics), and reports a span faithful when its
normalized text (or, for an ellipsis-split span, each segment in order) is a
substring of some candidate source (the row's own Notion fields, every other
record's full text, CLAUDE.md/AGENTS.md, an evidence-listed repo file, a
backticked repo path in the same paragraph, or a frontend file via
`--frontend`); otherwise it reports the best fuzzy prefix match found, as a
residual for manual judgement.

**Important operational finding, not a defect in the candidate set:** the
script's `--export` flag expects the *raw* Notion export text (the
`"text": "<escaped JSON>"`-wrapped format the orchestrator's own
`dump_rows.py` parses), not a pre-parsed row array. My first run passed the
row array `dump_rows.py` had already extracted for my 41 pages, which
`parseNotionExport` silently reads as zero rows, so every quotation
attributed to "the row's own" fields fell through to the record/CLAUDE.md
source set and produced 81 residuals across the partition, none of them real
defects; the parsed-array file is useless as `--export` input. I reran with
`--export <the raw decisions-export-raw.txt path>` (present in the
scratchpad from the orchestrator's own earlier export) plus `--frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12`, one `--only` per
file in my list. That run: **41 records, 230 spans, 227 faithful, 3
residual.**

#### Residual-mismatch list (from the corrected run) and my classification

1. `DEC-20260225-P-m1n2.md:90` — `"strale-mcp vs x402"`, best match
   `paragraph-path:server.json` (prefix 10). **Checker miss, not a defect.**
   The record attributes this phrase to "this batch's brief"
   (`handoff/_general/from-code/2026-09-04-m2-batch-10-distribution-rails.md`,
   line 1: "...DEC-20260416-A strale-mcp vs x402/Bazaar audience split..."),
   a tracked repo file the checker's source set does not include (it only
   loads CLAUDE.md/AGENTS.md/records/evidence/backticked-paths/frontend, not
   arbitrary handoff files). Verified by direct grep of that file at this
   commit: the phrase is a normalized substring of it.
2. `DEC-20260225-P-m1n2.md:109` — `"not CI reports"`, best match
   `record:DEC-20260314-G.md` (prefix 5). **Checker miss, not a defect.**
   This is a self-referential scare-quoted label for the record's own
   Decision paragraph two sentences earlier ("CI reports, PDF engines,
   domain-specific pipelines... are explicitly not to be built"), not a
   citation of an external source; the checker treats every double-quoted
   span >= min-chars as an external quotation to verify, which
   over-triggers on this kind of internal shorthand.
3. `DEC-20260227-P-s9t0.md:82` — `"visa/work permit"`, best match
   `notion:DEC-20260227-P-s9t0` (prefix 4, i.e. its own row, not matched in
   full). **Checker miss, not a defect.** This is the record's own
   descriptive label for what a grep turned up
   (`apps/api/src/capabilities/work-permit-requirements.ts`, confirmed to
   exist and to be about visa/work-permit domain content), not a literal
   quotation from any single source, so no source is expected to contain it
   verbatim.

No genuine quote-fidelity defect was found in this partition once the
checker was run correctly against the raw Notion export.

### Withdrawals already covering statements in this partition (rule a)

Cross-referencing `DEC-20260905-C`, `-D`, `-E`, `-I`'s Decision lists against
my 41 files found these prior-round corrections, all independently
re-verified here as accurate (the file still contains the original wrong
text — the withdrawal record does not edit it, per the protected-record
convention — and the withdrawal's stated fact matches the pinned commit):

- `DEC-20260224-P-g7h8.md:73-74` ("Long-term ambition is tens/hundreds of
  thousands of data sources," attributed to CLAUDE.md) — confirmed absent
  from `CLAUDE.md` at this commit (`grep -n "Long-term ambition" CLAUDE.md`
  returns nothing); withdrawn by `DEC-20260905-C` item 1. Note: this exact
  phrase, quoted inside `DEC-20260905-C`'s own withdrawal prose to name the
  defect, makes `record:docs/decisions/records/DEC-20260905-C.md` a
  "faithful" source for the checker (every other record's full text is a
  candidate source), so an automated re-run of the checker against g7h8
  alone would silently pass this span. I verified by direct file search
  rather than trusting that pass.
- `DEC-20260225-P-y1z2.md:88-89` (fabricated "(unanimous)" appended to the
  DEC-19 quote) and `:66-67` composite from `DEC-20260225-P-a3b4` — both
  confirmed against `CLAUDE.md:265` and the `DEC-20260225-P-a3b4` row's
  Decision field; withdrawn by `DEC-20260905-C` items 2-3.
- `DEC-20260226-P-q1r2.md:67` (railway URL sentence attributed to
  CLAUDE.md's Tech Stack) — confirmed absent from `CLAUDE.md`; withdrawn by
  `DEC-20260905-C` item 4.
- `DEC-20260227-P-a1b2.md` ("the original Provider Growth doc" definite
  article/comma insertion) — withdrawn by `DEC-20260905-C` item 5; not
  independently re-verified against the row beyond confirming the withdrawal
  cites the correct page id.
- `DEC-20260227-P-u1v2.md` ("Distribution packages & protocol endpoints"
  heading attributed to CLAUDE.md) — confirmed no such heading exists in
  `CLAUDE.md` at this commit; withdrawn by `DEC-20260905-C` item 6.
- `DEC-20260302-A-0001.md:78` (CHARTER.md quote inserting "to" for an en
  dash) — confirmed `docs/company/CHARTER.md:40` reads
  "€0.02–€1.00" with no "to"; withdrawn by `DEC-20260905-C` item 7.
- `DEC-20260302-C.md:41` (stale CLAUDE.md short-form quote) — confirmed
  current `CLAUDE.md:278` reads differently ("Historical homepage
  prescription; superseded... by DEC-20260905-A..."); withdrawn by
  `DEC-20260905-C` item 8.
- `DEC-20260305-E.md:103` (the "47-to-36 gap" restatement contradicting the
  record's own correctly-derived "35, not 47" two paragraphs earlier at
  line 82) — both lines confirmed present in the file as stated; withdrawn
  by `DEC-20260905-C` item 15.
- `DEC-20260306-D.md:36` (fabricated "Success Rate... naming confusion"
  quote) — confirmed present at that line, with the row's actual Rationale
  field differing (single quotes, em dash, present tense) per
  `DEC-20260905-C` item 16.
- `DEC-20260309-G.md:66-68` ("no matches outside this record" claim) —
  confirmed present; withdrawn by `DEC-20260905-C` item 17 (the phrase also
  occurs in `docs/programs/codex-review-backlog.yaml`'s CX-16 entry, a
  meta-reference to this same record, which I confirmed at
  `codex-review-backlog.yaml:452,460`).
- `DEC-20260225-P-m1n2.md:49-50` ("first vertical: market research and
  competitive intelligence" presented as `DEC-20260224-P-c3d4`'s text) —
  confirmed `DEC-20260224-P-c3d4.md`'s title and body use different word
  order and phrasing; withdrawn by `DEC-20260905-D` item 1.
- `DEC-20260226-P-s3t4.md:78` ("Date-based API versioning via
  `Strale-Version` header" attributed to CLAUDE.md) — confirmed absent from
  `CLAUDE.md`; withdrawn by `DEC-20260905-D` item 3.
- `DEC-20260225-P-k3l4.md:75` (fabricated "wedge, not niche" quote) and
  `DEC-20260226-P-s3t4.md:55` (fabricated "build it now, cheaply" quote) —
  both confirmed present at the cited lines; withdrawn by `DEC-20260905-I`
  items 1-2.
- `DEC-20260227-P-i9j0.md` and `DEC-20260227-P-s9t0.md` items about
  fabricated Unit-3/provider-hosted-execution quotations — withdrawn by
  `DEC-20260905-D` items 4-6; not independently re-verified against the
  Notion rows beyond confirming the withdrawal cites the correct page ids
  (`31367c87082c81049ba4d112accd3f43`, `31467c87082c8171babed0c2434111ac`),
  which do match this partition's own evidence[0] URLs for those two files.

None of these are counted as findings against the original records, per
round-9 rule (a); I independently checked a majority of the corrections
against the pinned-commit file text and/or the parsed Notion export and
found every one of them accurate as stated.

### Structural checks (all 41 records)

1. **Frontmatter/key/id/filename agreement:** all 41 pass. Every bare-key
   file's `record_key` and `id` both equal the filename stem; no
   `--notion-`/`--git-`-qualified files in this partition.
2. **CAUTION banner + five protected sections:** all 41 contain the
   `M2 CANDIDATE RECORD` banner and `## Decision`, `## Context`,
   `## Rationale`, `## Consequences`, `## Reversal conditions`.
3. **Quotation fidelity:** covered above (227/230 faithful, 3 checker
   misses, 0 real defects).
4. **Null-field claims:** every "`Superseded By` and `Outcome` are both null
   in the source" Reversal-conditions line was checked against
   `dump_rows.py`'s null-field printout for that row. All 38 files making
   this exact claim have both fields genuinely null in the export.
   `DEC-20260305-E.md` and `DEC-20260305-F.md` (whose rows have a populated
   `Outcome`) do not make the unqualified claim: E's Reversal conditions
   reads "both null beyond the shipped-Outcome text quoted above" (correctly
   acknowledging the populated field) and F's reads only "`Superseded By` is
   null in the source" (no claim about Outcome at all). `DEC-20260305-G.md`,
   `DEC-20260306-D.md`, `DEC-20260308-1.md`, `DEC-20260309-G.md` don't
   discuss null fields in Reversal conditions at all — no finding.
5. **Evidence paths:** every non-URL, non-`strale-io/`-prefixed evidence
   entry across all 41 files resolves to an existing file in the worktree at
   the pinned commit (checked programmatically; zero missing).
6. **Relations:** 32 of the 41 files declare `relations: []`. Nine declare a
   non-empty relation: `DEC-20260225-P-a3b4` (amends `w9x0`),
   `DEC-20260225-P-m1n2` (amends `c3d4`), `DEC-20260225-P-m5n6` (related_to
   `q1r2`), `DEC-20260225-P-y1z2` (related_to `a3b4`), `DEC-20260226-P-q1r2`
   (related_to `m5n6`), `DEC-20260227-P-o5p6` (amends `a1b2`, related_to
   `g9h0`), `DEC-20260227-P-s9t0` (amends `q7r8`), `DEC-20260227-P-u1v2`
   (related_to `s9t0`), `DEC-20260308-1` (related_to
   `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`). Every target
   exists as a record key at this commit. Every relation has a named,
   substantiating "Relation to `X`" paragraph (or equivalent inline prose)
   stating what the edge rests on; I read each one. None of the nine
   targets is a bare collided id: `docs/decisions/id-collisions.yaml` lists
   `DEC-20260502-A` (bare) as a collision resolved to two `formal_record`
   rows, one of which is the exact qualified key `DEC-20260308-1` points
   at — using the qualified key rather than the bare id is correct per the
   rule. My first parse of the frontmatter (a hand-rolled regex that only
   matched single-line `- target:` entries) initially and wrongly reported
   all nine of these files as having empty relations; I caught this by
   re-parsing the full multi-line YAML block once `DEC-20260308-1`'s body
   referred to a `related_to` relation my first script had missed, and
   redid the check correctly. Flagging this as a caution for other
   reviewers using a similarly quick regex parse rather than a real YAML
   parser.
7. **Ten "status on" code-claim spot checks** (file : line : claim :
   verification):
   - `DEC-20260225-P-q3r4.md:65-70` — no keypair-based agent identity;
     `apps/api/src/lib/auth.ts` uses `sk_live_` + random hex hashed with
     SHA-256, and `production-authority.ts:28,119,285` shows ed25519
     keypairs used only for founder-grant signatures, not agent identity.
     Confirmed.
   - `DEC-20260225-P-q3r4.md:76-84` — x402 USDC-on-Base shipped;
     `apps/api/src/lib/x402-gateway.ts` has `USDC_CONTRACTS["base"]` with a
     "Base mainnet" comment (line 64) and `NETWORK`/`X402_NETWORK` config.
     Confirmed.
   - `DEC-20260225-P-w9x0.md:101-104` — "3 of 5 use Puppeteer" flagged as
     not re-verifiable rather than asserted true today; confirmed the
     record hedges honestly (does not claim the property still holds) and
     that all three evidence manifests it cites
     (`swedish-company-data.yaml`, `screenshot-url.yaml`,
     `invoice-extract.yaml`) exist at this commit.
   - `DEC-20260226-P-w7x8.md:82-86` — "European business data" framing
     attributed to the row itself; confirmed against the parsed Notion
     row's Rationale field ("...most comprehensive agent-accessible
     European business data API").
   - `DEC-20260227-P-q7r8.md:63` — "Agent Reputation Engine" /ERC-8004
     claim; confirmed `apps/api/src/web3-assurance/evaluators/erc-8004-reputation.ts`
     exists and is an ERC-8004 trustless-agent-reputation reader.
   - `DEC-20260227-P-s9t0.md:78-83` — MCP server and A2A surface exist,
     Visa TAP does not, "visa/work permit" and "TAP Portugal" false
     positives named; confirmed `packages/mcp-server/`,
     `apps/api/src/routes/a2a.ts`, `apps/api/src/capabilities/work-permit-requirements.ts`
     (visa/work-permit domain content) and `flight-status.ts:71` ("TP:
     \"TAP Portugal\"") all exist as described.
   - `DEC-20260302-A-0001.md:44,78-82` — CHARTER's pricing band; confirmed
     `docs/company/CHARTER.md:40` states the €0.02–€1.00 band (see the
     withdrawn-quote note above for the exact-wording defect already
     covered).
   - `DEC-20260305-F.md:41-44` — the row's Outcome text ("72/98 → 94/98
     passing... resolve6 fallback... IANA root fallback"); confirmed
     verbatim against the parsed row's Outcome field, and confirmed
     `email-deliverability-check.ts:46-48` has the resolve6 fallback and
     `whois-lookup.ts:8,66` has the IANA-root fallback.
   - `DEC-20260306-G.md:32-34` — "RESOLVED, see SQS Constitution" /
     "Strale Quality Score — Design Spec" attributed to the row's own
     title/spec; confirmed against the parsed row's Decision field
     ("...RESOLVED, see SQS Constitution") and Rationale field ("Spec at:
     Strale Quality Score — Design Spec.").
   - `DEC-20260309-G.md:66-68` — risk-framework search claim (see
     withdrawn-quote note above); confirmed `docs/programs/codex-review-backlog.yaml:452,460`
     is the one outside occurrence the withdrawal names.

### Unverifiable

None. Every claim I attempted to check resolved one way or the other; the
two DEC-20260905-D items I did not independently re-verify against the
underlying Notion row content (`DEC-20260227-P-i9j0`,
`DEC-20260227-P-s9t0` fabricated-quote withdrawals, items 4-6) were at
least confirmed to cite the correct page ids matching this partition's own
evidence lists, so I list them as accepted-on-citation rather than
unverifiable.

### Findings

No findings. Every genuine defect in this partition's 41 records was already
identified and withdrawn by `DEC-20260905-C`, `-D`, or `-I`, and every one of
those corrections checks out against the pinned-commit file text and/or the
parsed Notion export. The 3 residuals the quote-fidelity checker still
reports are checker misses (sources outside its search set, or
self-referential internal labels), not defects, as detailed above.

PARTITION VERDICT: PASS

### P2

# Closing review round 9 (final round) — partition P2

Commit reviewed: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`
Records in partition: 41 (`DEC-20260310-E.md` through `DEC-20260411-B.md`, listed one per line in `closing9-P2.txt`)

### Method

Checked out a detached worktree at the pinned commit and ran `npm ci` there (no edits made; worktree confirmed clean at the end). Read all 41 records in full, cross-checked every quotation against its named source: Notion rows dumped read-only via `dump_rows.py` (39 pages covering all 39 rows this partition cites; `DEC-20260320-B.md`'s two `/p/` evidence links are unquoted spec-page pointers, not dumped), named repository files at the pinned commit, the sibling `strale-frontend` checkout at the cited SHAs, and sibling decision records. Verified frontmatter/`record_key`/`id`/filename agreement, the CAUTION banner and five protected sections, evidence-path existence (including cross-repo entries), relation-target existence and substantiation, no-null-field-quoted/no-populated-field-called-null, and (rule (d)) that none of my partition's ids appear in `docs/decisions/id-collisions.yaml`. I read `DEC-20260905-B` through `-I` in full before starting, since round-1-through-8 corrections touch the majority of this partition's records, and applied the round's final quotation convention (`DEC-20260905-C`/`-D`/`-E`/`-F`/`-G`/`-H`/`-I`, all identical: transliterate `€`→EUR, `×`→x, `≥`→>=, `≤`→<=, `→`→->, `…`→..., lowercase, strip non-alphanumerics, substring match, ellipsis splits into ordered segments).

Then ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-pretty.json --frontend C:/Users/pette/Projects/strale-frontend --min-chars 12`, restricted to my 41 files via repeated `--only`. Logic in one sentence: it extracts every double-quoted span of at least `--min-chars` characters from a record's body, normalizes it and every candidate source (the record's own evidence files, sibling records, and the frontend checkout) under the same convention, and reports a span "residual" if no candidate source contains it as a substring (an ellipsis splits the span into ordered segments checked independently) — it does not read Notion rows at all, which is why every quote whose only faithful source is a Notion field shows up as a residual regardless of accuracy.

### Script residuals and classification

Totals for this partition: 41 records, 223 spans, 152 faithful, 71 residual. I read every one of the 71 residuals against its actual named source (Notion row field via the dump, or the file/record the surrounding prose names) rather than trusting the checker's own best-match guess (which is frequently a wrong file, since the checker cannot read Notion and falls back to whatever file scores highest).

Classification: **69 of 71 are checker misses** (faithful to a located, named source; the checker's blind spot is that it never reads the Notion export, so any quote whose sole source is a Decision/Rationale/Outcome field is reported residual regardless of fidelity). **2 of 71 are real defects**, both in `DEC-20260316-A.md` (detailed in Findings below). Full per-residual reconciliation:

- `DEC-20260310-E.md` line 73 "Piggyback traffic", line 84 "Prerequisite: test suite audit" — both exact substrings of the row's own Rationale field. Checker miss.
- `DEC-20260310-F.md` lines 67, 69 ("fields must exist in all output paths", "structurally valid validation rules.") — exact substrings of the row's Rationale. Lines 72, 91 ("data completeness rule") — self-referential to the record's own frontmatter title, not an external attribution. Checker miss / non-issue.
- `DEC-20260313-E.md` line 32 ("this is what we're about"), line 64 ("Trust covers methodology") — exact substrings of the row's Rationale. Checker miss.
- `DEC-20260314-B.md` line 37 ("a Lovable session that produces zero readers.") — exact substring of its own row's Rationale. Line 81 ("Blog Post #1 must be ready so launch day isn't just tweets into the void,") — exact substring of the *sibling* row `DEC-20260314-A`'s Rationale field (correctly attributed as "that row's own Rationale"). Checker miss (checker only checks a record's own listed evidence files/rows, not a cross-referenced sibling row).
- `DEC-20260314-F.md` lines 82, 84 (grep patterns quoted as literal search strings) — methodology description, not a content attribution. Non-issue. (The record's other flagged span, the em-dash-for-comma "AX is not a nice-to-have" quote, is **not** a residual here because it is short; see Findings for why it is not a new finding either — already withdrawn by `DEC-20260905-B` item 9.)
- `DEC-20260314-G.md` line 26 (headline, exact substring of the row's Decision field), line 32 ("Any data your agent needs", exact substring of Rationale), line 38 ("tested best for clarity + differentiation balance.", exact substring of Rationale). Checker miss.
- `DEC-20260315-B.md` line 33 (DEC-20260311-A quote) — faithful to the row's Rationale except an em dash in the source rendered as a comma in the record, punctuation only, not a defect under the convention. Checker miss.
- `DEC-20260315-H.md` line 33 — exact substring of the row's Rationale. Checker miss (checker's best-match pointed at the wrong evidence file).
- `DEC-20260315-I.md` line 33 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260316-A.md` lines 82, 87 — **real defects**, see Findings 1–2.
- `DEC-20260316-B.md` line 39 ("Quality A · Reliability B") and line 75 ("never mixed inline") — exact substrings of the row's Rationale. Line 50 ("which is the real rating") — a scare-quoted characterization of a "confusion", not attributed as a literal quotation of any named source; stylistic, not a finding.
- `DEC-20260317-A.md` line 37 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260317-F.md` line 34 — exact substring of the row's Rationale. Lines 43, 51 ("automated >= 50 qualification/gate") — self-referential to the record's own frontmatter title using this batch's `>=` convention, not an external attribution. Non-issue.
- `DEC-20260317-G.md` line 33 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260317-H.md` line 33 — exact substring of the row's Rationale. Line 42 ("Strale independent tests", "provider results") — "Strale independent tests" is an exact substring of the row's **Decision** field (not Rationale, which the checker apparently didn't check); "provider results" is an exact substring of Rationale. Checker miss.
- `DEC-20260318-A.md` line 81 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260318-B.md` line 58 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260320-A.md` line 96 — exact substring of `apps/api/src/lib/capability-readiness.ts`'s header comment (with a marked `[reliability and limitations]` editorial insertion). Line 108 ("single enforcement gateway") — self-referential to the record's own frontmatter title. Line 113 — exact substring of the row's Rationale (arrow-separated ordering). Checker miss / non-issue.
- `DEC-20260320-E.md` line 95 — exact substring of the row's Outcome field. Checker miss.
- `DEC-20260320-F.md` line 49 — exact substring of the row's Outcome field. Checker miss.
- `DEC-20260321-A.md` — all 5 spans residual, 0 flagged faithful by the checker; I verified all 5 by hand: lines 35 and 42/97 are exact (modulo `×`→`x`) substrings of the row's Rationale and Outcome fields respectively; line 67 is a quoted grep pattern (methodology, not content); line 70 ("solution batch") is a short, non-distinctively-attributed descriptive term also present in the row's Rationale. All checker misses; **zero real defects** in this record despite its 0/5 faithful score.
- `DEC-20260324-C.md` line 70 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260329-A.md` line 34 (the whole palette paragraph) — exact substring of the row's Rationale (verbatim, including all seven hex codes). Checker miss.
- `DEC-20260330-B.md` line 61 — exact substring of the row's Rationale. Checker miss.
- `DEC-20260404-A.md` line 71 — exact substring of the row's Outcome field. Checker miss.
- `DEC-20260405-A.md` lines 37, 73, 107 — all exact substrings of the row's Rationale field (which, per the raw export, combines what other records call "Decision"/"Context" prose into one long field). Checker miss.
- `DEC-20260406-E.md` lines 33, 72, 75 — all exact substrings of the row's Rationale field. Checker miss.
- `DEC-20260409-A.md` lines 41, 47, 58, 103 — all exact substrings of the row's Rationale field. Checker miss.
- `DEC-20260409-B.md` lines 47, 52, 55, 61 — all exact (or, for line 61, ellipsis-segmented and exact) substrings of the row's Rationale field. Checker miss.
- `DEC-20260409-D.md` lines 55, 62, 63, 73, 126 — all exact (line 73 truncated without ellipsis marker, punctuation-only) substrings of the row's Rationale field. Checker miss.
- `DEC-20260410-A.md` lines 37, 62 — exact substrings of the row's Rationale and Decision fields respectively. Checker miss.
- `DEC-20260411-A.md` line 85 ("algorithmic = EUR 0.02") — exact substring of the row's Decision field under the stated `€`→EUR transliteration. Checker miss.
- `DEC-20260411-B.md` line 81 — exact substring of the row's Rationale field. Checker miss.

### Findings

1. **`docs/decisions/records/DEC-20260316-A.md`, line 82.** The record quotes: `this row's "one headline signal" principle, restated after the SQS engine itself was deleted`. The row's actual Rationale field (Notion page `32567c87082c819da00ffeb660efa605`) reads: *"SQS (the dual-profile matrix output) is the issuer rating — the single headline signal."* — "the **single** headline signal," not "one headline signal." No other candidate source (`apps/api/src/routes/public-trust.ts`'s header comment, `apps/api/src/lib/trust-grade.ts`, `CLAUDE.md`, or the sibling `DEC-20260316-B.md`) contains "one headline signal" or "single headline signal" verbatim either. This is a word substitution ("one" for "single"), which the quotation convention treats as a defect regardless of the punctuation-leniency rules. Evidence: the row's Rationale field (dumped via `dump_rows.py`); `apps/api/src/routes/public-trust.ts`; `apps/api/src/lib/trust-grade.ts`; `CLAUDE.md`; `docs/decisions/records/DEC-20260316-B.md` (none contain the phrase).

2. **`docs/decisions/records/DEC-20260316-A.md`, line 87.** The record quotes: `a grade combining "worst of SQS, freshness, latency" has no live SQS input to combine`. `apps/api/src/lib/trust-grade.ts:211` reads: *"Combined grade = worst of (SQS grade, freshness grade, latency grade)"*. The quoted phrase drops the word "grade" from all three list items (`SQS`, `freshness`, `latency` vs. `SQS grade`, `freshness grade`, `latency grade`), which is not a substring of the source under the stated normalization (the interposed word breaks contiguity) and is a real compression of the source's wording, not a punctuation, case, or symbol-transliteration difference. Lower confidence than finding 1 — it may be read as the record's own descriptive shorthand for "a grade that takes the worst of SQS, freshness, and latency" rather than a claimed literal citation — but it is presented inside quotation marks immediately after naming the specific code construct, which is how every other faithful quote in this partition is also presented. Evidence: `apps/api/src/lib/trust-grade.ts` line 211.

No other findings. All other statements checked — including every "the historical Notion scope field on this row was `global`" claim (all 39 dumped rows confirm `Scope: global`), every "Confidence recorded as high" claim, every "`Superseded By` and `Outcome` are both null" claim (cross-checked against the dump's null-field listing for all 39 rows; all such claims in this partition are correct, and the two records with a populated Outcome — `DEC-20260320-E`, `DEC-20260320-F`, `DEC-20260321-A`, `DEC-20260404-A` — correctly quote it rather than calling it null) — were accurate.

**Not a new finding (already corrected):** `DEC-20260314-F.md`'s quotation "Strale's primary consumers are AI agents, AX is not a nice-to-have" (comma) is present verbatim in the current file and does differ from the row's Rationale, which reads "...AI agents — AX is not a nice-to-have..." (em dash). This exact statement was withdrawn by `DEC-20260905-B` item 9 (`Relation to DEC-20260314-F: withdraws the quotation "Strale's primary consumers are AI agents, AX is not a nice-to-have"`), and the withdrawal's correction is itself accurate against the row. Per this round's rule (a), this is a correction, not a fresh finding against `DEC-20260314-F`.

### Structural checks (all 41 records)

- Frontmatter parses; `record_key`, `id`, and filename agree for all 41 files (scripted check, zero mismatches).
- CAUTION banner and all five protected sections (Decision, Context, Rationale, Consequences, Reversal conditions) present in all 41 files (scripted check, zero missing).
- All `evidence:` file-path entries (non-URL, non-cross-repo) exist at the pinned commit (scripted check, zero missing) — covers 39 records with local-file evidence.
- Cross-repo evidence: all four distinct `strale-io/strale-frontend@04c9fca9:<path>` entries (`src/App.tsx`, `src/components/Header.tsx`, `src/index.css`, `src/pages/Index.tsx`) resolve via `git show 04c9fca9:<path>` in the sibling checkout after `git fetch origin`.
- None of this partition's 41 bare record keys appear in `docs/decisions/id-collisions.yaml` (none are qualified `--notion-`/`--git-` records, so the collision-registry/M2-closure-register cross-check in step 8 of the brief does not apply to any file in P2).
- Relations (7 declared edges across 5 records, all targets exist as record keys at this commit):
  - `DEC-20260314-A` ↔ `DEC-20260314-B` (`related_to`, both directions) — each substantiated directly in the other's own body prose.
  - `DEC-20260405-A` → `DEC-20260320-B` (`related_to`) — substantiated directly in `DEC-20260405-A`'s own Context section, which names `DEC-20260320-B` by ID and subject.
  - `DEC-20260409-B` → `DEC-20260409-A` (`related_to`) — substantiated directly in `DEC-20260409-B`'s own Context section (quotes the row's own "RELATED: DEC-20260409-A..." line).
  - `DEC-20260409-D` → `DEC-20260409-A` (`related_to`) — not narrated in `DEC-20260409-D`'s own body (confirmed: `grep -n "DEC-20260409-A" DEC-20260409-D.md` matches only the frontmatter line), but substantiated by `DEC-20260905-E` item 6, per rule (a).
  - `DEC-20260409-D` → `DEC-20260409-B` (`related_to`) — likewise not narrated in the source record's own body, but substantiated by `DEC-20260905-D` item 7 (round 3's amending record), per rule (a). (I initially expected this relation to be an open gap since `DEC-20260905-E` item 6 only explicitly addresses the `DEC-20260409-A` edge; `DEC-20260905-D` item 7, read separately, already covers the `DEC-20260409-B` edge.)
  - `DEC-20260411-A` → `DEC-20260302-A-0001` (`amends`) — substantiated directly in `DEC-20260411-A`'s own Consequences section, which names the target by ID and quotes its mechanism.

### Ten code-claim spot checks (of many more performed)

1. `CLAUDE.md` — "SQS scoring engine deleted per DEC-20260503-B (PR1 shipped 2026-05-05)" — verbatim present (cited by `DEC-20260310-E.md` and others).
2. `apps/api/src/routes/public-trust.ts` lines 55/57 — `tested: boolean;` and `pass_rate: number | null;` present as claimed by `DEC-20260313-C.md`.
3. `strale-io/strale-frontend@04c9fca9:src/components/Header.tsx` line 10 — `{ label: "Trust", href: "/trust" }` present as claimed by `DEC-20260313-E.md`.
4. `strale-io/strale-frontend@04c9fca9:src/App.tsx` lines 83–84 — both `/trust` and `/trust/methodology` routes present as claimed.
5. `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` lines 145–147 — the exact hero-headline JSX block claimed by `DEC-20260314-G.md` is present character for character.
6. `strale-io/strale-frontend@04c9fca9:src/index.css` — all seven claimed CSS custom properties (`--pink`, `--purple`, `--info`, `--success`, `--warning`, `--teal`, `--destructive`) present with the exact HSL values `DEC-20260329-A.md` states.
7. `design/tokens/active.json` — contains no occurrence of any of the seven hex codes `DEC-20260329-A.md` names, and its only "accent" entry is `"#2563EB"`, exactly as claimed.
8. `apps/api/src/lib/trust-grade.ts` — `computeTrustGrade` has zero call sites outside its own file (`grep -rn` returns only the definition line), confirmed as claimed by `DEC-20260316-A.md`, `DEC-20260317-F.md`, and `DEC-20260317-H.md`.
9. `server.json` (`"version": "0.2.3"`) vs. `packages/mcp-server/package.json` (`"version": "0.2.8"`) — both exact values claimed by `DEC-20260313-F.md`.
10. `apps/api/src/lib/null-field-ratio.ts` header comment — word-for-word match with the block quoted by `DEC-20260409-A.md`.
11. `apps/api/src/lib/gate5-path-coverage.ts` header comment — word-for-word match with the block quoted by `DEC-20260411-B.md`.
12. `apps/api/scripts/onboard.ts` — `--dry-run`, `--backfill`, `--strict`, `--fix`, `--discover` flags all present as claimed by `DEC-20260318-A.md`/`-318-B.md`.
13. `apps/api/src/db/seed-solutions.ts` lines 391–392 — the "SQS-based qualification gate retired... at least one passing test_result..." comment matches `DEC-20260315-H.md`/`-317-F.md` verbatim.
14. `apps/api/src/lib/interrupt-sender.ts` — `sendInterruptEmail` has zero callers outside its own definition file, confirmed as claimed by `DEC-20260317-A.md`.
15. `docs/company/DAILY-RUN.md` — contains a "CEO morning brief" / "Part 3 — the CEO morning brief" section, confirmed as claimed by `DEC-20260317-A.md`.
16. `manifests/vat-validate.yaml`, `manifests/sanctions-check.yaml`, `manifests/pep-check.yaml`, `manifests/adverse-media-check.yaml` — `price_cents` values (2, 20, 5, 20) all match the exact figures `DEC-20260320-F.md`/`DEC-20260411-A.md` state.
17. `apps/api` — no `seed.ts` file exists anywhere under it, confirmed as claimed by `DEC-20260318-A.md`.

### Unverifiable

- Whether Session 3 patched the "Positioning page Lock 7 phrasing leftover" residual issue `DEC-20260406-E.md` names, and whether the "Switchboard" watch item exists in Notion's operating-manual pages — both are Notion-page-only subjects with no repository trace; the record itself correctly states this as unverifiable from repo evidence rather than asserting an answer.
- Whether `DEC-20260410-A`'s "Silent" (not-on-pricing-page) claim holds against the live `strale.dev` pricing page — the record itself scopes this as outside its file-only evidence and does not assert it either way; I did not independently check the live site, consistent with the record's own stated limitation.
- Whether the specific "312-line" `app.ts` import-list figure `DEC-20260320-A.md`'s Rationale field states was ever true — the file it would have lived in (`app.ts`, pre-auto-register) no longer exists to check; the record itself flags this as unverifiable rather than asserting it, which I agree with.

### PARTITION VERDICT: PASS

### P3

# Closing-review partition report, P3, round 9 (final round)

Commit reviewed: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`
Record count: 41 files (`docs/decisions/records/DEC-20260413-A.md` through
`DEC-20260507-H.md`, listed in `closing9-P3.txt`).

Setup: detached worktree at `C:/tmp/strale-closing9-P3`, `npm ci`, reviewed
read-only, removed at the end via `git worktree remove --force` (all
junctions under its `node_modules` pointed inside the same directory,
confirmed with PowerShell `Get-ChildItem -Recurse -Force -Attributes
ReparsePoint` before removal).

### Prior-round corrections consulted

Before flagging anything I read `DEC-20260905-B` through `-I` in full and
extracted every withdrawal item that names a record in this partition. The
following statements are still present verbatim in the (immutable) active
records below because they were withdrawn by amending records, not by
editing the originals. None of these is a fresh finding:

- `DEC-20260413-A` — "aggressive addition when free to maintain" (withdrawn
  by `DEC-20260905-D` item 8).
- `DEC-20260419-A` — the "justification comment" phrase misattributed to
  `check-no-new-console.mjs`'s header comment (withdrawn by `DEC-20260905-B`
  item 3; confirmed against the file: the header comment does not say this).
- `DEC-20260422-B` — "leave the row, mark it, don't delete" (withdrawn by
  `DEC-20260905-D` item 11).
- `DEC-20260422-D` — "No manifest schema field ... carries `license_url`"
  (withdrawn by `DEC-20260905-I` item 4; `manifests/doi-resolve.yaml` does
  carry an unrelated `license_url` field).
- `DEC-20260422-H` — quotes `DEC-20260430-A`'s stale "unresolved
  collision"/"unmigrated" sentence about itself; `DEC-20260905-G` item 6
  explicitly says quoting it there is faithful to what `DEC-20260430-A`
  says, not a fresh defect in `DEC-20260422-H`.
- `DEC-20260425-A` — the manifest-declared-jurisdiction quotation
  attributed to "Decision" instead of "Rationale," comma-joined instead of
  parenthetical (withdrawn by `DEC-20260905-B` item 12).
- `DEC-20260427-H` — "No record for `DEC-20260420-H` exists in this
  repository" (withdrawn by `DEC-20260905-D` item 12; the record exists).
- `DEC-20260427-I` — the fabricated "(Phase 2a/2b)" composite and the
  reordered northdata.com/KRS-by-number quotation (withdrawn by
  `DEC-20260905-D` items 13-14; confirmed against `auto-register.ts` and
  `polish-company-data.ts`: dutch is "(Phase 2a)", portuguese is
  "(Phase 2b)" separately, and the actual comment order is reversed from
  the quotation).
- `DEC-20260428-B` — undeclared `related_to DEC-20260428-A` narration gap,
  substantiated (not withdrawn) by `DEC-20260905-D` item 15.
- `DEC-20260429-A` — the four "re-evaluation triggers" paraphrase. Per the
  round-4 "Not adopted" note this is verified true from the Notion page
  body (not in the row-properties export). I re-verified this myself via
  `notion-fetch` on page `35167c87082c8172bff8f3485699c961` rather than
  relying on the prior round's report: the page body's "Re-evaluation
  triggers" section lists exactly the four items the record paraphrases
  (>€1.5k/month bill, customer/regulator replay demand, April 2027 annual
  review, Dilisense-initiated terms change). Confirmed true, not a finding.
- `DEC-20260430-A` — `related_to DEC-20260428-A`/`DEC-20260428-B` narration
  gaps, substantiated by `DEC-20260905-F`/`-H`/`-I`; and the false
  "unresolved collision"/"unmigrated" sentence about `DEC-20260420-K`/
  `DEC-20260422-H` (withdrawn by `DEC-20260905-G` item 6; both are in fact
  resolved/migrated, confirmed against `id-collisions.yaml` and the
  existence of `DEC-20260422-H.md`).
- `DEC-20260503-A` — "unresolved source-ID collisions" for
  `DEC-20260502-A`/`DEC-20260420-E`/`-F`/`-H` (withdrawn by `DEC-20260905-I`
  item 7; all four are `resolution_status: resolved` in
  `id-collisions.yaml`).
- `DEC-20260503-B` — "audit trail tiered" transposed to "tiered audit
  trail" (withdrawn by `DEC-20260905-D` item 16; both the frontmatter
  `title` and the Notion row's Decision field read "audit trail tiered").
- `DEC-20260505-H` — quote check only checked spans >=12 chars but this
  file passed with 4/4 faithful; no issue found directly in this file (see
  Findings — this record's own text was clean; the earlier misattribution
  D withdrew belonged to a different record's citation of this one, not to
  `DEC-20260505-H.md`'s own body — no correction needed here).
- `DEC-20260506-G` — "DEC-20260422-H, no formal record exists for that id
  on `main`" (withdrawn by `DEC-20260905-H` item 4; the record exists) and
  the "External spend: EUR 50/week" / "spending inside the EUR 50/week
  envelope" quotations (withdrawn by `DEC-20260905-B` item 8; `CHARTER.md`
  uses the euro sign, not "EUR").
- `DEC-20260506-G`'s citation of `DEC-20260507-D` for the Kyckr
  "sales-gated pricing" quotation is wrong (the quotation and the Kyckr
  rejection belong to `DEC-20260507-F`, not `-D`); this was withdrawn by
  `DEC-20260905-C` item 38. Confirmed: `DEC-20260507-D.md` never mentions
  Kyckr; `DEC-20260507-F.md:41` carries the real text.
- `DEC-20260507-D` — the "the readiness program adopted..." quotation with
  an inserted leading "the" (withdrawn by `DEC-20260905-D` item 17;
  `CLAUDE.md:302` begins "**Readiness program adopted.**" with no article).
- `DEC-20260507-G` — "one day after `DEC-20260518` batch work" (withdrawn
  by `DEC-20260905-C` item 39; commit `9ee19282` is dated 2026-05-16, two
  days *before* `DEC-20260518-F`'s 2026-05-18 decision date, not after it).

### Script used

Three checks, all against the reviewed commit:

1. **A structural script** (`node --input-type=module` against
   `scripts/decision-records-lib.mjs`'s `parseDecisionRecord`) over all 41
   files: `record_key`/`id`/filename agreement, presence of the CAUTION
   banner text and all five protected `## ` headings, existence of every
   non-URL evidence path, and existence of every relation target's record
   file. Zero findings across all 41 records.
2. **The operator checker**, `node scripts/m2-quote-fidelity.mjs --export
   scratchpad/decisions-export-raw.txt --frontend
   C:/Users/pette/Projects/strale-frontend --min-chars 12`, one `--only`
   per file in this partition. Result: **41 records, 146 spans, 145
   faithful, 1 residual.**
3. `node --test scripts/decision-records.test.mjs` (repo-wide, includes
   this partition): all 32 tests passed, including "the repository decision
   candidates and merge-base immutability checks pass" and the relation/
   collision-cycle/bare-collided-id tests.

### The one residual, classified

`docs/decisions/records/DEC-20260416-A.md:82`: the quoted span "the
first-party MCP is the only surface that exposes Strale's differentiated
metadata" is presented as "the ... claim" the row makes. The Notion row's
Rationale field (page `34467c87082c81208727dab42331cae4`, dumped and read
directly) reads "...no per-tx USDC + gas); first-party MCP is the only
surface that exposes Strale's differentiated metadata (SQS, limitations,
structured errors)" — no "the" precedes "first-party" in the source.
**Classified: real defect, not a checker miss.** An inserted word before a
quotation attributed to the row is a defect under the stated convention (the
same class `DEC-20260905-D` item 17 withdrew for `DEC-20260507-D`'s "the
readiness program adopted..."). This is a fresh finding, not covered by any
existing withdrawal record (I checked all eight; none names
`DEC-20260416-A`).

Note: the checker's own "best match" guess for this residual (pointing at
`DEC-20260901-A`, prefix 12) is irrelevant noise from its best-effort
fallback matcher; the correct classification comes from reading the actual
attributed source (the Notion row), not the checker's suggestion.

### Findings

1. **`DEC-20260416-A.md:82`** (Consequences section). Quotation "the
   first-party MCP is the only surface that exposes Strale's differentiated
   metadata" has a spurious leading "the" not present in the Notion row's
   Rationale field (page `34467c87082c81208727dab42331cae4`), which reads
   "...gas); first-party MCP is the only surface that exposes...". This is
   a word inserted before a quotation presented as literal. Not withdrawn by
   any of `DEC-20260905-B` through `-I`.

No other findings. Every other quotation I checked (either via the operator
tool or by direct comparison against the parsed Notion row, the cited repo
file, or the cited sibling record) was faithful under the stated
normalization convention, and every evidence path, relation target, and
frontmatter field agreed with the reviewed commit.

### Ten "status on" code-claim spot checks (I did more; these are
representative, file:line for each)

1. `DEC-20260413-A` — CLAUDE.md:306, "290+ capabilities across 7 verticals
   (company-data, compliance, developer-tools, finance, data-processing,
   web-scraping, monitoring)" — confirmed verbatim.
2. `DEC-20260413-A` — `docs/strategy/2026-08-05-direction-plan.md:14`, the
   "38 distinct crypto wallets" / "least reliable part of the platform in
   production" / "treats the compliance vertical as a separate business"
   passage — confirmed verbatim.
3. `DEC-20260415-A`/`-B` — `docs/company/VOICE.md` is exactly 57 lines with
   headings "Writing rules — as binding as the colours" and "The claims
   half of voice"; no match for "2.7", "thinking-out-loud", "Reddit",
   "deference", "market-claim", or "engagement-bait" — confirmed.
4. `DEC-20260416-A` — `apps/api/src/routes/x402-gateway-v2.ts:335-474`
   (`toBazaarFields`/`buildBazaarDiscovery`), `CLAUDE.md:309` "payment IS
   the auth", `packages/mcp-server/package.json` name `strale-mcp`,
   `docs/decisions/records/DEC-20260422-A--git-3b256587.md` exists —
   confirmed.
5. `DEC-20260419-A` — `apps/api/scripts/console-allowlist.json`: 24 keys,
   `apps/api/src/index.ts` count 8 — confirmed exactly as claimed.
6. `DEC-20260420-A` — `apps/api/package.json` has no `db:generate`/
   `db:migrate`/`db:push` scripts; `apps/api/drizzle.config.ts` exists;
   `drizzle-kit` is a devDependency; `.github/workflows/ci.yml:176` runs
   `drizzle-kit push --force` — confirmed.
7. `DEC-20260421-J`/`-L`/`-422-B` — `auto-register.ts` DEACTIVATED entries
   for `amazon-price`, `hong-kong-company-data`, `indian-company-data`;
   `manifests/singapore-company-data.yaml` exists; commit `bd25bc57`
   resolves — confirmed.
8. `DEC-20260421-L` — `capability-readiness.ts:9-35` Stage A/D comments;
   `apps/api/scripts/archive/phase-dec-b-park.ts` carries
   `park_permanent_dec_20260421_l`/`_20260423_b`; commit `b86d431a`
   resolves — confirmed.
9. `DEC-20260422-D`/`-H` — `docs/decisions/records/DEC-20260812-A.md:29-32`
   Decision text "Retire Counterparty Assurance as Strale's primary
   framing; compliance work becomes a separate track that requires
   customer evidence" — confirmed verbatim; `docs/company/DECISION-QUEUE.md`
   and `BUDGET.md` contain no "Movitz" or "Creditsafe" — confirmed (no
   matches).
10. `DEC-20260503-B` — `apps/api/src/db/schema.ts` still has `qpScore`,
    `rpScore`, `matrixSqs`, `matrixSqsRaw`, `guidanceUsable`, and the
    `sqs_daily_snapshot` table; `test-scheduler.ts` has both the
    `scheduled_testing_eligible = TRUE` filter and the risk-tiered
    A=6h/B=24h/C=72h comment; `audit.ts` has zero case-insensitive matches
    for "tier"/"basic"/"Assurance" — confirmed exactly.

Additional spot checks performed beyond the required ten, all confirmed:
DEC-20260427-H/-I's `auto-register.ts` DEACTIVATED comments and reactivation
migration comments (dutch/portuguese/lithuanian/spanish/german/austrian);
`DEC-20260813-A`'s "Google surfaces prohibited by DEC-20260427-H-4" quote;
DEC-20260429-A's Notion page body (re-evaluation triggers) via live
`notion-fetch`; DEC-20260505-A/-B/-C's extensive Rationale-field quotations,
each checked against the parsed row directly; DEC-20260507-F/-G/-H's Kyckr,
Bulgaria/Cyprus, and Luxembourg/Hungary manifest and env-manifest claims,
including confirming commit `84398f7` does not resolve and `9ee19282` does
(dated 2026-05-16).

### Unverifiable

None. Every claim in this partition resolved one way or the other: every
quotation was checked against a locatable source (Notion row, repo file, or
sibling record), every evidence path and relation target exists at the
reviewed commit, and the one Notion-page-body claim (`DEC-20260429-A`'s
four triggers) was independently confirmed via `notion-fetch` rather than
left as unverifiable.

### Verdict

One real, previously-unrecorded defect (`DEC-20260416-A`, an inserted "the"
in an attributed quotation) is a false/misattributed statement under this
round's rules, so this partition fails on substance even though it is
minor and structurally isolated (one word, one record, does not affect any
relation, evidence path, or collision binding).

PARTITION VERDICT: FAIL

### P4

# M2 closing independent review, round 9, partition P4

Commit: fcfceb59f68228c0e9910581a67e67b1810ee1fa
Record count: 41 (DEC-20260507-I through DEC-20260904-B, per closing9-P4.txt)

### Method

Checked out a detached worktree at the pinned commit and ran `npm ci` there.
Read all 41 records in full. Fetched every Notion Decisions-DB row named by
each record's evidence[0] URL in one batch via `dump_rows.py` (36 of the
requested pages came back as DB rows; the remainder — a methodology page and
two reconciliation-source pages — are ordinary Notion pages outside the DB
export and were not quoted by any record in this partition, so no
`notion-fetch` was needed for them). Compared every quotation against the
parsed Notion fields, the cited repository files at the pinned commit, and
the cited `strale-io/strale-frontend` commits, using the stated
normalization convention. Checked every plain-path evidence entry for
existence with a script, and every cross-repo/commit-qualified entry with
`git cat-file` / `git grep` against the sibling checkout (after `git fetch
origin`) or the main repo. Verified frontmatter `record_key`/`id`/filename
agreement and the presence of the CAUTION banner and five protected
sections for all 41 files with a script (zero failures on both). Ran the
operator checker `node scripts/m2-quote-fidelity.mjs --export
<decisions-export-raw.txt> --frontend <strale-frontend checkout>
--min-chars 12` scoped to this partition's 41 files via repeated `--only`
flags, and classified every one of its 11 residuals by hand.

### Checker residuals and classification

1. `DEC-20260510-A.md` line 86, `"promote a useful handoff note to
   tracked,"` — checker miss. This is the record's own rhetorical
   self-reference back to its earlier description of the T15 discipline
   (`"promote a useful handoff note to tracked"` is the record's own words,
   not attributed to Notion or any file); not a quotation of an external
   source.
2. `DEC-20260518-A.md` line 100, `"Evidence Tier 1/2/3"` — checker miss.
   Self-referential composite label built from the record's own Decision
   section (which defines "Evidence Tier 1", "Evidence Tier 2", "Evidence
   Tier 3"), not attributed to Notion as a verbatim phrase.
3. `DEC-20260518-B.md` line 55, `"can this country deliver T1/T2/T3"` —
   **real defect, reported as finding 1 below.**
4. `DEC-20260518-D.md` line 43, `"does Strale return this today"` —
   **real defect, reported as finding 2 below.**
5. `DEC-20260820-B-WEBSITE-INTEGRATION-BURDEN.md` line 26, `"The burden
   collapses"` — checker miss. Verified verbatim in
   `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/integration-burden-v1.3.md:13`
   (`Adopt **The burden collapses** as the second homepage section.`),
   which is inside the record's cited evidence directory.
6. `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION.md` line 28, `"Selection
   Violet"` — checker miss. Verified verbatim in
   `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-enrichment-validation-v1.5.md`
   (multiple occurrences, including "Approved on 2026-08-20 as
   `DEC-20260820-D-WEBSITE-ENRICHMENT-VALIDATION`. The decision accepts
   Selection Violet...").
7. `DEC-20260820-E-WEBSITE-SEARCH-WEB.md` lines 28 and 63, `"not a live
   ranking"` (x2) — checker miss both times. Verified verbatim in
   `strale-io/strale-frontend@f704cb2:docs/website-redesign/homepage/use-case-search-web-intelligence-v1.6.md:35`
   and in the round-07 HTML keyframe under the same directory.
8. `DEC-20260827-A.md` line 40, `"licensed contract with the Austrian
   Justizministerium for direct Firmenbuch API access"` — checker miss.
   This is a byte-for-byte substring of the row's own Rationale field
   (confirmed directly in the parsed export): "This is the exact
   reactivation trigger named in DEC-20260427-I-6 ("licensed contract with
   the Austrian Justizministerium for direct Firmenbuch API access")".
9. `DEC-20260904-A.md` line 180, the `closes_when` quotation — checker
   miss. Verified verbatim (modulo the bold markdown markers, which the
   convention ignores) against `docs/project/m2-closure-register.yaml`
   lines 5154-5156: "Every row reaches formally_migrated,
   intentionally_historical, or obsolete_or_superseded through
   contradiction-checked batches, or an explicitly reviewed rule classifies
   pre-readiness feature-scope rows as evidence-only."
10. `DEC-20260904-B.md` line 102, `"where did this id's authority come
    from"` — checker miss. Rhetorical phrase describing the grammar's
    purpose, not attributed to any external document; nothing in the record
    claims this string appears verbatim anywhere else.

Net: 9 of 11 residuals are checker misses (quotes faithful once resolved by
hand against the actual source); 2 are genuine quote-fidelity defects,
listed as findings below.

### Findings

1. **`docs/decisions/records/DEC-20260518-B.md`, line 55.** The Rationale
   section quotes: `lets the audit that followed this decision produce
   answers of the form "can this country deliver T1/T2/T3" rather than
   conflating the two questions`. The row's actual Rationale field reads:
   "...lets the audit produce per-country use-case verdicts (can country X
   deliver T1/T2/T3?) rather than just per-call data findings...". The
   record's quotation silently changes "can country X deliver" to "can
   this country deliver" and drops the question mark's clause structure —
   a changed word, not a punctuation/case/markdown difference the
   convention excuses. Evidence: parsed Notion row for
   `DEC-20260518-B` (page `36467c87082c81838cdac890814e2089`), Rationale
   field.

2. **`docs/decisions/records/DEC-20260518-D.md`, line 43.** The Rationale
   section quotes: `A customer reading the flag will reasonably expect a
   boolean answer to the second question ("does Strale return this
   today"), not the first.` The row's actual Rationale field reads:
   "...rather than capability state (does Strale return UBO data today for
   this country?). Customer reading the flag will reasonably expect a
   boolean answer to the second question." The quoted phrase "does Strale
   return this today" is not a substring of the source at all — the source
   phrase is "does Strale return UBO data today for this country?"; the
   record's version drops "UBO data" and "for this country," materially
   altering what was quoted (not just punctuation/case). Evidence: parsed
   Notion row for `DEC-20260518-D` (page `36467c87082c818a914dddd0e74544dc`),
   Rationale field.

3. **`docs/decisions/records/DEC-20260515-A.md`, Consequences section**
   (the paragraph beginning "The commit id this row cites, `34036a0`, does
   not resolve on `main`."). This is a misattribution: `DEC-20260515-A`'s
   own Notion row never cites commit `34036a0` anywhere — its Rationale
   field discusses build economics and scope with no commit reference, and
   its Source field is null (confirmed directly in the parsed export). The
   commit `34036a0` is cited only in the sibling row `DEC-20260515-B`'s
   Source and Rationale fields ("Phase 3 US Topograph 14-state scout
   (commit 34036a0, doc apps/api/docs/us-topograph-state-scout-2026-05-15.md)"),
   where the identical sentence appears correctly in `DEC-20260515-B.md`'s
   own Consequences section. `DEC-20260515-A.md` appears to have copied
   this sentence from its sibling record without it being true of its own
   row. (The underlying fact — that `34036a0` does not resolve on `main` —
   is independently true; `git cat-file -e 34036a0` fails at the pinned
   commit. The defect is the attribution of that citation to "this row,"
   i.e. `DEC-20260515-A` itself, which is false.)

No other findings. All 41 frontmatter blocks parse; `record_key`, `id`, and
filename agree in every case (script-checked, zero mismatches). All 41
files carry the CAUTION banner and all five protected sections
(script-checked, zero mismatches). No null field is quoted and no
populated field is called null in any of the roughly 20 explicit
null/non-null claims checked (e.g. `DEC-20260507-I`'s "Superseded By is
null" / "Source field is null", `DEC-20260511-E`/`-F`'s "Superseded By and
Outcome are both null", `DEC-20260513-A`'s "Rationale field is null; its
Source field is also null" — all confirmed against the parsed rows). Every
plain-path evidence entry across all 41 records exists at the pinned
commit (script-checked, zero missing). Every cross-repo/commit-qualified
evidence entry resolves: five `strale-io/strale-frontend@...` entries
(`DEC-20260513-A`, the four `DEC-20260820-*` records) verified via `git
cat-file -e` against the fetched sibling checkout; the
`strale-io/strale@3f7f650...` entry (`DEC-20260822-A`) and the
`codex/repo-native-operating-model@b295...:archive/imports/context-pack/...`
entry (`DEC-20260901-A`) verified via `git cat-file -e` against the main
repository. Every declared relation target (`DEC-20260508-A` to
`DEC-20260507-H`, `DEC-20260508-D` to `DEC-20260505-H`, `DEC-20260511-B` to
`DEC-20260503-B`, `DEC-20260511-C` to `DEC-20260420-A`, `DEC-20260511-E` to
`DEC-20260511-F`, `DEC-20260515-A` to `DEC-20260430-A`, `DEC-20260515-B` to
`DEC-20260515-A`, `DEC-20260518-C` to `DEC-20260518-B`, `DEC-20260518-F`
and `DEC-20260813-A` to `DEC-20260428-A`, `DEC-20260518-G` to
`DEC-20260518-E`, `DEC-20260812-A` to `DEC-20260503-A`, `DEC-20260813-A` to
`DEC-20260518-F`, `DEC-20260815-A` to `DEC-20260812-A`, `DEC-20260820-D/F`
to `DEC-20260820-C` and siblings, `DEC-20260822-A` to `DEC-20260815-A`,
`DEC-20260901-A` to `DEC-20260831-A`) resolves to an existing record file
at the pinned commit and is substantiated in the citing record's own
Context/Rationale/Consequences prose. None of these targets, nor any id
named elsewhere in the partition (`DEC-20260503-C`, `DEC-20260506-D`,
`DEC-20260513-F`, `DEC-20260427-I-6`), appears in
`docs/decisions/id-collisions.yaml` as a bare collided id; `DEC-20260503-C`,
`DEC-20260506-D`, `DEC-20260513-F`, and `DEC-20260427-I-6` are confirmed
absent as formal records or register/collision entries, matching what
each citing record itself claims. None of the 41 records in this
partition is `--notion-`/`--git-` qualified, so the registry-binding check
(item 8 of the task) does not apply to any file here.

### Ten "status on" code-claim spot checks (of many more verified in passing)

1. `DEC-20260508-D.md` — `apps/api/src/capabilities/german-company-data.ts:21`
   fetches `https://api.openregister.de`; line 99 reads
   `process.env.OPENREGISTER_API_KEY`. Matches the claim. `config/env-manifest.yaml:788-794`
   confirms `holder: railway`, `required_in: [production]`.
2. `DEC-20260508-A.md` — `manifests/hungarian-company-data.yaml:54` states
   `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator...)`;
   `config/env-manifest.yaml:777` carries the `OPENAPI_ENABLED` row. No
   `occsz`/`magyar cegadat`/`e-cegjegyzek` string appears in the manifest.
   Matches.
3. `DEC-20260510-A.md` — `handoff/README.md:1-5` reads "auto-generated
   index... Regenerated by `npm run archive:index`... Do not edit by
   hand." Matches.
4. `DEC-20260511-B.md` / `DEC-20260511-C.md` — `apps/api/src/lib/startup-migrations.ts:610`
   defines `runMigration0066_ensureEligibilityColumnAndReconcile`; line 627
   contains `SET scheduled_testing_eligible = (ts.external_cost_cents = 0)`.
   `apps/api/drizzle.config.ts` exists; `apps/api/package.json:61` lists
   `"drizzle-kit": "^0.31.10"`; `.github/workflows/ci.yml:176` runs `npx
   drizzle-kit push --force`. All match the records' claims.
5. `DEC-20260511-E.md` / `DEC-20260511-F.md` — `apps/api/src/lib/meta-monitoring.ts`
   carries the cited "MAX(created_at)" staleness-anchor comment and "Per
   DEC-20260511-E" citations at the claimed locations.
   `apps/api/src/jobs/daily-digest.ts:5` reads "Usage: cd apps/api && npx
   tsx src/jobs/daily-digest.ts"; no `daily-digest` reference exists in
   `.github/workflows/`; `apps/api/src/routes/admin.ts` carries the digest
   trigger route; a grep for `sendInterruptEmail` outside
   `interrupt-sender.ts` returns nothing. All match.
6. `DEC-20260513-B.md` — `manifests/swiss-company-data.yaml`'s
   `known_answer.input.uid` is `CHE-101.602.521` (not the original bad
   `CHE-105.805.977`, which appears only in an unrelated `output_schema`
   example). `apps/api/src/routes/admin.ts` carries
   `POST /reset-circuit-breaker`; `apps/api/src/db/schema.ts`'s
   `capability_health` table has no `pinned`/`manual_override` column.
   Matches.
7. `DEC-20260513-C.md` — `apps/api/src/jobs/test-scheduler.ts` carries the
   `slugStaggerMinute` function citing "post-DEC-20260513-D" and the
   `findOverdueSuites` predicate `abs(hashtext(c.slug || ':' ||
   ts.test_type)) % 60 = EXTRACT(MINUTE FROM NOW())::int`, exactly as the
   record describes (including the cross-DEC-id discrepancy the record
   itself flags).
8. `DEC-20260518-A.md` / `DEC-20260518-D.md` — `apps/api/src/capabilities/uk-company-data.ts:226`
   sets `o.ubo_availability = "available"`;
   `apps/api/src/capabilities/danish-company-data.ts:183` sets
   `o.ubo_availability = "unavailable_no_registry"`. Matches both records'
   claims exactly.
9. `DEC-20260515-A.md` / `DEC-20260515-B.md` — no `us-ny-company-data`,
   `us-co-company-data`, `us-fl-company-data`, `us-ma-company-data`,
   `us-wa-company-data`, `us-tx-company-data`, or `us-sam-entity` manifest
   exists under `manifests/`. `apps/api/src/capabilities/us-company-data-cobalt.ts`
   covers all 50 states via `COBALT_API_KEY`. `docs/company/DECISION-QUEUE.md`'s
   DQ-30 entry states "leave Cobalt, EINsearch and sec-api in place, he
   will activate them later" as claimed. `apps/web` does not exist in this
   repository (`ls apps/` lists only `api`), as `DEC-20260513-A.md` also
   states. Matches.
10. `DEC-20260827-A.md` — `gh pr view 410 --repo strale-io/strale` returns
    `state: MERGED`, `mergedAt: 2026-08-27T20:09:11Z`, title "feat(at):
    migrate austrian-company-data to the official Firmenbuch HVD API".
    Matches the record's Outcome claim.

Bonus (11th, not required): `DEC-20260518-C.md` — `manifests/uk-cop-check.yaml:223`
references "the SEPA VoP capability (Digiteal)"; a grep for
`digiteal`/`sepa-vop` under `apps/api/src/capabilities/` returns nothing.
Matches the record's claim that no Digiteal handler was ever built.

### Unverifiable

Nothing in this partition was left unverifiable. The Notion pages behind
`DEC-20260511-D`'s `Source` field (the separate vendor-evaluation
methodology page, `35d67c87082c819f9cecd689c6fa5d10`) and behind two other
non-DB-row evidence URLs in this partition are referenced only as pointers
("the row's Source property points to the separate methodology page"),
never quoted, so no page-body fetch was required for them under rule (c).

### Summary

41 records reviewed. 3 findings: two quote-fidelity defects
(`DEC-20260518-B.md` line 55, `DEC-20260518-D.md` line 43) and one
misattributed-commit-citation defect (`DEC-20260515-A.md`, Consequences
section, the `34036a0` paragraph). All other checks (frontmatter,
protected sections, null-field claims, evidence existence, relation
substantiation, collision-registry absence, ten-plus code-claim spot
checks) passed clean.

PARTITION VERDICT: FAIL

### P5

# Closing review, round 9 (final round), Partition P5

Commit reviewed: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`
Record count: 34 files (18 historical-ID collision groups: DEC-20260225-P-c5d6,
DEC-20260303-A, DEC-20260304-A, DEC-20260304-B, DEC-20260304-C, DEC-20260320-C,
DEC-20260320-J, DEC-20260320-K, DEC-20260405-B, DEC-20260406-A, DEC-20260406-B,
DEC-20260406-C, DEC-20260409-C (single formal record; sibling row is
`documented_only`), DEC-20260420-D (single formal record; sibling row is
`documented_only`), DEC-20260420-E, DEC-20260420-F, DEC-20260420-G,
DEC-20260420-H).

This session did all work itself in one detached worktree
(`C:/tmp/strale-closing9-P5`, `npm ci` completed), read Notion rows only
through `dump_rows.py`, and did not launch a sub-agent.

### Method

I authored one script (`/tmp/verify_residuals.py`, not committed) whose
logic is: for every residual the operator checker reports for a record,
gather that record's evidence-array Notion page id(s) from its frontmatter,
pull every non-null string field of the corresponding row(s) from the
`dump_rows.py` export, normalize both the residual span (splitting on
ellipsis segments) and every row field under the task's stated convention
(EUR/x/>=/<=/->/... transliteration, lowercase, strip non-alphanumerics),
and report which row field (if any) contains the span as a substring. This
re-implements the checker's own matching logic but searches every field of
the record's own cited row directly, rather than relying on the operator
script's paragraph/page-id-proximity heuristic for locating "which row to
search." I ran this after first running the operator checker itself
(`node scripts/m2-quote-fidelity.mjs --export <export> --frontend
C:/Users/pette/Projects/strale-frontend --min-chars 12`) over the whole
corpus and filtering its JSON output to my 34 files.

I also wrote small verification scripts for: frontmatter/record_key/id/
filename agreement and the five protected sections + CAUTION banner (all
34 files, script-checked); evidence-path existence (script-checked, repo
paths and directories); relation-target existence and bare-collided-id
check against `docs/decisions/id-collisions.yaml` (script-checked); the
`Superseded By`/`Outcome`/`Rationale` null-field claims against the actual
export (script-checked); and the id-collisions.yaml + m2-closure-register.yaml
double binding for every `--notion-` qualified file in my partition
(script-checked, all 34 pass with `disposition: formal_record` +
`record_key` match in the collision registry and `disposition:
formally_migrated` + matching `record_key` in the closure register's
`public_rows`).

### Checker residuals for my partition (89 spans across 22 files, min-chars 12)

Every residual was individually checked against the record's own cited
Notion row (via the manual script above) or, where the residual was a
figure or a repo-file claim, against the cited repo file directly.

**88 of 89 residuals are checker misses**: each quoted span is a faithful,
in-order (segment-respecting) substring of the record's own cited row field
(overwhelmingly `Rationale`, occasionally `Decision`, `Outcome`, or
`Context`/free-text page-body content folded into `Rationale` in the
export). The checker's paragraph/page-id-proximity heuristic for picking
which candidate source to compare against evidently does not always locate
the record's own primary row when the surrounding prose doesn't name a page
id or another record's id right next to the quote (e.g. "The row's own
Rationale states..." with no id token nearby), so it falls back to whatever
unrelated source shares the longest coincidental character run and reports
that as `bestMatch` with a low `prefixLength`, then marks the span residual.
This is the same checker-miss pattern the round 2 through round-8 review
records already documented at scale. Full list, file by file, with my
classification of each:

- `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md` L36
  "Unmet Demand Ledger", L39 the "Here are 47 requests..." quote: both
  faithful substrings of this record's own row `Rationale`. Checker miss.
- `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md` L75, L81,
  L95: all three faithful substrings of the row's own `Rationale`. Checker
  miss.
- `DEC-20260303-A--notion-31867c87082c813198e2da8e3d02b531.md` L78
  "tangled multicolor vs clean green": faithful substring of the row's own
  `Rationale`. Checker miss (the checker's best match pointed at the
  frontend file instead, which also discusses the diagram but does not
  contain this exact phrase as a contiguous run).
- `DEC-20260304-A--notion-31867c87082c812c9ccef7f58256f40a.md` L28, L39,
  L57, L67, L73 (x2), L84, L87, L99, L103, L109: all eleven faithful
  substrings of the row's own `Rationale` and/or `Decision` fields
  (repeated "Built for Agents" occurs multiple times in the row text
  itself). Checker miss.
- `DEC-20260304-A--notion-31967c87082c8185b0a6c33de2293215.md` L38, L39,
  L58, L78: all four faithful substrings of the row's own `Rationale`
  (the checker mis-scored the euro-sign transliteration cases). Checker
  miss.
- `DEC-20260304-B--notion-31967c87082c81dda9c4f43b5b7674b3.md` L28, L34,
  L36, L37, L43, L67: all six faithful substrings of the row's own
  `Decision`/`Rationale`. Checker miss.
- `DEC-20260304-C--notion-31867c87082c810197f9efa520332024.md` L75
  "lighter border": faithful substring of the row's own `Rationale`.
  Checker miss.
- `DEC-20260304-C--notion-31967c87082c815cb440e586e783df0a.md` L46 "a
  trust violation worse than showing nothing.": faithful substring of the
  row's own `Rationale`. Checker miss.
- `DEC-20260320-C--notion-32967c87082c81bfa5d1ee04b7d753dc.md` L72, L85,
  L89: all three faithful substrings of the row's own `Rationale`.
  Checker miss.
- `DEC-20260405-B--notion-34a67c87082c810692c8dd4374a6f9ac.md` L76 "no
  free source for Swedish credit ratings exists": faithful substring of
  the row's own `Decision`. Checker miss.
- `DEC-20260406-A--notion-33967c87082c816b825cdf812ef006b8.md` L48, L88:
  both faithful substrings of the row's own `Outcome` field (the page-body
  export folds a later status update into `Outcome`, which the checker did
  not search). Checker miss.
- `DEC-20260406-A--notion-33a67c87082c81bdb38fd9eeaa556d98.md` L80, L84:
  both faithful substrings of the row's own `Rationale`. Checker miss.
- `DEC-20260406-B--notion-33967c87082c8103becfe4900a1ff319.md` L93 "10 new
  test cases": faithful substring of the row's own `Outcome`. Checker
  miss.
- `DEC-20260406-B--notion-33a67c87082c81629339d9f208f65f52.md` L87
  "four-layer model: canonical pages / databases / archives /
  not-Strale.": faithful substring of the row's own `Rationale`. Checker
  miss.
- `DEC-20260406-C--notion-33a67c87082c814b8afafb2e1c6ca317.md` L33, L57:
  both faithful substrings of the row's own `Rationale`. Checker miss.
- `DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md` L29, L30,
  L34, L82, L92: all five faithful substrings of the row's own
  `Rationale`. Checker miss. (This record's Consequences section also
  contains the "VOICE.md states five writing rules... 'No jargon, ever'"
  claim, already withdrawn by `DEC-20260905-C` item 31; I confirmed
  `docs/company/VOICE.md`'s first rule now reads "Use audience-appropriate
  terms (DEC-20260905-A)" and contains no "No jargon, ever" text, so the
  withdrawal is itself accurate. Not a fresh finding here per the task's
  rule (a).)
- `DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md` L46, L50,
  L52: all three faithful substrings of the row's own `Rationale`.
  Checker miss.
- `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md` L42, L50,
  L51, L54, L76, L103, L111: all seven faithful substrings of the row's
  own `Rationale`/`Decision`. Checker miss. (The 342/127 manifest-count
  figure here is a dated observation already addressed by DEC-20260905-I's
  "Not adopted" list; not re-flagged.)
- `DEC-20260420-E--notion-34867c87082c81b590b4e8bee4b59228.md` L41, L43,
  L44, L46, L48, L54, L58: all seven faithful substrings of the row's own
  `Rationale`/`Decision`. Checker miss.
- `DEC-20260420-F--notion-34867c87082c810b8547fccb3e75c61b.md` L45, L48,
  L50, L52, L56, L58, L115: all seven faithful substrings of the row's own
  `Rationale`. Checker miss.
- `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md` L38, L43,
  L47, L50, L51, L54, L57, L63, L114: all nine faithful substrings of the
  row's own `Rationale`. Checker miss.
- `DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md` L50, L56,
  L57, L58, L61, L63, L64, L69, L155: nine of the ten residuals are
  faithful substrings of the row's own `Rationale` (the export folds the
  row's page-body sections, including one literally headed "## Outcome",
  into the `Rationale` field; the DB `Outcome` property itself is null).
  Checker miss. **The tenth, L70, is a genuine defect** (see Finding 1
  below): not found anywhere in the row.

No residual in my partition traced to any other file's content, a
fabricated number, or a misattributed source, except the one item below.

### Findings

1. **`docs/decisions/records/DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`,
   lines 68-70 (Context section).** The record reads: "The row's own
   References name every prior decision in the same migration series by
   letter: "DEC-20260420-A through DEC-20260420-G (complete SA.2 + F-A
   series)." Read together with the row's own subject ("the SA.2 + F-A
   series"), this collapsed range names the technical continuation row of
   each collision it can reach a formal record for..." The first
   quotation is faithful (verified against the row's own `Rationale`
   field, which literally contains "Prior DECs: DEC-20260420-A through
   DEC-20260420-G (complete SA.2 + F-A series)."). **The second quotation,
   "the SA.2 + F-A series," attributed to "the row's own subject," is not
   a literal quotation from the row.** I dumped every field of this row
   (page id `34867c87082c81c6a58dfbc5f46ed3f6`) via `dump_rows.py`: there
   is no field named "subject" on the row (fields present: `Status`,
   `userDefined:ID`, `Related Feature`, `Rationale`, the date fields,
   `Outcome`, `Superseded By`, `Scope`, `Source`, `Confidence`,
   `Reviewed`, `Decision`), and a full-text search of every populated
   field for the normalized string "SA.2 + F-A series" finds exactly one
   occurrence, inside the longer phrase "complete SA.2 + F-A series" (the
   same phrase already correctly quoted three lines earlier). "the SA.2 +
   F-A series" is not a separate, independently-occurring phrase anywhere
   in the row; it is this record's own paraphrase of "complete SA.2 + F-A
   series" (substituting "the" for "complete"), presented inside
   quotation marks and attributed to a row field/subject that does not
   exist. This is the same class of defect the amendment records in this
   corpus (e.g. `DEC-20260905-C` item 30's "read-time decay eliminated,
   write-time decay in force" correction) treat as a withdrawal-worthy
   fabricated quotation: a paraphrase presented as the row's own literal
   words. Evidence: `dump_rows.py` export for page
   `34867c87082c81c6a58dfbc5f46ed3f6` (field `Rationale`, the only
   occurrence of "SA.2 + F-A series" reads "complete SA.2 + F-A series");
   the record file itself, lines 68-70.

I found no other false, fabricated, misattributed, or unverifiable claim
in my partition. All 34 files pass: frontmatter `record_key`/`id`/filename
agreement; the CAUTION banner and all five protected sections present;
every `evidence` path exists at this commit (including the 14 distinct
`strale-io/strale-frontend@04c9fca9:<path>` cross-repo entries, all
resolved via `git -C .../strale-frontend show 04c9fca9:<path>`); no null
row field is quoted as if populated and no populated field is called null
(script-verified against the export for every "Superseded By"/"Outcome"/
"Rationale ... null" claim in the partition: 34/34 consistent); every
relation target exists as a record key at this commit and is not a bare
collided id; and the `--notion-` collision-registry / closure-register
double binding (checklist item 8) is correct for all 34 qualified records
(`disposition: formal_record` + matching `record_key` in
`id-collisions.yaml`, and `disposition: formally_migrated` + matching
`record_key` in `m2-closure-register.yaml`'s `public_rows`).

One relation initially looked unsubstantiated by a naive "is the target id
literally present in the body" script check:
`DEC-20260420-H--notion-34867c87082c81c6a58dfbc5f46ed3f6.md`'s frontmatter
declares `related_to` edges to `DEC-20260420-E--notion-...b590b4e8bee4b59228`
and `DEC-20260420-F--notion-...810b8547fccb3e75c61b`, and neither qualified
key nor the bare `DEC-20260420-E`/`DEC-20260420-F` string appears in the
body. On reading the body (lines 68-79), the record does substantiate both
relations by unique subject-matter identification rather than by ID: it
names "F-A-005" and "F-A-006/007" as the two continuation rows the
collapsed "DEC-20260420-A through DEC-20260420-G" range covers, and those
codenames are independently confirmed elsewhere in this same batch (e.g.
`DEC-20260420-G--notion-...c38c3acaca5d01d6ef.md`'s own line 63: "DEC-
20260420-E (F-A-005 free-tier redaction), DEC-20260420-F (F-A-006/007 HMAC
token lifecycle)") to be the unambiguous codenames for exactly those two
target records. This matches the substantiation convention this review
series has already applied elsewhere (e.g. `DEC-20260905-H` items 2-3,
identifying a target "by its unique subject matter, even though the ID is
not spelled out"). Not a finding.

### Ten code-claim spot checks

1. `DEC-20260225-P-c5d6--notion-31267c87082c81279b14f3859f6f2038.md`
   (Consequences): `apps/api/src/db/schema.ts:681-697` defines
   `failedRequests` / `failed_requests` with exactly the columns claimed
   (`id`, `userId`, `ipHash`, `task`, `category`, `maxPriceCents`,
   `failureType` default `"no_match"`, `errorDetail`, `userAgent`,
   `createdAt`). Confirmed.
2. `DEC-20260303-A--notion-31867c87082c812dba47c52f4f36ca33.md`
   (Consequences): `apps/api/src/routes/suggest.ts:43,83` define `GET
   /v1/suggest/typeahead` and `POST /v1/suggest` exactly as claimed.
   Confirmed.
3. `DEC-20260304-B--notion-31867c87082c81a4b2f7ccdd52b99b1e.md`
   (Consequences): `strale-io/strale-frontend@04c9fca9:src/components/
   StatsStrip.tsx`'s `buildStats()` returns exactly the four stats
   claimed ("workflows" hardcoded 100, "capabilities" live, "automated
   tests" hardcoded 1500, "free — no signup" live) with the header
   comment quoted verbatim. Confirmed.
4. `DEC-20260320-C--notion-32967c87082c81178c7acc8b5c396aa3.md`
   (Consequences): `apps/api/src/capabilities/auto-register.ts:19-21`'s
   header comment reads exactly the quoted "The previous filesystem-glob
   discovery pulled in test files... Manifest is the source of truth —
   matching..." Confirmed.
5. `DEC-20260320-J--notion-32967c87082c8177a82be21d48f57411.md`
   (Consequences): `apps/api/src/lib/platform-facts.ts:14-15,20-21`'s
   header contains the quoted "free-tier list: 5 in marketing, 11 in
   manifests, 5 different in production" and "Live values (capability
   counts, country counts, free-tier slugs) are computed from the DB on
   demand and cached at the route layer" verbatim. Confirmed.
6. `DEC-20260405-B--notion-33967c87082c810c920dd09d78aa06b6.md`
   (Consequences): `apps/api/src/db/schema.ts:332,334` define
   `transactions.capabilityId` (nullable, comment "solution executions
   have no single capability") and `transactions.solutionSlug` (comment
   "set for solution executions, null for capability executions") exactly
   as claimed; no `solution_executions`/`solution_run`/`parent_transaction`
   table exists in the file. Confirmed.
7. `DEC-20260409-C--notion-33d67c87082c81c19655cb04fb7d3ecf.md`
   (Consequences): `apps/api/src/lib/gate4b-solution-dryrun.ts:2` header
   reads "Gate 4b — Solution Dry-Run Composition Check (DEC-20260409-D
   Layer B)" exactly as claimed. Confirmed.
8. `DEC-20260420-D--notion-34867c87082c81f0827eedf29d133600.md`
   (Consequences): `apps/api/src/lib/audit-helpers.ts:40` reads "SA.2b.d:
   heuristic `detectPersonalData` was removed after migration 0050"
   exactly as claimed. Confirmed. (The 342/127 manifest count and the
   "PII_CATEGORY_ENUM ... unconditionally" claim in the same section are
   both dated/superseded observations already addressed by
   `DEC-20260905-I`'s "Not adopted" note and `DEC-20260905-C` item 34
   respectively; not re-flagged.)
9. `DEC-20260420-G--notion-34867c87082c81c38c3acaca5d01d6ef.md`
   (Consequences): `apps/api/src/routes/verify.ts:19,24,29,256,362`
   define `MAX_DEPTH = 50` and carry the two quoted F-A-012 comments and
   the two `truncated_reason` comments claimed; `apps/api/src/routes/
   transactions.ts:200` independently defines `AUTH_VERIFY_MAX_DEPTH =
   50` on the authenticated path, matching the claimed second constant.
   Confirmed.
10. `DEC-20260420-H--notion-34867c87082c81b58b36de5f71c0937f.md`
    (Consequences): `docs/strategy/2026-08-05-direction-plan.md:14`
    contains "This plan commits to the library as the product" and does
    NOT contain the literal string "library-as-product" (confirmed by
    grep); consistent with this file's own correct account (which cites
    `CLAUDE.md`, not the direction-plan document, for the compound-word
    phrase) and with `DEC-20260905-H` item 1's withdrawal of the sibling
    record's wrong attribution. Confirmed.

### Unverifiable

None. Every claim in my partition that named a repository file, a
cross-repo frontend file, a Notion row field, or a registry/closure-
register binding was checked and resolved (faithful, or, in the one case
above, found to be a fabricated paraphrase). No claim required
`notion-fetch` beyond the one page-body lookup I performed while tracing
`DEC-20260406-C--notion-33a67c87082c819cabf6d47331d695ce.md`'s second
evidence entry (page `33a67c87082c812d8ebdc1899526dd83`): that page
resolved to a real, superseded "Working Rules" page whose own body
contains the Rule E text this record's Decision/Context sections describe,
confirming the evidence citation is a legitimate corroborating source, not
a fabrication.

PARTITION VERDICT: FAIL

### P6

# Closing review round 9 (round 2 of the final closing review) — Partition P6

Commit reviewed: `fcfceb59f68228c0e9910581a67e67b1810ee1fa`
Partition: P6, 39 records (list: `closing9-P6.txt`)
- 32 `--notion-` qualified collision records: `DEC-20260420-I` (x2), `DEC-20260420-J`, `DEC-20260420-K` (x2), `DEC-20260421-A` (x2), `DEC-20260421-B` (x2), `DEC-20260421-C` (x2), `DEC-20260421-D` (x2), `DEC-20260502-A`, `DEC-20260505-D` (x2), `DEC-20260505-E` (x2), `DEC-20260507-A` (x2), `DEC-20260507-B`, `DEC-20260507-C` (x2), `DEC-20260508-B` (x2), `DEC-20260508-C` (x3), `DEC-20260512-A` (x2), `DEC-20260513-F` (x2)
- 1 `--git-` qualified record: `DEC-20260422-A--git-3b256587`
- 8 amending records: `DEC-20260905-B` through `-I` (the closing-review-corrections chain itself)

### Method

Set up a detached worktree at the reviewed commit (`git worktree add --detach`), ran `npm ci` there. Read every one of the 39 records in full. For frontmatter/structure, ran a small Python script checking: (1) frontmatter parses, `record_key`/`id`/filename agree (qualified filename = `<key>.md`, `id` = key with qualifier stripped); (2) the CAUTION banner and all five protected section headings (`## Decision`, `## Context`, `## Rationale`, `## Consequences`, `## Reversal conditions`) are present; (5) every non-URL `evidence:` path exists as a file at the reviewed commit; (6) every `relations[].target` resolves to an existing `record_key` in the corpus and is never a bare id listed in `docs/decisions/id-collisions.yaml`. All 39 records passed all of these mechanical checks with zero findings.

For quotation fidelity (3)/(4), dumped every Notion page cited as `evidence[0]` for the 32 collision records via `python dump_rows.py <out.json> PAGE:<id> ...` (one batch call, 32 pages, all succeeded), and manually compared every double-quoted span of meaningful length in each record against the corresponding Decision/Rationale/Context/Source/Outcome field, applying the stated normalization convention (transliterate €/×/≥/≤/→/…, lowercase, strip non-alphanumerics, ellipsis splits into ordered segments). Also verified the two cross-repo `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` evidence entries directly against that commit in the sibling checkout.

Then ran the operator checker: `node scripts/m2-quote-fidelity.mjs --export <scratchpad>/decisions-export-raw.txt --frontend <strale-frontend checkout> --min-chars 12 --json p6-fidelity.json` over the whole corpus (239 records) and filtered its `perRecord` output down to my 39 files.

For (7), verified 12 "status on" code claims directly against files at the reviewed commit (listed below, well over the required 10).

For (8), checked every one of the 32 qualified records' collision entry in `docs/decisions/id-collisions.yaml` (all `disposition: formal_record`, `record_key` matching) and its corresponding row in `docs/project/m2-closure-register.yaml` (all `disposition: formally_migrated`, same `record_key`), via a Python/PyYAML script over both files.

### Findings

1. **`docs/decisions/records/DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md:59`** — quotation defect. The record's Context section reads: `sibling row `DEC-20260421-D--notion-34867c87082c81a2a12cc95010bf25bf` ("Phase 4 split into 4a and 4b") names as its own headline problem`, presenting `"Phase 4 split into 4a and 4b"` as that sibling record's title/name. Fact: the sibling record's own frontmatter `title` (and its underlying Notion row's Decision field, page `34867c87082c81a2a12cc95010bf25bf`, confirmed via `dump_rows.py`) reads "DEC-20260421-D — Phase 4 split into 4a (authority enforcement) and 4b (manifest completeness + bulk regen)". The parenthetical qualifiers `(authority enforcement)` and `(manifest completeness + bulk regen)` are dropped from the quotation with no ellipsis marker, so the quoted string is not a substring of the named source under the stated convention (a dropped span without an ellipsis is a defect regardless of size). The checker independently flagged this residual (best match `notion:DEC-20260421-D`, prefix length 18, i.e. it matches only up to "Phase 4 split into" before diverging). This does not disturb the record's substantive claim (the two records do describe the same authority-gap example); only the compressed quotation form is a defect. Not withdrawn by any of `DEC-20260905-B` through `-I` (grepped for "Phase 4 split into 4a" across all eight amending records; no match). Judged not verdict-determining on its own (a single dropped-parenthetical quotation of a sibling record's own title, the same class of minor byte-level defect prior rounds recorded without failing the reporting partition, e.g. round 3's P4 finding on `DEC-20260515-C`).

No other findings across the 39 records. Every other double-quoted span checked against its named Notion field, repository file, or sibling record matched under the stated normalization convention. All evidence paths resolve. All relation targets resolve and none is a bare collided id. All 32 qualified records' collision-registry and closure-register bindings match exactly (`disposition: formal_record` / `formally_migrated`, identical `record_key`).

Two items already corrected by the amending-record chain and therefore not findings against the original records (per rule (a) of this round's brief), confirmed present as expected:
- `DEC-20260505-E--notion-35767c87082c813481a8efa27ea37438` (HMRC) still states "eight `HMRC_*` rows" while listing only 7 — withdrawn by `DEC-20260905-B` item 7. Confirmed `config/env-manifest.yaml` carries exactly 7 `HMRC_*` rows at this commit.
- `DEC-20260421-C--notion-34967c87082c81bd8c6bf8e92e901711` (no-scraping commitment) states "migrated to a direct API or a licensed aggregator", dropping "government-registry"/"commercial" qualifiers from the row's actual text — withdrawn by `DEC-20260905-D` item 9.

One structural omission noted, not a finding (per `DEC-20260905-F`'s own "Not adopted" list, which names this exact record and classifies it the same way): `DEC-20260507-C--notion-35967c87082c817cad56ec58c707d895` declares `relations: []` in frontmatter while its Rationale states it "Supersedes IT/ES/PT/AT rows in DEC-20260427-I" — an omission, not a false or unverifiable claim, so not a finding under this round's rule.

### Checker residuals for this partition (min-chars 12, full-corpus run filtered to P6's 39 files)

| File | spans | faithful | residual |
|---|---|---|---|
| DEC-20260421-C--notion-34867c87082c81a6bb52ca8dbd61dc25.md | 8 | 7 | 1 |
| DEC-20260905-C.md | 156 | 72 | 84 |
| DEC-20260905-D.md | 73 | 71 | 2 |
| DEC-20260905-F.md | 16 | 10 | 6 |
| DEC-20260905-G.md | 32 | 31 | 1 |
| all other 34 files in the partition | — | — | 0 |

Classification:
- **DEC-20260421-C--...a6bb52ca8dbd61dc25.md line 59** — real defect. See Finding 1 above.
- **DEC-20260905-C.md, 84 residuals** — checker misses. Sampled several (lines 375, 380, 382, 388, 394, 403, 406, 411, and others): every one is a mid-sentence fragment of that record's own recurring `"<quote>" ... Fact: ... reads "<quote>"` sentence shape, where the checker's span extractor lands its boundary in the connective prose (`to `CLAUDE.md`. Fact: ...`, `. Fact, as the row's ... fields read (page ...): Decision: "`, etc.) rather than on a genuine quotation's own boundary — the exact self-referential parsing artifact `DEC-20260905-D`, `-E`, `-F`, `-G`, and `-H` each document and quantify (downstream of the escaped-quote at `DEC-20260905-C.md:373` that desyncs the checker's quote-pairing for the rest of the file). Not a withdrawal target; consistent with every prior round's own reconciliation of this exact file.
- **DEC-20260905-D.md, 2 residuals** (lines 429, 451: `"the checker missed it"`, `"checker miss, faithful to a source"`) — checker misses. Both are `DEC-20260905-D` quoting its own rationale prose about round 2's reconciliation practice (self-quotation of the same record's own earlier text), not an attributed source quotation.
- **DEC-20260905-F.md, 6 residuals** (lines 176, 213, 249, 259, 275, 283) — checker misses. Read each in context: line 176 ("not narrated at all") and 259 are self-referential descriptions of the reviewing method and the same self-quotation/parsing-artifact class `-F` itself names; 213 and the remainder are `-F`'s own prose describing its findings and its "Not adopted" list, quoting nothing external. None is an attributed quotation of a repo file, Notion row, or sibling record that fails to contain it.
- **DEC-20260905-G.md, 1 residual** (line 348: `"Rule (a) cross-check"`) — checker miss. This is `-G` quoting P3's own round-6 partition report ("its 'Rule (a) cross-check' table entry for `DEC-20260430-A`"), a source the checker's file/export/frontend inputs do not include (partition reports are not part of the checked corpus), so the checker cannot locate it; the quotation itself is not disputed and is not a repository-state or Notion-row claim.

### Ten (plus two) code-claim spot checks

1. `manifests/estonian-company-data.yaml:104` — known_answer input `registry_code: "17449106"`; line 54 `company_name: Bolt App Services AS`. Matches `DEC-20260420-I--notion-...52904de`'s Consequences claim exactly.
2. `manifests/spanish-company-data.yaml` output_schema.example — `company_name: CONSTRUCCIONES AMENABAR SA`, `nif: A20072302`, no `cif` value or "Inditex" in that block (Inditex appears only in an unrelated limitations sentence at line 193, not the fixture). Matches the same record's contrasting claim.
3. `manifests/austrian-company-data.yaml:168` — `data_source: Firmenbuch (Republik Österreich, BMJ) via JustizOnline IWG/HVD API`. Matches `DEC-20260505-D--...d3897fe47a2ec7a4c1` and `DEC-20260508-C--...817eb9b5...`'s claims.
4. `manifests/dutch-company-data.yaml:55` — `data_source: Openapi.com WW-Top (Tier-3 vendor aggregator of EU company registries)`. Matches `DEC-20260508-C--...817eb9b5...` and `DEC-20260512-A--...29ef35f256d5958`.
5. `manifests/italian-company-data.yaml:70` and `manifests/portuguese-company-data.yaml:57` — `Openapi.com IT-Advanced` / `Openapi.com PT-Advanced`. Matches `DEC-20260505-D--...d3897fe47a2ec7a4c1` and `DEC-20260507-C--...c707d895`.
6. `apps/api/src/lib/platform-facts.ts:164,171` — `getActiveVendorNames()`/`getStaleVendorNames()` exported exactly there. Matches `DEC-20260507-A--...b0ad02d69148811b57`.
7. `apps/api/scripts/check-platform-facts-drift.ts:29-31,42` — header comment quoted verbatim by the same record matches exactly; imports only `getStaleVendorNames` (confirmed `getActiveVendorNames` is imported only by `platform-facts.test.ts:8`).
8. `apps/api/src/lib/trust-helpers.ts:367,386` — `"manifest_drift"` with the "PR #109 sentinel" comment, and `if (reason.startsWith("guaranteed_field_missing:")) return "manifest_drift";`. Matches `DEC-20260513-F--...9b79cb7d0367dc46` exactly, including the code comment's own citation to "DEC-20260513-B + DEC-20260513-C" (confirmed at line ~375).
9. `config/env-manifest.yaml:776,778` — `OPENAPI_ENABLED`/`OPENAPI_COM_EMAIL` cost_note/purpose text. Matches `DEC-20260507-C--...c707d895` verbatim.
10. `WORKTREES.md` exists at repo root. Matches `DEC-20260508-B--...814bbb8df7036fccf8e1`.
11. `apps/api/src/capabilities/auto-register.ts:173-174,259,262` — "Direct Registo Comercial / publicacoes.mj.pt integration queued as v1.1 / quality upgrade per DEC-20260507-C.", "Final EU30 country to reach code parity — Phase 2c completes 30/30.", "InfoCamere integration per DEC-20260507-C.". Matches `DEC-20260505-D--...81059f67e756f5c5eefa` and `DEC-20260507-C--...c707d895` exactly.
12. `apps/api/src/jobs/test-scheduler.ts:368,398-400,471` — `cost_class IN ('free_quota', 'paid_with_free_tier')` and `cost_class = 'free_unlimited' OR cost_class IS NULL`; `apps/api/src/lib/capability-persistence.ts:303,312` — "OUTSIDE the transaction. Design doc §4.3"; `apps/api/scripts/onboard.ts:135,147,151` — `--force-override-authority` guard "Cluster 2 Phase 4a", refused in `--batch` mode. All match `DEC-20260512-A--...8188a014f4b1f963cf77`, `DEC-20260421-B--...81dab702f98b2034aa5d`, and `DEC-20260421-D--...a2a12cc95010bf25bf` respectively.

Also confirmed the two cross-repo evidence entries directly: `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` renders the H1 "One API call.<br />Verified data your agent can trust." (line 145-147) and labels its second section `{/* 2. Solutions showcase (with discovery demo folded in) */}` rendering `<SolutionsShowcase />` (lines 215-217), matching `DEC-20260421-B--...828e3fe183dd5e8072` and `DEC-20260421-D--...810695c2e365deb8f2c8` exactly.

Also confirmed all 32 qualified records' `docs/decisions/id-collisions.yaml` entries (`disposition: formal_record`, matching `record_key`) and `docs/project/m2-closure-register.yaml` rows (`disposition: formally_migrated`, matching `record_key`) via script — all 32 pairs match with no discrepancy.

Also confirmed, for `DEC-20260422-A--git-3b256587`, that its cited files (`CLAUDE.md`, `docs/governance/protocols/DISTRIBUTION_PR_PREFLIGHT.md`, `archive/sessions/CONTAINMENT_REPORT.md`) exist, that its one direct quotation ("Shame on you") matches `CLAUDE.md` exactly, and that the cross-surface companion file it names (`archive/sessions/2026-09-04-m2-cross-surface-DEC-20260422-A-gaps.md`) exists.

### Anything unverifiable

Nothing in this partition was left unverified. Every Notion-attributed quotation was checked against the parsed export via `dump_rows.py`; every repository-file quotation was checked by reading the file at the reviewed commit; every cross-repo quotation was checked against the sibling checkout; every code claim sampled resolved definitively true or false against the file named. Point-in-time production/database-state claims that the records themselves flag as unresolved (InfoCamere/HMRC vendor-response outcomes, whether `coverage_via` shipped, GitHub branch-protection settings, Datavisie legislative status) remain exactly as unresolved as the records state them — these are not findings, since none of the 39 records asserts them as settled fact.

### PARTITION VERDICT: PASS

## Gate run

```
M2 closing review round 9 gate run at fcfceb59f68228c0e9910581a67e67b1810ee1fa, 2026-09-06T03:15:20Z
HEAD=fcfceb59f68228c0e9910581a67e67b1810ee1fa
npm ci: ok
=== npm run context:check

> context:check
> node scripts/check-project-context.mjs

project context check: warning-only (M2 candidate foundation)
  no warnings
exit=0
=== npm run context:test
✔ a quote present only in a referenced commit's message is found through that source (380.6273ms)
✔ a quote matching a commit message is NOT found when the sha does not exist in the repo (67.4955ms)
✔ a quote present only in another record's own Notion row (not its markdown body) is found by naming that record (5.6163ms)
✔ a quote matching text in an UNRELATED Notion row is reported as a residual, not faithful (23.7837ms)
ℹ tests 180
ℹ suites 0
ℹ pass 180
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1179675.6202
exit=0
=== node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs
✔ CLOSING_REVIEW_MUTATED: once recorded on the base, closing_review's identity fields and its presence are immutable (2783.1323ms)
✔ CLOSING_REVIEW_MUTATED: verdict, reviewed_at, and evidence are each individually covered (1966.4914ms)
✔ plan.review_route stays a blocking requirement when closing_review is present but not clean (938.7291ms)
✔ EXIT_GAP_NOT_BLOCKING isolates the plan.review_route branch: no closing_review at all, every other open bucket already covered (3709.7042ms)
ℹ tests 106
ℹ suites 0
ℹ pass 106
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 858750.5009
exit=0
=== node scripts/m2-closure-verify-private-rows.mjs
ok: 318 rows verified against strale-io/strale-context-archive@24713c48; 0 private next-batch candidates
exit=0
=== npm run programs:check

> programs:check
> node scripts/check-program-tracks.mjs

ok   docs/programs/brand-website/tracks.yaml
ok   docs/programs/cto-readiness/tracks.yaml
exit=0
=== npm run codex:check
  CX-11  high   PR #510 — drizzle-orm 0.38.4 -> 0.45.2 (T17 batch 2), with the DrizzleQueryError unwrap module and five routed readers
  CX-10  high   PR #513 — M2 batch 4: three engineering-convention rows (DEC-20260419-A, DEC-20260420-A, DEC-20260511-C) migrated to formal candidate records
  CX-9  high   PR #511 — DEC-20260422-A cross-surface collision resolved (G3 stage 2): protocol record DEC-20260422-A--git-3b256587, Notion row evidence-only
  CX-8  high   PR #509 — cross-surface identity mechanism (G3 stage 1): --git-<sha> record keys, DEC-20260904-B
  CX-7  high   PR #503 — G1 rule (DEC-20260904-A): 76 pre-readiness feature-scoped rows become evidence-only
  CX-6  medium PR #502 — capability input-shape guards: wrong-shaped list input must refuse, not crash
  CX-5  high   PR #500 — M2 batch: 2026-08 operating-window rows, seven formal candidate records
  CX-4  medium PR #499 — hono 4.12.8 -> 4.13.5, WP13 batch 1
  CX-1  high   PR #494 — withdrawn capabilities must not be advertised anywhere
  CX-2  medium PR #497 — the session gate stopped instructing removal of live worktrees
  CX-3  high   Retention: durable production-override records ride the compliance window
ok   codex re-review backlog
exit=0
=== npm run receipts:check
checked 35 archive/receipts/*.json files
ok   receipts contract
warn (9) — handoffs stating a bare test count with no receipt:
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t12-research-contract.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t13-design-tokens.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t14-cheap-extras.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-02-t5-cto-readable-structure.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-founder-answers-retention-and-wp13-track.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-03-handoff-gate-live-worktree.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-04-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
  HANDOFF_BARE_TEST_COUNT handoff/_general/from-code/2026-09-05-checkin-morning.md: states a test count with no archive/receipts/ link — write a receipt (npm run receipt) and cite it
exit=0
=== node apps/api/scripts/check-pii.mjs --strict
PII guard: clean — no unredacted person names or checksum-valid identifiers found.
exit=0
=== node apps/api/scripts/check-no-committed-secrets.mjs
check-no-committed-secrets: clean (3083 tracked files scanned)
exit=0
tree=0 uncommitted paths; HEAD still fcfceb59f68228c0e9910581a67e67b1810ee1fa
worktree remove failed (leave it; orchestrator cleans up after a junction check)
```

## Outcome

Round 9 found confirmed quotation-fidelity defects in four of the six
partitions (P2, P3, P4, P5), and the whole-corpus named-source quotation
sweep alongside it found a further set of misquotations,
misattributions, and unverifiable-source attributions the six partitions'
own sampling did not each independently surface, spread across all six
sweep reports. Every gate ran clean at this commit (exit 0 each; `npm run
context:check`, `npm run context:test`, `node --test
scripts/decision-records.test.mjs scripts/m2-closure-register.test.mjs`,
`node scripts/m2-closure-verify-private-rows.mjs`, `npm run
programs:check`, `npm run codex:check`, `npm run receipts:check`
(warn-only findings noted in the gate output, exit 0), `node
apps/api/scripts/check-pii.mjs --strict`, `node
apps/api/scripts/check-no-committed-secrets.mjs`); the run is valid. The
operator checker's full run at this commit (239 records, 1185 spans, 1087
faithful, 98 residual at the default threshold; 239 records, 1621 spans,
1505 faithful, 116 residual at `--min-chars 12`) is reconciled entry by
entry against every prior withdrawal record and every source the
partitions and the sweep located
(`scratchpad/residual-reconciliation-round9.md`,
`scratchpad/residual-reconciliation-round9-short.md`, not committed). The
sibling-state and absence-claim sweeps are not repeated this round: they
ran at commit `48339ec2` for `DEC-20260905-I`, and no candidate record
changed between that commit and this one except the addition of
`DEC-20260905-I` itself, so their ledgers stand unchanged. All confirmed
findings from the six partition reports and the six sweep reports, after
removing every statement already withdrawn by `DEC-20260905-B` through
`-I`, plus the relation gaps between `DEC-20260430-A` and
`DEC-20260428-A`/`DEC-20260428-B` re-substantiated as this round's own
fresh item, are addressed by `DEC-20260905-J`
(`docs/decisions/records/DEC-20260905-J.md`), which withdraws each false
or misattributed statement without editing the record it corrects. The
next closing round runs at the commit that merges this file and
`DEC-20260905-J` into `main`, and treats a statement withdrawn here, in
`DEC-20260905-B` through `-I`, or in `DEC-20260905-J`, as corrected, and
a relation substantiated in any of those records as substantiated.

VERDICT: FAIL
