Intent: record that the NTA Corporate Number Web-API application ID is now set in Railway.

- Petter set `NTA_HOUJIN_APP_ID` in Railway on 2026-10-27. `config/env-manifest.yaml` now says `required_in: [production]`, `set_in: [railway]`.
- Observed after the deploy: `GET https://api.strale.io/x402/japanese-company-data` returns 402 (payment challenge). Before, it returned 503, because the credential gate refused it.
- Still open: a full live call through `/v1/do` and the manifest backfill. Both wait on the onboarding runner secret (`ONBOARDING_RUN_SECRET`). After that, enable JP in `company-status-check` routing.
