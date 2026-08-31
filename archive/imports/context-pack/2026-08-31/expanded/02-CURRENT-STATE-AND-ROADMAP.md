# Strale — Current State and Roadmap

**As of:** 2026-08-31  
**Purpose:** one high-churn file that tells any clean Codex/Claude session what is true now, what is active, what is next and what is blocked.

# 1. Executive state

Strale is a live production system with real paying machine customers.

Backend/API monorepo:
- `strale-io/strale`

A separate private frontend repo exists:
- `strale-io/strale-frontend`

The desired working model is for the main Strale repo to become the project source of truth for product, strategy, decisions and project state even where implementation remains split.

The large code-remediation program is mostly complete.

The project is transitioning from broad architecture/safety remediation toward:
- closing a small number of operational/governance residuals;
- improving capability discovery/retrieval;
- continuing commercial demand mining;
- completing the new website;
- simplifying the repo information architecture itself.

# 2. Commercial state

Target:
> **$2,000/week revenue**

Early baseline was only tens of euros/week and highly concentrated in one buyer.

Recent operating evidence in the repo shows meaningful improvement:
- multiple real buyers now exist;
- non-top buyers have begun repeating;
- concentration has improved across comparable completed weeks;
- growth has occurred around the largest buyer rather than only by losing that buyer;
- new non-trivial wallets have entered via both research and general-utility capabilities.

Important discipline:
- never state concentration movement from a partial week;
- wallet count is not buyer count;
- “dust” wallets are not meaningful acquisition;
- repeat behavior and spend matter more than raw account count.

Revenue remains far below the target.

# 3. Website implementation state

New website work is being implemented at `/homepage-v2` as a no-indexed preview.

It has not replaced the existing homepage.

## Batch A completed

### Header
Implemented:
- Tools
- Use cases dropdown
- Developers dropdown
- Pricing
- Sign in
- Start building
- accessible desktop dropdowns
- purpose-built mobile menu
- compact liquid-glass scroll state
- hide-on-scroll-down/show-on-scroll-up behavior

Known provisional deviations:
- compact nav hides Developers and Sign in;
- not auth-aware yet;
- several destinations still point to legacy/provisional routes.

### Hero
Implemented:
- eyebrow: `TOOLS FOR AI AGENTS`
- H1: `One connection to the tools your agent needs.`
- supporting copy and CTAs
- technical line: `HTTP API · MCP · PAY PER SUCCESSFUL CALL`
- atmospheric folded-material stage
- animated Strale request/result proof rotating through:
  - Google Search
  - Swedish Company Data
  - Email Validation
- reduced-motion/offscreen behavior

Latest design feedback:
- keep the hero concept;
- it is the strongest part of Batch A;
- replace “Listening” with “Received” / “Request” or another accurate request state;
- reduce empty space in routing states;
- pace transitions slowly enough for the result to register.

### How Strale Works
Implemented:
1. Connect
2. Discover
3. Call
4. Return

Behavior:
- sticky desktop progression;
- natural scroll;
- direct tab selection;
- keyboard navigation;
- reduced-motion fallback;
- fixed panel height;
- responsive tablet/mobile.

Current visual weakness:
- generated folded-material marketing illustrations are coherent but too generic and weaker than the hero’s product-specific visual language.

Latest direction:
- do not chase “better AI illustrations”;
- prototype a simpler code-native visual grammar;
- use folded material as atmosphere, not the informational subject;
- one dominant visual idea per step:
  - connection;
  - selection;
  - routed execution;
  - structured result.

Also:
- reduce excessive gap between the section heading and the stepper;
- likely reduce main panel height 10–15%;
- consider a less component-like active-step treatment.

## Homepage not yet implemented
- Featured Tools
- Use Cases
- Developers + x402
- Reliability
- Pricing / Access
- Closing CTA
- Footer
- final full-page rhythm/consistency pass

# 4. Website design direction

Selected direction: **Quiet Material**.

Core language:
- Instrument Sans;
- IBM Plex Mono for technical labels;
- white/pearl/mineral surfaces;
- oxide red;
- cobalt/navy;
- mineral green;
- folded-material imagery;
- restrained purposeful gradients;
- glass mainly for navigation/overlays;
- selective shadows and rounding;
- standardized spacing.

Latest critique:
- avoid generic Linear/Vercel/AI-infrastructure sameness;
- Strale’s most ownable devices should become:
  1. folded/mineral atmosphere;
  2. request → routing → result visual grammar;
- do not turn every later homepage section into another card grid.

# 5. Technical remediation status

## Closed / accepted
Broadly accepted:
- M0
- WP0
- WP1
- WP2
- WP3
- WP4
- WP5
- WP6
- WP7, with historical unique-index criterion formally superseded
- WP8
- WP11
- execution-receipt phases 1–5
- production authorization boundary
- npm trusted publishing / MCP incident
- reachable dependency/supply-chain remediation
- caller-input / remote-fetch resource-safety family
- refusal-classification consolidation
- routing estimator and direct async-path tests in #436/#438

