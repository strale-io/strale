# Strale — Canonical Decision Register (Bootstrap)

This is a synthesized bootstrap register. Reconcile it with the repo’s formal DEC-* records during migration.

Statuses:
- ACTIVE
- SETTLED
- SUPERSEDED
- DEFERRED
- BLOCKED

## D-001 — Revenue target
**ACTIVE**  
Target is **$2,000/week**, superseding the initial $2,000/month framing.

## D-002 — Core product position
**ACTIVE**  
Strale is a machine-native capability/tool layer for AI agents: one connection, discovery, execution, structured result, machine-compatible payment.

Not a generic workflow builder, generic human-browsed API marketplace or KYB-only company.

## D-003 — x402
**ACTIVE**  
x402 is the strategic primary rail for machine-paid access.

## D-004 — Revenue wedge
**ACTIVE but evidence-sensitive**  
Recurring B2B research/commercial-intelligence agents are a strong current ICP/wedge.

Do not turn the wedge into the whole product.

## D-005 — KYB priority
**DEFERRED as default-first**  
Do not auto-rank KYB/compliance build-out first solely because it was once the leading hypothesis.

Latest buyer evidence supports broader demand-following.

## D-006 — Card-customer outreach
**SETTLED**  
Do not contact the specific card buyer discussed in the revenue program.

Their behavior is the experiment.

## D-007 — One authority per business fact
**ACTIVE**  
One canonical authority; many thin consumers.

Apply this to:
- metadata;
- refusal classification;
- routing;
- manifest sync;
- documentation/project context.

## D-008 — No charge before success
**ACTIVE**  
Failures/refusals must not be billed as successful work.

## D-009 — Production credential boundary
**ACTIVE**  
Autonomous sessions use read-only DB access. Operator writes require ephemeral `DATABASE_URL_WRITE`. No standing write secret in repo/.env.

## D-010 — Scoped production mutation
**ACTIVE**  
Production sync/mutation tools must expose explicit scope. No implicit “write everything”.

## D-011 — Manifest sync
**ACTIVE**  
`--fields` or explicit `--all-fields`; displayed diff and actual write set must match.

## D-012 — Execution receipts
**ACTIVE implementation**  
Strale-owned `strale.execution.v1`, JCS/RFC8785 + SHA-256.

Do not adopt an external proposal as runtime authority.

## D-013 — Historical receipt backfill
**SETTLED**  
Do not fabricate receipts for historical redacted rows that cannot support reconstruction.

## D-014 — Resource-input limits
**ACTIVE**  
Bound caller-controlled/fetched input before allocation/buffering.

## D-015 — Resource-limit semantics
**ACTIVE**  
Use justified media-specific limits; not one arbitrary number for everything.

## D-016 — Refusal classification
**ACTIVE**  
One semantic refusal authority must feed taxonomy, circuit breaker and quality/trust capture.

## D-017 — Routing latency
**ACTIVE**  
Routing metadata is execution-grounded and tail-aware.
Use completed transactions and p95, not contaminated test timing.

## D-018 — Null routing behavior
**ACTIVE**  
Keep null-latency default sync for now; populate evidence-backed values rather than move dozens of fast capabilities to async.

## D-019 — PSI API key
**DEFERRED**  
Optional availability hygiene, not current blocker.

## D-020 — Sitemap parser
**ACTIVE current implementation**  
Quadratic regex parser replaced by linear scanning.
Do not add a general XML parser without evidence.

## D-021 — Resource-safety program boundary
**SETTLED**  
The concrete caller-controlled body-read family is closed.
Do not keep extending the sweep absent a concrete defect.

## D-022 — Website visual direction
**ACTIVE**  
Selected direction: **Quiet Material**.

Core:
- Instrument Sans
- IBM Plex Mono labels
- pearl/mineral surfaces
- oxide red
- cobalt/navy
- mineral green
- folded-material atmosphere
- purposeful restrained gradients
- selective glass

## D-023 — Hero
**ACTIVE**  
Keep the restored atmospheric hero and code-native Strale request/result proof.

Refinement:
- replace “Listening” with an accurate request state;
- keep results readable and deliberate.

## D-024 — How Strale Works
**ACTIVE with refinement**  
Preserve Connect → Discover → Call → Return.

Move away from generic generated marketing illustrations toward a Strale-specific code-native visual grammar.

## D-025 — Homepage architecture
**ACTIVE**  
Avoid repeating generic card grids in every section.

## D-026 — Gradients
**ACTIVE**  
Gradients remain, but purposeful/atmospheric rather than decorative.

## D-027 — Domain
**NEEDS final confirmation before irreversible migration**  
Strale owns `strale.dev` and `strale.io`. Website/rebrand work leaned toward `strale.io` as the broader brand domain, but confirm final canonical domain before encoding infrastructure around it.

## D-028 — Repo as source of truth
**ACTIVE — current founder direction**  
The repo becomes the system of record for Strale.
Notion is retired.
Chat history becomes migration input, not ongoing authority.
Codex and Claude Code should work interchangeably from the same repo context.

## D-029 — Agent-entrypoint symmetry
**ACTIVE proposed implementation rule**  
`AGENTS.md` and `CLAUDE.md` must not independently restate mutable project facts.
Both point to shared canonical files.

## D-030 — One current-state authority
**ACTIVE proposed implementation rule**  
Exactly one canonical current-state file.

A PR/issue being closed does not mean production acceptance if a required operator action remains.

# Existing formal decisions to preserve/index

During migration, preserve and index existing formal records, especially:
- DEC-8 — wallet locking
- DEC-9 — `/v1/do` idempotency
- DEC-14 — charge ordering
- DEC-21 — rate/spend caps
- DEC-22 — async execution/routing
- DEC-20260428-A — scraping doctrine
- DEC-20260428-B — regulatory-grade data engineering bar
- DEC-20260813-A — targeted public parsing doctrine
- DEC-20260815-A — operating charter / authority
- DEC-20260812-A — metadata/catalogue authority used by tooling

Do not erase or renumber historical formal decisions. Build a current index over them.
