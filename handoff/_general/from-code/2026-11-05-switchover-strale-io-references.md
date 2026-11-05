Intent: prepare every session-side strale.dev to strale.io change for the website switch-over (DEC-20261105-A) in one branch that stays unmerged until switch-over day.

- Branch: `feat/switchover-strale-io-references`. Inventory and classes: `docs/programs/brand-website/SWITCHOVER-REFERENCES.md`.
- Changed: API response strings, emails, fallbacks, CI `FRONTEND_URL`, package and example metadata, 13 manifests, Terms link text; the six API surfaces now carry the L1 line (readiness row 9). CORS gains strale.io origins.
- Kept: outbound User-Agent URLs, replay-fixture-bound and content-bound manifests, both-domain matchers, historical records.
- next_action: Petter merges on switch-over day after the Cloudflare zone move; then set Railway `FRONTEND_URL`, release the packages listed in the inventory, and re-record the fixture-bound manifests.