## WP10 — Durable Job Coordinator
Implemented and placed under observation.

The final acceptance gate was deliberately dated 2026-08-30.

Before treating WP10 as closed, verify whether the final observation evidence has actually been run/recorded.

Do not manufacture a restart.

## WP9 residual
Historical transaction linkage remains incomplete and some solution-step fact consistency work remains.

Do not rewrite history merely to make linkage non-null.

## WP15 residual
Small CI/runtime hygiene residual:
- integration lane should create/drop a uniquely named DB instead of relying on a row-count/environment heuristic.

## WP17
Next governance/attribution package:
- receipts prove that state/manifest commitments changed;
- missing attribution is **who / when / under what authority**;
- recent closed-issue/unapplied-operator-write incidents show that “prepared”, “executed” and “reconciled” must be distinct states.

Keep WP17 narrow.

## WP12
**BLOCKED — VERIFY-IP**
Railway/X-Forwarded-For trusted-hop semantics unresolved.
Do not change IP policy based on assumptions.

## WP14
**BLOCKED / founder-legal**
Remaining legal/data-policy work requires founder/legal judgement.

## WP16
Not yet started.
This is the next major product/technical program after governance residuals.

# 6. Latest routing-latency state

Code for #438 is merged.

It fixed:
- latency estimator population: completed transactions only;
- p95 as routing statistic;
- direct async-path tests;
- refusal matcher authority.

A guarded one-shot operator script was merged in PR #442 for:
- `page-speed-test.avg_latency_ms`: `8000 → 20000`
- `company-news.avg_latency_ms`: `NULL → 28734`

At the latest confirmed preflight in this conversation, those production values had not yet been applied.

This remains current until production is re-verified.

Do not infer completion from closed issue state.

# 7. Execution receipts

Implemented and accepted:
- `strale.execution.v1`
- RFC8785/JCS canonicalization
- SHA-256 domain digest
- immutable manifest snapshots
- v2 chain
- explicit receipt epoch
- success/failure receipt production
- production observation across deploys

Receipt epoch:
- 2026-08-24 20:32:58.705669+00

Limitation:
- receipts are internal/chained;
- not currently exposed as a customer-facing signed verification product.

# 8. Resource safety

The resource-safety program is complete enough to exit.

Implemented:
- x402 body cap
- image/document byte caps
- streamed remote response limits
- bounded base64
- render limits
- shared `resource-limits` authority
- web-provider response limit and cache byte budget
- HTML/robots/sitemap/API class limits
- AST body-read guard
- PageSpeed report bound
- quadratic sitemap parser DoS removal
- non-2xx drain hygiene

Standing qualification:
- these controls do not claim arbitrary downstream decoder/global concurrency memory is fully bounded.

Do not restart an open-ended sweep without a concrete defect.

# 9. Production authorization state

Model:
- local/autonomous DB access is read-only;
- `strale_rw` is operator DML role;
- `DATABASE_URL_WRITE` is ephemeral/per-session/per-command;
- no standing write credential should live in repo/.env;
- production runtime retains write access;
- founder signing key remains intentionally absent unless explicitly activated.

Preserve this boundary.

# 10. Distribution/package state

npm trusted publishing established.

MCP incident closed in `strale-mcp@0.2.8`.

Standing rule:
- external package changes require post-publish production-contract smoke on the actual published artifact.

# 11. Repo/process state

The repo already contains:
- `AGENTS.md`
- `CLAUDE.md`
- `.agents/`
- `.claude/`
- `.codex/`
- `docs/company/`
- `docs/strategy/`
- `docs/remediation/`
- `docs/security/`
- `docs/operations/`
- `handoff/`
- daily briefs / operating records

The existing `AGENTS.md` explicitly says it is a derivative of `CLAUDE.md` and still contains active Notion references.

That is incompatible with the desired future model.

The next meta-project is therefore:
- inventory;
- authority redesign;
- canonical layer;
- thin symmetric agent entrypoints;
- Notion retirement;
- archive migration;
- drift enforcement.

# 12. Roadmap

## Priority 0 — repo operating-system redesign
Make the repo the one source of truth.

## Priority 1 — close #438 production reconciliation
Verify/apply the two latency rows via the guarded script.

## Priority 2 — WP10 dated acceptance gate
Run the observation-only gate and record ACCEPT / EXTEND / FAIL.

## Priority 3 — WP17 attribution
Who changed what, when, under what authority; prepared/executed/reconciled distinction.

## Priority 4 — WP9/WP15 residuals
Small bounded cleanup packages.

## Blocked
- WP12 VERIFY-IP
- WP14 VERIFY-LEGAL

## Priority 5 — WP16
Discovery containment + frozen ~200-query benchmark, then retrieval work.

## Commercial
Continue demand mining, repeat-buyer analysis, marketplace metadata and machine discoverability.

## Website
Refine Batch A, then build Batches B–D.
