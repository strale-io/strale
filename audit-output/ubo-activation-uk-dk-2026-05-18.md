# UBO activation summary — UK + DK
Date: 2026-05-18
Branch: feat/ubo-activation-uk-dk

Methodology note: smoke tests were performed via static code-path analysis
only — no local API harness was started, no Railway production calls were
issued. Each Outcome below is marked `(static analysis only)`. The code paths
were short and unambiguous enough that running the API was not necessary to
reach high-confidence conclusions; an end-to-end smoke test against Railway
prod is queued as a chat-side follow-up before any external customer claim is
made.

## UK

Outcome: GREEN (static analysis only)

Pre-PR ubo_availability: available (per PR #131)
Pre-PR populated ubo[]: yes — `beneficial-ownership-lookup` handler integrates
directly with Companies House PSC API (`apps/api/src/capabilities/beneficial-ownership-lookup.ts:97-184`)
and is wired as step 2 of the UK Counterparty Assurance solution bundle
(`apps/api/src/db/seed-solutions.ts:1792-1797`), returning a populated
`beneficial_owners[]` array on a real PSC fetch.

Post-PR ubo_availability: available (unchanged — flag was already capability-state-true)
Post-PR populated ubo[]: yes (unchanged)

Changes:
- `apps/api/src/capabilities/uk-company-data.ts`: refined `ubo_availability_reason`
  from operational-language ("PSC register publicly accessible via Companies
  House") to customer-friendly language ("Beneficial ownership data available
  via UK PSC register.") per DEC-20260518-D capability-state semantics.
- `apps/api/coverage-matrix/beneficial-ownership-lookup__uk__beneficial-ownership.yaml`:
  - `status: Committed` → `status: Live`
  - `sourcing_pattern: Free open data` → `sourcing_pattern: Direct API`
    (matches the handler's actual integration shape, mirroring
    `uk-company-data__uk__beneficial-ownership.yaml`)
  - `last_verified: 2026-04-28` → `2026-05-18`
- `apps/api/coverage-matrix/uk-company-data__uk__beneficial-ownership.yaml`:
  no changes (already `Live`).

## DK

Outcome: RED (static analysis only)

Pre-PR ubo_availability: available (per PR #131)
Pre-PR populated ubo[]: no — `beneficial-ownership-lookup.ts:37-54` explicitly
returns `supported_jurisdiction: false` for all non-UK jurisdictions. No
DK-specific UBO integration exists anywhere in the codebase (grep confirmed:
no DK→UBO call path). The reason string set by PR #131 itself admitted
"handler integration pending; flag reflects jurisdictional availability" —
which is the exact DEC-20260518-D violation: the flag was reflecting
jurisdictional state, not capability state.

Post-PR ubo_availability: unavailable_no_registry
Post-PR populated ubo[]: no (unchanged — but now flag matches state)

Changes:
- `apps/api/src/capabilities/danish-company-data.ts`: flipped
  `ubo_availability` from `available` to `unavailable_no_registry`; updated
  reason to: "Danish beneficial ownership data integration in progress;
  coverage in v1.1."
- `apps/api/coverage-matrix/beneficial-ownership-lookup__dk__beneficial-ownership.yaml`:
  no change — already `Committed`, which is the correct pre-integration
  status. (The YAML row pre-dates the handler-level flag enforcement; it
  continues to track the planned DK integration as a deferred build item.)

Gap identified: the Danish UBO register (operated by Erhvervsstyrelsen via
Virk) is publicly accessible per EU 5AMLD transposition, but Strale has no
integration. Options for v1.1 enablement:
- Add DK branch to `beneficial-ownership-lookup.ts` that calls
  datacvr.virk.dk's UBO endpoint (requires system-to-system access setup,
  already queued separately for identity data).
- Consume OpenOwnership BODS DK extracts (the YAML's stated plan) as a
  bulk-import path.

Semantic note on enum value: the chosen value `unavailable_no_registry` is
the closest match in the existing enum but is slightly imprecise — a DK BO
register does exist, the capability gap is on the platform side. The enum
does not currently have an `integration_pending` or `not_yet_integrated`
bucket. Chat-side may consider adding one in v1.1 if customer
explainability suffers. The reason string carries the truthful detail
either way.

## YAML status changes

- `beneficial-ownership-lookup__uk__beneficial-ownership.yaml`: status was
  `Committed`, now `Live`. Sourcing pattern was "Free open data", now
  "Direct API". Last-verified was 2026-04-28, now 2026-05-18.
- `beneficial-ownership-lookup__dk__beneficial-ownership.yaml`: no change.
  Remains `Committed` — correct pre-integration state.

## Follow-up to-dos flagged (chat-side filing)

This CC session does not have Notion MCP write access. The following
to-dos are flagged for chat-side filing under the To-do DB
(collection://33a67c87-082c-8033-8ac5-000ba9922392):

1. **[v1.1] Ship DK UBO integration**. Add a DK branch to
   `beneficial-ownership-lookup.ts` that consumes the Danish public BO
   register (via datacvr.virk.dk system-to-system access or OpenOwnership
   BODS DK extracts). On ship: flip `danish-company-data.ts`
   `ubo_availability` back to `available` with reason "Beneficial ownership
   data available via Danish BO register." and lift the
   `beneficial-ownership-lookup__dk__beneficial-ownership.yaml` status from
   `Committed` to `Live`.

2. **[v1.0 pre-launch] End-to-end smoke test for UK UBO**. Run a real
   Counterparty Assurance call against a known-good UK entity (e.g.
   Companies House number `00006245` / BP P.L.C.) and confirm the response
   carries a populated `beneficial_owners[]` array and that the per-handler
   `ubo_availability: available` flag is consistent with the data. This
   PR's UK Outcome was reached by static analysis only; one live call before
   v1 launch validates the conclusion.

3. **[v1.1 consideration] Add `integration_pending` value to the
   `ubo_availability` enum**. The current enum (`available`, `restricted`,
   `unavailable_no_registry`) does not have a precise bucket for "the
   register exists in this jurisdiction but the platform has not yet
   integrated it." DK currently lives in this gap and is labeled
   `unavailable_no_registry` as a least-bad match. Adding a dedicated value
   would improve customer-facing honesty without conflating two distinct
   states.
