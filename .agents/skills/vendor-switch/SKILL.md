---
name: vendor-switch
description: Use when switching the upstream vendor for a compliance capability (sanctions, PEP, adverse media, UBO, KYB, payments, embeddings, log sink). Prevents the cert-audit RED-2 failure mode where the methodology page named OpenSanctions for 3 days after the platform had moved to Dilisense. Forces the surface-update + DEC-entry + drift-sweep checklist.
---

# /vendor-switch — replace an upstream vendor without leaving copy ghosts

Vendor switches are the highest-drift operation we perform. The platform
silently keeps working on the new vendor while the methodology page,
learn guides, learnGuides.ts, ToS, llms.txt, and any vendor-named copy
still cite the old one — for as long as nobody notices. The 2026-04-30
cert audit found "OpenSanctions" cited 3 days after the move to
Dilisense; the buyer-facing methodology page lied first.

This skill is the closing checklist. Run it BEFORE you push the
vendor-switch PR, not after.

## When this skill applies

Triggered by any of:

- The user says "we're switching from X to Y" (sanctions, PEP, adverse
  media, UBO, KYB, payments-card, payments-x402, embeddings, headless
  browser, log sink, risk-narrative LLM).
- A pull request title contains "drop", "switch", "migrate from X to Y"
  on a compliance / payments / log-sink capability.
- A new DEC entry is being drafted that supersedes a prior vendor-choice
  decision.

## Step 1 — Verify the executor really uses the new vendor

```bash
# For sanctions/PEP/adverse-media style caps:
grep -rE "(api\\.|baseURL|client\\.)" apps/api/src/capabilities/<slug>.ts
```

Read the executor file. Confirm the new vendor's API URL appears and the
old vendor's URL doesn't. If the executor has a fallback (e.g. Serper
fallback for adverse-media), document that explicitly — the marketing
copy must mention both primary AND fallback.

If the old vendor's code path is still callable, STOP. Either delete it
or wrap it behind a feature flag with a documented sunset date.

## Step 2 — Update STATIC_FACTS.vendors

`apps/api/src/lib/platform-facts.ts` — the canonical map. Update the
`vendors` field under `STATIC_FACTS`. Run the unit test:

```bash
cd apps/api && npx vitest run src/lib/platform-facts.test.ts
```

The test pins `vendors.sanctions === "Dilisense"` (or whatever the
current vendor is). Update the test in lockstep — that's the gate that
catches accidental reversions.

## Step 3 — Update the manifest's `data_source`

`manifests/<slug>.yaml` — set `data_source` to the new vendor name (use
the same string format as the rest of the catalogue). Then sync to DB:

```bash
cd apps/api && npx tsx --env-file=../../.env scripts/sync-manifest-canonical-to-db.ts <slug>
```

## Step 4 — Run the drift sweep — twice

```bash
node apps/api/scripts/check-platform-facts-drift.mjs
```

The first run shows everything that still references the old vendor —
this is your fix list. Update each surface:

- Backend marketing routes (llms-txt.ts, ai-catalog.ts, welcome.ts, a2a.ts)
- Frontend pages (Methodology.tsx, Privacy.tsx, Terms.tsx — anything
  that names the vendor)
- Frontend static guides (`src/data/learnGuides.ts`)
- Frontend public/ static fallbacks (llms.txt, .well-known/agent.json,
  .well-known/mcp.json) — these can't read the hook, so just replace
  the literal name
- Any DPA / sub-processor list (Privacy §5 + the Notion DPA template)

For React components, prefer the hook pattern:

```tsx
const { data: facts } = usePlatformFacts();
const sanctionsVendor = facts?.static.vendors.sanctions ?? "<new vendor>";
// ...
<span>{sanctionsVendor}</span>
```

For static markdown / JSON, hardcode the new name and rely on the drift
sweep to catch the next switch.

Re-run the drift sweep — must report **0 findings** before you commit.

## Step 5 — Log the decision

Vendor switches always need a DEC entry in Notion (Decisions DB —
`ea57671f-7167-44e4-a254-c0a1de79e7f9`). The DEC must:

- Reference the previous DEC being superseded (Contradiction Protocol)
- Cite the trigger (e.g. cost change, vendor outage, licensing change,
  regulatory finding)
- Document the engineering checklist this skill enforces

Drafting the DEC is Petter's call (governance authority). Surface a
draft in the PR description; do not create the entry on his behalf.

## Step 6 — Verify no marketing claims have rotted

Specifically check:

- `apps/api/src/capabilities/<slug>.ts` — the response schema's
  `data_source` / `lists_queried` / `provenance.source` fields all show
  the new vendor
- The manifest's `limitations` array — any limitation that used to
  describe the old vendor's coverage gaps needs rewriting against the
  new vendor's actual coverage
- The manifest's `transparency_tag` — the new vendor may use a
  different processing model (algorithmic vs ai_generated vs mixed);
  update if so

## Step 7 — Pre-flight + ship

```bash
cd apps/api && npm test                                         # full suite
npm run typecheck                                                # tsc clean
node apps/api/scripts/check-platform-facts-drift.mjs --strict   # 0 drift
node apps/api/scripts/check-fetch-timeout-coverage.mjs --strict  # no new offenders
```

Open the PR with the DEC draft inline in the description. The reviewer
runs the same drift sweep on the PR branch as a final gate.

## Common mistakes this skill prevents

- Updating the executor and the manifest but NOT the methodology page
  (cert-audit RED-2)
- Updating the marketing surfaces but leaving the manifest's
  `data_source` field on the old vendor (manifest-DB drift; caught by
  `sweep-manifest-drift.ts`)
- Forgetting that frontend static files (`public/.well-known/*.json`,
  `public/llms.txt`) can't read the hook and must be hand-edited
- Skipping the DEC entry — without it, the next session has no
  authoritative reason for the switch and may revert "by accident"
  during a refactor
- Updating `STATIC_FACTS.vendors.sanctions` without also updating the
  unit test that pins the expected value (the test would still pass on
  the OLD value because nothing forces it to fail)

## Out of scope

- Code changes to the executor itself — that's a separate workstream
  (write the executor, validate it, ONLY THEN start this skill)
- Pricing changes (different DEC class, different stakeholders)
- Adding a new capability altogether — use the Capability Onboarding
  Protocol (DEC-20260320-B) instead
