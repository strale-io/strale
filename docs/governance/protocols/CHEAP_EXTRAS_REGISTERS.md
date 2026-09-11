---
status: candidate
authority_active: false
source: CLAUDE.md
source_heading: "Cheap extras — env manifest, model registry, claims register (T14)"
---

# Cheap extras — env manifest, model registry, claims register (T14)

> [!CAUTION]
> **INACTIVE MIRROR: CLAUDE.md REMAINS THE AUTHORITY UNTIL M4.**
> This file is a byte-identical copy of the protocol's section in `CLAUDE.md`,
> extracted so the coverage manifest and future protocol router can reference
> a full-body path (T6 M3 batch 7, review round 1). It carries no authority of its own and
> must never be edited on its own: any change belongs in `CLAUDE.md` first,
> then re-extracted here. `npm run protocols:check` fails if the two copies
> diverge.

<!-- BEGIN VERBATIM FROM CLAUDE.md -->
### Cheap extras — env manifest, model registry, claims register (T14)

Three more small "values are data" registers, same shape as tokens/research/
programs. `config/env-manifest.yaml` (schema `config/env-manifest.schema.json`)
is one row per distinct `process.env.NAME` read under `apps/api/src`,
`apps/api/scripts`, `packages`, and `scripts` — purpose, provider, holder,
cost class, where it's required and where it's actually set. `npm run
env:check` fails on an undocumented read or a dead row; `npm run env:example`
regenerates `.env.example` and `apps/api/.env.example` from it.
`apps/api/src/lib/models.ts` is the only place a Claude/Voyage/GPT model id
may live — every capability imports a role (`MODELS.capability_default.id`,
etc.), never a literal. `npm run models:check` fails on a model-id literal
anywhere else, or a registry entry missing `pinned_at`/`decision`.
`docs/company/claims.yaml` (schema `docs/company/claims.schema.json`, writing
rules in `docs/company/VOICE.md`) rules every public claim `allowed` |
`needs_evidence` | `forbidden` | `retired`. `npm run claims:check` scans
README.md, package READMEs, manifest descriptions, and `platform-facts.ts`
(plus, read-only, the sibling frontend's `llms.txt` when present) and fails
on a forbidden claim. All three are wired into CI after `design:check` /
`design:test`.
<!-- END VERBATIM FROM CLAUDE.md -->
