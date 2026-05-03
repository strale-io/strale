# Marketplace Eligibility Classification

**Authority:** DEC-20260503-A (Decisions DB)
**Enforced at:** capability onboarding pipeline (`validateManifest` +
`validateCapabilityStructure` in `apps/api/src/lib/onboarding-gates.ts`)
**Field:** `marketplace_eligible: boolean` (optional; default `true`)
**Required when false:** `marketplace_eligible_reason: string` (non-empty)

---

## What this controls

`marketplace_eligible` decides whether a capability appears on the
strale.dev public marketplace surfaces:

- `GET /v1/capabilities` (public listing)
- `GET /v1/capabilities/:slug` (public detail)
- MCP server card (`/mcp` capability tool list)
- A2A agent card (`/.well-known/agent-card.json`)
- `llms.txt`
- x402 catalog (`/.well-known/x402.json`, `/x402/catalog`)
- `POST /v1/suggest` (semantic search)

It does **not** disable the capability. Internal pathways — direct
`POST /v1/do`, solution composition, routing, lifecycle, audit, and the
test scheduler — bypass the filter. A `marketplace_eligible: false`
capability is still callable; it is just hidden from the front door.

---

## When to set `marketplace_eligible: false`

Set the flag false **at onboarding time** if the capability fails ANY
of the criteria below. Otherwise leave it omitted (defaults to true).

### Criterion 1 — Cost shape (hard gate)

Set false if the capability is a thin passthrough of a paid third-party
vendor with **significant fixed cost** that Strale absorbs regardless
of usage (subscription minimum, monthly retainer, seat fees, prepaid
quota that expires).

**OK to leave true:**
- PAYG vendors (Anthropic, OpenAI, Serper, Browserless on per-call billing)
- Free APIs (registry portals, government open data, Open-Meteo, ip-api)
- Low fixed cost (< €100/month effective floor)
- Pure-computation capabilities (no external call)

**Set false:**
- Vendor demands a Basic+/Pro+/Enterprise minimum that bites at low volume
- Strale eats the floor while the customer pays per call → margin collapses

### Criterion 2 — Maintenance burden (soft constraint)

Soft signal that should rarely trigger a `false` on its own. Capabilities
in `scraping-fragile-target` or `requires-domain-expertise` maintenance
classes need extra justification to remain on the marketplace, but the
maintenance class itself is not the gate — SQS and the test runner are.
Use this criterion only when the marketplace surface would actively
mislead customers (e.g. a brittle scraper that's currently broken but
not yet deactivated). Prefer fixing or deactivating the capability over
hiding it.

### Criterion 3 — ToS posture (hard gate)

Set false if the upstream vendor's terms of service prohibit resale,
embedding, or third-party redistribution of the data **and** Strale
has not negotiated a clean redistribution license.

This dovetails with DEC-20260428-A (third-party scraping doctrine,
three tiers): Tier-2 vendor consumption requires documented
redistribution rights. If those rights are absent for a specific
vendor, the capability can still execute for an authenticated customer
with their own contractual posture (internal-only callers), but it
should not appear on the marketplace surfacing the data to anyone.

---

## Decision tree

```
1. Pure-computation OR free-API OR PAYG-low-fixed-cost?
   YES → leave omitted (default true). DONE.
   NO  → continue.

2. Vendor has significant fixed cost (>€100/mo effective floor)?
   YES → false. Reason: vendor + fixed-cost description.
   NO  → continue.

3. Vendor ToS prohibits redistribution AND no negotiated license?
   YES → false. Reason: vendor + specific ToS clause.
   NO  → continue.

4. scraping-fragile and currently broken/misleading?
   YES → consider deactivating instead. If keeping, false with reason.
   NO  → leave omitted (default true).
```

---

## `marketplace_eligible_reason` content guide

When setting `marketplace_eligible: false`, the reason string MUST
record the specific criterion that triggered the classification so a
future operator can audit and revisit. Include:

- **Vendor name** (if Criterion 1 or 3)
- **The triggering fact** — fixed-cost amount, ToS clause reference,
  maintenance class + status

**Good examples:**

```yaml
marketplace_eligible: false
marketplace_eligible_reason: "Cobalt Intelligence US-company-data:
  Basic tier minimum $300/mo before per-call charges; thin passthrough
  on the marketplace would erode margin at low volume."
```

```yaml
marketplace_eligible: false
marketplace_eligible_reason: "Vendor X ToS §4.2 prohibits making the
  data available to third parties without separate enterprise license;
  capability remains callable for direct API customers under their own
  contracts but is hidden from public marketplace."
```

**Bad examples (rejected by validation):**

- `""` (empty)
- `"hidden"` (no rationale)
- `"vendor pricing"` (no specific fact)

---

## Backfill posture

The flag is `hybrid` in `FIELD_CATEGORIES` (`capability-field-authority.ts`).
On manifest backfill:

- Manifest seeds the field on **first onboarding**.
- DB-canonical thereafter. An operator override (e.g. setting `false`
  via SQL after a vendor ToS change) survives a manifest re-onboard,
  unless the operator passes `--force-override-authority` to reset the
  field to the manifest value.

This means: changing your mind about classification *after* a
capability ships requires either editing the DB column directly or
re-onboarding with the override flag. The manifest is not authoritative
on a live row.

---

## See also

- DEC-20260503-A — marketplace surfacing decision (Notion Decisions DB)
- DEC-20260428-A — third-party scraping doctrine (three-tier framework)
- `apps/api/src/lib/capability-field-authority.ts` — `hybrid` category
- `apps/api/src/lib/onboarding-gates.ts` — `validateManifest` /
  `validateCapabilityStructure` cross-field gate
