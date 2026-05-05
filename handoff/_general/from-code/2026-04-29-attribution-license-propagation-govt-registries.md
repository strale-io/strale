---
date: 2026-04-29
session_intent: Propagate attribution/license fields (DEC-20260422-D) to existing direct-API govt-registry capabilities — Notion to-do 34a67c87-082c-8185-a682-ea555863b1b0.
mode: Quick
---

# Attribution/license propagation — govt-registry capabilities

## What changed

Backfilled the RichProvenance attribution envelope (`acquisition_method`, `primary_source_reference`, `attribution`, `license`, `license_url`, `source_note`) on 6 govt-registry executors. Pattern matches what was already shipped on `swedish-company-data` (DEC-20260422-D) and the more recent `irish-company-data` / `latvian-company-data` / `lithuanian-company-data` / `singapore-company-data` (full envelope) and `belgian-company-data` (vendor_aggregation envelope).

| Capability | File | Acq. method | License set? | Notes |
|---|---|---|---|---|
| `norwegian-company-data` | `apps/api/src/capabilities/norwegian-company-data.ts` | `direct_api` | Yes — NLOD 2.0 | data.brreg.no Redoc explicitly states NLOD 2.0; attribution "Kilde: Brønnøysundregistrene" required by NLOD. |
| `danish-company-data` | `apps/api/src/capabilities/danish-company-data.ts` | `vendor_aggregation` | No — vendor terms unverifiable | We fetch via cvrapi.dk (Tier-2 wrapper of Erhvervsstyrelsen CVR). primary_source_reference points at datacvr.virk.dk. CVR is an EU HVD; cvrapi.dk's redistribution terms are not formally published, so license is intentionally omitted. Migration to direct datacvr.virk.dk system-to-system access already noted as queued. |
| `finnish-company-data` | `apps/api/src/capabilities/finnish-company-data.ts` | `direct_api` | Yes — CC BY 4.0 | avoindata.suomi.fi YTJ dataset page declares CC BY 4.0; attribution in Finnish per portal convention. |
| `cz-company-data` | `apps/api/src/capabilities/cz-company-data.ts` | `direct_api` | No — license declaration not on portal | ARES is a public ČR Ministry of Finance registry. Could not retrieve a clean reuse-licence declaration from ares.gov.cz (SPA + missing terms page); ČR's open-data default is CC BY 4.0 in many places but ARES doesn't surface it. Set attribution + source_note only; left license/license_url unset rather than guess. |
| `estonian-company-data` | `apps/api/src/capabilities/estonian-company-data.ts` | `direct_api` | Yes — CC BY 4.0 | RIK avaandmed.ariregister.rik.ee declares CC BY 4.0. |
| `polish-company-data` | `apps/api/src/capabilities/polish-company-data.ts` | `direct_api` | No — license declaration not on portal | api-krs.ms.gov.pl returned 403 to terms/swagger; dane.gov.pl KRS dataset doesn't surface a clean CC mark. Polish 2021 open-data act applies but isn't a CC license. Set attribution + source_note only; left license/license_url unset. |
| `dutch-company-data` | — | — | — | **Deferred.** Currently DEACTIVATED in `auto-register.ts` (DEC-20260427-I-1; northdata.com scraping prohibited). Reactivation trigger is licensed KVK contract or licensed multi-country aggregator; the Notion task contemplated KVK HVDS migration which hasn't happened. Will revisit when the executor is re-enabled. |

## Why some have license set and others don't

DEC-20260428-A (third-party scraping doctrine) + the broader scoring/onboarding integrity rules say "never fabricate provenance metadata". For NO/FI/EE I verified the license string from the official portal. For DK/CZ/PL the official portal either didn't declare a CC license or wasn't reachable. Rather than guess, I set `attribution` (which is true and publicly stated) and a `source_note` that names the legal regime (EU HVD Reg. (EU) 2023/138 for FI/CZ/EE/PL; Polish 2021 open-data act for PL) but **left `license` and `license_url` unset**. A future session can fill those in once verified.

## Why Danish is `vendor_aggregation` not `direct_api`

Code comments already flagged that we fetch through cvrapi.dk, a third-party JSON wrapper. That's exactly the pattern Belgian's CBEAPI uses — Tier-2 vendor-mediated public records (DEC-20260428-A). Setting `direct_api` would be technically inaccurate.

## Verification

- `npx tsc --noEmit` from `apps/api` — clean (exit 0).
- No unit tests reference these provenance shapes (`*.test.ts` grep was empty for these slugs).
- Did not run live smoke tests (no inputs needed re-querying; provenance is appended to existing successful response shape, no logic change).

## Files changed (no commits yet)

```
apps/api/src/capabilities/cz-company-data.ts
apps/api/src/capabilities/danish-company-data.ts
apps/api/src/capabilities/estonian-company-data.ts
apps/api/src/capabilities/finnish-company-data.ts
apps/api/src/capabilities/norwegian-company-data.ts
apps/api/src/capabilities/polish-company-data.ts
```

## Notion

- To-do `34a67c87-082c-8185-a682-ea555863b1b0` set to Status=Done and moved to Archive > Completed To-dos (`34067c87-082c-814e-a45c-fa8d851c8f12`).

## Loose threads / follow-ups

1. **Verify CZ + PL licenses.** Manual check on ares.gov.cz/podminky-uziti and dane.gov.pl/dataset/...-krs for license metadata; backfill `license` + `license_url` if/when found.
2. **DK migration to datacvr.virk.dk.** Already queued elsewhere; this session didn't change that.
3. **NL revisit.** When `dutch-company-data` is reactivated (KVK HVDS or licensed aggregator), set the full attribution envelope at that time.
