---
status: active
authority_active: true
adopted_by: DEC-20261024-A
moved_from: "CLAUDE.md heading: Cheap extras — env manifest, model registry, claims register (T14)"
moved_at: 2026-10-24
---

# Cheap extras — env manifest, model registry, claims register (T14)

> **Authoritative text.** Moved verbatim from `CLAUDE.md` in the contract cut
> (DEC-20261024-A, way-of-working review §4 step 3). Change it here; `AGENTS.md`
> routes to this file from its reading map.

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
