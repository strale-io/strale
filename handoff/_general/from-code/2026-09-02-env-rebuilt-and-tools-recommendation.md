Intent: rebuild the two credential files lost in the 2026-09-02 checkout deletion from Railway, correct the environment manifest against what production actually holds, and give the founder a plain recommendation per tool and key.

## What was done

- `C:\Users\pette\Projects\strale\.env` and `apps\api\.env` rebuilt from
  Railway variables through the CLI: 19 keys copied, 5 local overrides
  (development mode, localhost URLs), 26 placeholders kept for optional local
  settings. Values were never printed. `DATABASE_URL` is the Postgres public
  proxy; a read-only `SELECT` against production succeeds (340 capability rows).
  Live Stripe keys deliberately not copied (local uses test mode).
- `config/env-manifest.yaml` corrected against Railway's 68 variable names:
  holders set to `railway` where the key is set there; `required_in` no
  longer claims production for 43 variables that production does not set
  (the code falls back or the feature is off); schema allows an empty
  `required_in`. `STRALE_*` local keys marked local-only.
- DQ-29 resolved in the decision queue; T4 back to active.

## Tools recommendation (for Petter — decisions, not tech)

| Tool / key | State in production | What it powers | Recommendation |
|---|---|---|---|
| Cobalt Intelligence (`COBALT_API_KEY`) | not set; no subscription exists | `us-company-data-cobalt` (active in catalogue, not on x402) | Decide: buy (subscription) or deactivate the capability. It cannot work today. |
| EINsearch (`EINSEARCH_API_KEY`) | not set; no subscription exists | `us-ein-match` | Same choice. Note `2026-04-28-us-ein-match-cheaper-alternatives.md` in research. |
| sec-api.io (`SEC_API_IO_TOKEN`) | not set; no subscription exists | `us-sec-filings-extended` | Same choice. |
| Jina AI (`JINA_API_KEY`) | not set | a fallback web-fetch provider | Leave unset unless web extraction quality complaints appear; metered cost. |
| Rekt, Tenderly (`REKT_API_TOKEN`, `TENDERLY_*`) | not set | optional signals inside web3 assurance | Free tiers exist; set them only if the web3 checks are a product priority. |
| SDDA Latvia (`SDDA_API_CLIENT_*`) | not set | the Latvian registry provider | Latvian company data is active and on x402: verify which path serves it before deciding; free registration. |
| Voyage AI (`VOYAGE_API_KEY`) | not set | embeddings for suggestions | `/v1/suggest` works without it (fallback ranking); set only if suggestion quality matters. |
| OpenSanctions (`OPENSANCTIONS_API_KEY`) | set, read by nothing | vendor dropped 2026-04-27 | Remove the key from Railway and close the account if it still exists. |
| USPTO ODP (`USPTO_ODP_API_KEY`) | set, read by nothing | no capability reads it | Remove from Railway. |
| Notion (`NOTION_API_KEY` in production, `NOTION_TOKEN` in one script) | set | daily digest, vendor-roster drift check | Two names for one integration; the script name is retired at the M4 cutover with the rest of Notion. Keep until then. |
| Stripe (`STRIPE_*`) | live keys set | wallet top-ups | Keep on Railway only. If you want top-ups tested locally, add test-mode keys to `.env` yourself. |
| Serper (`SERPER_API_KEY`) | set | adverse-media fallback, search capabilities | Credits expire around 2026-11-08 (vendor cost facts); decide then whether to top up. |
| Browserless, Dilisense, Anthropic, Companies House, Bolagsverket, JustizOnline, Zefix, ABN, PageSpeed, Resend, CDP | set | core capabilities and email | Keep; holders now recorded as Railway. |
| `STRALE_API_KEY` | set, but dead (matches no account) | local smoke tests | Needs a fresh key for a test account, which requires write access; an operator action for a session with the write grant. |

## Not done

- No Railway variable was removed or changed; the two unread keys are a
  recommendation only.
- `apps/api/.env` is a copy of the root file (the API scripts load the root
  file; the copy exists because the manifest's example generator expects it).
