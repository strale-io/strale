Intent: DEC-20261023-A adoption, work items 4 and 5, plus the
`domain-contact-extract` check against never lane item 3 that the proposal
asked for. (Adoption list: `docs/strategy/2026-10-23-data-access-risk-rule-proposal.md`, "On adoption" item 6.)

## What changed

- **`social-profile-check`** no longer probes personal profiles. It used to
  fetch profile pages on TikTok, Reddit, YouTube, Pinterest, GitHub, npm and
  PyPI. It now checks whether a name is taken as:
  - an npm package (`registry.npmjs.org/<name>`);
  - a PyPI project (`pypi.org/pypi/<name>/json`);
  - a GitHub organisation (`api.github.com/orgs/<name>`, with optional
    `GITHUB_TOKEN`).

  These are official APIs (preferred lane), and only the HTTP status is
  read. The slug, price (€0.05) and output field names are kept. Its two
  solution steps pass `company_name` and `brand_username`, so spaces become
  `-`.
  - A rate limit, a refusal or an unreachable registry is `exists: null` and
    counted in `unknown_count`. It is never reported as "does not exist",
    which is how the old executor turned Reddit's 403 into "not found".
  - A GitHub 404 is never listed as "available", because a personal account
    may hold the name.
  - New name: "Developer Registry Name Check". `processes_personal_data` is
    now false.
- **Reddit** (`reddit.com`, `redd.it`) is on `tos-blocklist.ts`, under never
  lane item 4. The blocklist header now cites DEC-20261023-A.
- **`domain-contact-extract`** no longer returns `published_personal_addresses`.
  Named people's addresses are counted in `personal_addresses_withheld`; role
  addresses (info@, sales@) are still returned. This is never lane item 3:
  the statutory exception covers registry officer facts, not contact pages.

## Not done here (needs production access this session lacks)

- **The manifests' new name, description and output schema reach the
  database only via an operator run:**
  - `npx tsx apps/api/scripts/sync-manifest-text-to-db.ts social-profile-check`
  - `npx tsx apps/api/scripts/sync-manifest-text-to-db.ts domain-contact-extract`

  The name is not covered by that script. Updating it needs
  `onboard.ts --backfill` or a startup block.
- The onboarding pipeline steps (`onboard.ts --backfill --discover`,
  `validate-capability.ts`, `smoke-test.ts`, the readiness route) need the
  operator DB credential and network access. Status:
  `AUTHORIZATION_UNAVAILABLE`. The executor change is covered by unit tests;
  readiness is unverified.
- `packages/strale-capabilities/capabilities.json` is a published catalogue
  snapshot that still lists the old description. Regenerate it with the
  package's own release, not by hand.
