---
doc_type: session-plan
authority_scope: none
status: planned
complete: false
phase: M2
authority_active: false
created_at: 2026-09-02
owners:
  - claude-code
review_route: cheaper-model implementation, fresh independent review, orchestrator verification
---

# T14 — Cheap extras: environment manifest, model registry, claims register

> Milestone 4 of the founder's 2026-09-02 plan: the three survey items that
> are one manifest plus one checker each (the ideas file shipped with T12).
> Execution record, not project truth.

## A. Environment variables and vendors (survey rank 3)

**Found:** 129 distinct `process.env.*` names read under `apps/api/src`,
`apps/api/scripts`, `packages`, `scripts`; the root `.env.example` documents
32; `apps/api/` has no template; nothing records who holds a key or what a
provider costs beyond `docs/company/BUDGET.md`'s weekly ledger and the Notion
vendor roster (`apps/api/scripts/check-vendor-roster-drift.ts`).

**Structure:** `config/env-manifest.yaml` — one row per variable: `name`,
`purpose`, `provider` (or `internal`), `holder` (`petter` | `railway` |
`github-actions` | `local-only`), `cost_class` (`free` | `metered` |
`subscription` | `none`), `required_in` (`production` | `test` | `local` |
`ci`, list), `set_in` (`railway` | `.env` | `.env.test` | `workflow`), `docs`
(optional link). Vendor cost facts live on the row (`cost_note`), so
BUDGET.md can point at the manifest instead of repeating numbers.

**Checker** `npm run env:check` (+ `env:test`, CI): greps the same four trees
for `process.env.NAME` and fails on any name missing from the manifest;
fails on manifest rows whose name no code reads (dead rows) unless marked
`retired: <date>`; fails when `.env.example` (root) and a new
`apps/api/.env.example` differ from what `npm run env:example` generates
from the manifest (`required_in` contains `local`, placeholder values only);
validates the manifest against `config/env-manifest.schema.json`. The
existing secrets scan stays as is.

**Migration:** the implementer fills the 129 rows from code comments, the
existing `.env.example`, BUDGET.md, `docs/company/WORKFORCE.md`, and the
vendor-cost facts already in the repo; unknown holders are `holder: unknown`
and listed in the handoff for Petter (his `.env` files are gone, DQ-29, so
this table is also the recovery checklist).

## B. AI prompts and model versions (survey rank 7)

**Found:** 90 files under `apps/api/src/capabilities` hard-code
`claude-haiku-4-5-20251001` (one uses `claude-sonnet-4-20250514`); the
embedding model lives in `apps/api/src/lib/embeddings.ts`; the daily digest
in `apps/api/src/lib/daily-digest/analyze.ts`; no dated pin, no decision link.

**Structure:** `apps/api/src/lib/models.ts` — `export const MODELS = { capability_default: {...}, capability_reasoning: {...}, embeddings: {...}, digest: {...} }` with `id`, `pinned_at`, `decision` (DEC id or `unrecorded`), `purpose`. Executors import the role, never the literal. The invocation provenance already carries the model id; add `prompt_sha256` of the system prompt string where a capability builds one (helper `promptDigest()` in `models.ts`), so lineage is reconstructible from transactions.

**Checker** `npm run models:check` (+ tests, CI): fails on any literal
matching `/claude-[a-z0-9.-]+-\d{8}|gpt-[a-z0-9.-]+|voyage-[a-z0-9-]+|text-embedding-[a-z0-9-]+/` outside `models.ts` and test files; validates
that every `MODELS` entry has `pinned_at` and `decision`. Same shape as
`apps/api/scripts/check-no-bare-catch` lints.

**Migration:** replace the 90 literals with the role import (mechanical; the
capability behaviour does not change because the id is identical). Run
`npm run typecheck` and the capability unit tests.

## C. Brand voice, taglines, claims (survey rank 8)

**Found:** writing rules inside `docs/company/DESIGN-SYSTEM.md` (kept by
T13); positioning across `GOALS.md`, `CHARTER.md`, the direction plan; a claim
audit only in the preserved website handoff; guards for facts
(`check-platform-facts-drift.ts`, weekly cron, competitive-mention check,
PII scan) but no register of which claims are allowed, forbidden, or need
evidence. Case study: "OpenSanctions" on the methodology page three days
after the vendor switch.

**Structure:** `docs/company/claims.yaml` — rows: `id`, `claim` (exact
phrase or pattern), `status` (`allowed` | `needs_evidence` | `forbidden` |
`retired`), `evidence` (path or URL, required for `allowed` and
`needs_evidence`), `surfaces` (where it may appear), `decided_by` (DEC id or
`founder-<date>`), `note`. Seed from the handoff's `04_FINAL_CLAIM_AUDIT.md`
(claims it forbade), the platform-facts drift patterns, the scraping
doctrine (DEC-20260428-A: forbidden phrasings), and the Distribution PR
Integrity Protocol.

**Checker** `npm run claims:check` (+ tests, CI): validates the register;
scans `README.md`, `packages/*/README.md`, `manifests/*.yaml` descriptions,
`apps/api/src/lib/platform-facts.ts`, and (read-only, when present)
`../strale-frontend/public/llms.txt` for `forbidden` phrases and fails;
warns on `needs_evidence` claims whose evidence path does not resolve. The
voice rules move to one short `docs/company/VOICE.md` linked from the
register and from DESIGN-SYSTEM.md.

## Shared

Each part is its own commit with its own tests; one PR; identical
paragraph in CLAUDE.md and AGENTS.md naming the three registers and their
checks; inventory regenerated.

## Exit

- `env:check`, `models:check`, `claims:check` pass on `main` and each planted
  failure mode (undocumented variable, dead row, stale example file, model
  literal outside the registry, forbidden phrase in README) fails with a
  one-line fix.
- Zero model literals outside `models.ts`; 129 manifest rows; claims
  register seeded with at least the handoff audit's forbidden claims.

## Out of scope

Rotating or recovering any key (DQ-29 stays Petter's); changing any prompt
text; editing website copy.
