# DK handler routing verification — 2026-05-15

**Trigger:** Active Vendor Stack canonical page (Notion `35367c87082c812e88d1dc6bdbfbd4f5`) lists DK as "CVR (Danish Central Business Register)" — implying direct Erhvervsstyrelsen `distribution.virk.dk` integration. The 2026-05-15 identity field-coverage audit Batch 2 empirically observed DK failing with a `cvrapi.dk 50/day` quota exhaustion. One source is wrong; this verification establishes ground truth.

**Verdict:** **cvrapi.dk (free tier)**

**Confidence:** high

The handler source is unambiguous — single `const CVR_API = "https://cvrapi.dk/api"`, response parser keyed against cvrapi.dk's flat field shape, provenance object already self-declares `upstream_vendor: "cvrapi.dk"` and `acquisition_method: "vendor_aggregation"` with a `source_note` that explicitly says "Migration to direct datacvr.virk.dk system-to-system access is queued."

The Active Vendor Stack canonical page is the drifted artifact. The audit's framing was correct.

## Evidence

### Upstream URL
- `apps/api/src/capabilities/danish-company-data.ts:10` — `const CVR_API = "https://cvrapi.dk/api"`.
- Request constructed at line 57-61: `${CVR_API}?country=dk&vat={cvr}` (or `&search={name}`).
- Result: every runtime call hits `https://cvrapi.dk/api?country=dk&...`. No conditional routing, no fallback to Virk anywhere in the file.

### Auth pattern
- `apps/api/src/capabilities/danish-company-data.ts:62-68`. Request headers are `Accept: application/json` and `User-Agent: Strale/1.0 (hello@strale.io) danish-company-data`. **No `Authorization` header, no API key, no basic-auth pair.** This is the cvrapi.dk free-tier fingerprint (the paid tier uses HTTP basic with the token as username; we are not on that path).
- Grep of `apps/api` for `CVRAPI|VIRK|DISTRIBUTION_VIRK|CVRBASEN|CVR_DEV` (case-insensitive) returns zero env-var declarations or token references in `.env.example`, `apps/api/src/config/`, or anywhere else. Only documentary mentions (limitations seed text, audit-helpers' `datacvr.virk.dk` primary-source URL constant, and prior audit docs) exist. No env-var-backed credential path for any DK upstream.

### Response shape
Parser at `apps/api/src/capabilities/danish-company-data.ts:86-110` reads these top-level keys from the JSON body: `name`, `vat`, `companydesc`, `industrycode`, `industrydesc`, `address`, `zipcode`, `city`, `startdate`, `employees`, `enddate`, plus an `error` field for the documented quota-exhaustion shape.

This matches cvrapi.dk's published free-tier response shape exactly. It does not match:
- **Virk distribution.virk.dk** — would be ElasticSearch hit envelope (`hits.hits[]._source.Vrvirksomhed.cvrNummer`).
- **cvrbasen.dk** — flat but with `names[]`, `company_form`, etc.
- **cvr.dev** — Danish-keyed fields.

### Env-var declarations
Grep summary (case-insensitive, `CVRAPI|VIRK|DISTRIBUTION_VIRK|CVRBASEN|CVR_DEV` across `apps/api`):

- Zero matches in `.env.example` or `apps/api/src/config/`.
- Zero matches in any `.env.*` file.
- `apps/api/src/lib/audit-helpers.ts:13` — `"danish-company-data": "https://datacvr.virk.dk"` — this is the **audit-trail primary-source URL constant** (the user-facing "trace back to upstream record" pointer in the audit body), not a runtime upstream. It correctly points at the underlying public register, while the handler reaches that register via cvrapi.dk as the Tier-2 wrapper.
- `apps/api/src/lib/startup-migrations.ts:697,728` — comments only ("DK cvrapi.dk — empirical floor ~50/day, no per-day reset_dom needed").
- `apps/api/src/db/seed-limitations.ts:52` — limitation copy mentioning `datacvr.virk.dk` as where customers can look up sole proprietorships manually.

No upstream credential is plumbed anywhere. This is consistent with the cvrapi.dk free tier (no auth required) and inconsistent with every other candidate upstream.

### Provenance self-declaration
The handler's own provenance object (lines 137-148) already self-declares the Tier-2 vendor-aggregation reality:

```
source: "cvrapi.dk"
source_url: "https://cvrapi.dk/"
acquisition_method: "vendor_aggregation"
upstream_vendor: "cvrapi.dk"
primary_source_reference: "https://datacvr.virk.dk/enhed/virksomhed/{cvr}"
source_note: "Tier-2 vendor-mediated public records (DEC-20260428-A). cvrapi.dk's redistribution terms are not formally published; CVR basic company data is on the EU High-Value Datasets list (Reg. (EU) 2023/138). Migration to direct datacvr.virk.dk system-to-system access is queued."
```

In other words: the handler is correctly labelled internally. The drift is only in the Active Vendor Stack page, which collapses the wrapper-vs-direct distinction.

## Implications

### For canonical docs
The **Active Vendor Stack** page (Notion `35367c87082c812e88d1dc6bdbfbd4f5`) needs an update on the DK row. Current text reads "CVR (Danish Central Business Register)" which a reader would interpret as direct Erhvervsstyrelsen integration. The accurate description is along the lines of:

> Tier-2: cvrapi.dk (third-party JSON wrapper of Erhvervsstyrelsen's CVR). Free tier, ~50/day soft quota. Direct datacvr.virk.dk system-til-system access queued.

This is the same wrapper-presented-as-direct drift pattern that hit DE in the earlier OpenRegister case. Worth doing a sweep of the page for similar collapses on other rows when the operator next opens the page (out of scope here).

### For the Journal risk entry
The Journal entry at `36167c87082c819ea49fcaa96e42833a` framed the DK risk as cvrapi.dk-quota-driven. That framing is confirmed correct by this verification. **No amendment needed.** The entry is the authoritative record going forward.

### For the Virk migration workstream
The Virk system-til-system migration To-do (`36167c87-082c-81e4-b80f-ea036fbcebc5`) is still correctly scoped. The handler's own `source_note` already names "Migration to direct datacvr.virk.dk system-to-system access" as queued, and the in-source comment at line 7-9 records the application URL (`https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data`) and the contact email (`cvrselvbetjening@erst.dk`). No re-scoping needed.

## Open questions for chat

1. **Active Vendor Stack update timing.** Update now (alongside this finding's surfacing) or batch with a wider AVS audit that also checks for the same wrapper-collapse on other rows (specifically: BE/CBEAPI is known Tier-2, but worth checking AT/IE/LV/LT/SG/CZ/EE/PL/FR/SE/NO/FI/UK rows for similar drift in the AVS page text)?
2. **Tier-2 disclosure consistency.** The handler's provenance is correctly Tier-2-labelled at runtime, but the AVS page is the canonical Tier-1/Tier-2 reader-facing artifact. Should there be a CI guard (similar to `check-platform-facts-drift.mjs`) that asserts the AVS page rows match each capability handler's `acquisition_method`? Out of scope for this prompt, but the gap exists.
3. **No other surprises.** The handler is otherwise straightforward. The cvrapi.dk free-tier path with quota-aware error messaging is the entire DK execution path.
