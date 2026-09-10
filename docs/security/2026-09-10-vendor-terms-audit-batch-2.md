# Vendor terms audit, batch 2 — the seven unchecked upstreams

**Continues** `docs/security/2026-09-06-vendor-terms-audit.md`, whose closing
section listed the commercial upstreams it had not yet read: AviationStack,
Alternative.me, GoPlus, Adzuna, Docker Hub, GitHub's API and the public
Ethereum RPC endpoints. The same question, asked of each: *do this vendor's
terms permit Strale to sell what the API returns?*

Method: every capability that reaches each vendor was found by searching the
executors by host, not taken from the earlier list. The terms were read, and
**every clause a verdict rests on was checked verbatim against the live page**
before anything was switched off. Production was changed first
(2026-09-10, 21:29–21:39 UTC, with the parked write credential); the pull
request brings the code into line and closes a path the database cannot reach.

## Verdicts

| Vendor | Capabilities | Verdict | Deciding clause |
|---|---|---|---|
| GoPlus Security | `token-security-check`, `wallet-risk-score`, `approval-security-check`, `phishing-site-check` | **Prohibited** | API License Agreement: "You shall not directly use our original data to conduct any commercial activities and generate revenue without Goplus's explicit written permission" |
| AviationStack | `flight-status` | **Prohibited** | Pricing page: the free plan is "Personal use" and "Non-Commercial Use"; the FAQ says commercial use "requires a commercial license" |
| Adzuna | `job-board-search` | **Prohibited** | Terms of Service: permitted uses are publishing listings (with "Jobs by Adzuna" branding), salary estimates and personal research. Other commercial use is a 14-day trial, after which the data "may not be used in its original format ... to deliver any ongoing work ... without written consent" |
| Docker Hub | `docker-hub-info` | **Prohibited** | Terms of Use: the Services may not be used "to mirror or replicate content for an unauthorized commercial service" |
| GitHub | `github-user-profile` | **Prohibited** | Acceptable Use Policies: personal information from the Service may be used "only ... for the purpose for which that User has authorized it"; the API terms bar selling users' personal information |
| GitHub | `github-repo-compare`, `github-repo-analyze` | Permitted | Public repository metadata through the documented API, within rate limits. The API terms say GitHub "may offer subscription-based access" for access "that would result in resale of GitHub's Service" — an option, not a prohibition. `github-repo-analyze` returns contributors' public logins and counts only, no profile fields |
| Alternative.me | `fear-greed-index` | Permitted, with a condition | "Commercial use is allowed as long as the attribution is given right next to the display of the data." Now emitted in the output beside the values |
| Alchemy | `ens-resolve`, `ens-reverse-lookup` | Permitted | Bars reselling access to Alchemy itself, not using it as the backend of a product |
| PublicNode | (ENS fallback) | **Prohibited** | Terms: "Except as expressly authorized", no selling, re-using or distributing "the Service or the Service Content commercially" |
| Ankr | (ENS fallback) | **Prohibited** | Terms: no "commercial exploitation of, or other third party access to, any element of the Service" without prior written consent |
| LlamaRPC, Cloudflare gateway | (ENS fallbacks) | Removed | Both answered HTTP 525 when probed; Cloudflare's anonymous gateway no longer exists; LlamaRPC's terms page could not be read |

## Found on the way: the first audit's misses

Two more live capabilities fell under clauses the 2026-09-06 audit had
already quoted. Both are the same mistake: the audit listed capabilities by
name, not by the upstream they call.

- **`wallet-age-check`, `wallet-transactions-lookup`, `wallet-balance-lookup`**
  use the same shared Etherscan client as `gas-price-check` and
  `contract-verify-check`, which that audit switched off because Etherscan's
  API content is "strictly for personal use only but not for commercial use"
  and may not be provided "for commercial purposes". These three stayed live
  and paid. Strale holds only a free Etherscan key.
- **`ip-risk-score`** calls the same ip-api.com free endpoint that took
  `ip-geolocation` down: "strictly limited for a non-commercial purpose and in
  a non-commercial environment". Found by the new guard test on its first run.

## The path the database switch did not reach

`web3-assurance` (`POST /v1/web3-assurance`) runs capability executors through
`getDirectExecutor`, which never reads `capabilities.is_active`, and three of
its evaluators (`stablecoin-issuer`, `wallet-velocity`, `sister-rug`) call the
Etherscan client directly. Switching capabilities off in the database left
those calls running. Two changes close it:

- every prohibited capability is in `auto-register.ts`'s `DEACTIVATED` map, so
  its executor is never registered and the wrappers get nothing to run —
  including `gas-price-check` and `contract-verify-check`, which were switched
  off in the database on 2026-09-06 but never added to the map;
- the Etherscan client refuses every call unless `ETHERSCAN_COMMERCIAL_PLAN`
  is `"true"`. One gate covers every caller. Setting it is a spend decision.

Until the pull request deploys, Web3 Assurance can still reach GoPlus and
Etherscan through those paths. It records no transactions and charges nothing,
but it is part of Strale's commercial API.

## Production changes

Switched off (`is_active`, `visible`, `x402_enabled` false, each with a
`deactivation_reason` quoting the clause). The scheduler only tests
capabilities with `is_active = true`, so their suites stop with them.

| Capability | Price | Customer calls, 90 days | Anonymous (x402) calls, 90 days |
|---|---|---|---|
| `approval-security-check` | 2c | 6 | 4 |
| `token-security-check` | 2c | 2 | 9 |
| `wallet-risk-score` | 2c | 2 | 2 |
| `phishing-site-check` | 2c | 1 | 2 |
| `flight-status` | 5c | 1 | 9 |
| `job-board-search` | 20c | 1 | 15 |
| `docker-hub-info` | 5c | 1 | 1 |
| `github-user-profile` | 5c | 1 | 22 |
| `wallet-age-check` | 2c | 2 | 16 |
| `wallet-transactions-lookup` | 2c | 3 | 23 |
| `wallet-balance-lookup` | 2c | 2 | 9 |
| `ip-risk-score` | 3c | 1 | 2 |

Bundles switched off (hard dependency on a GoPlus capability): `web3-counterparty-dd`,
`web3-dapp-trust`, `web3-wallet-identity`. Afterwards: **no active solution
depends on a deactivated capability**, and `/v1/capabilities`, `/v1/solutions`
and `/x402/catalog` list none of them (the x402 catalogue after its 60-second
cache).

The revenue at stake is cents. The exposure was not.

## What was not changed, and why

- **Health probes** for GoPlus and Etherscan in `dependency-manifest.ts` still
  run a few times a day. They check reachability and serve no data. Retiring
  the entries would trip the invariant checker, which requires a retired
  provider's host to be gone from `capabilities/`, and the deactivated
  executor files still name it.
- **`job-board-search`** also queries Sweden's JobTech API (Arbetsförmedlingen
  open data). A Sweden-only rebuild on that source alone would be compliant.
- **GitHub's repository capabilities** stay live on the reading above. If
  volume grows, GitHub's subscription option for resale is the conservative
  step.

## The guard

`apps/api/src/lib/vendor-terms.ts` lists the prohibited upstream hosts from
both audits. `vendor-terms.test.ts` fails if any file under `apps/api/src`
names one as a URL unless it is a `DEACTIVATED` executor, a shared client
behind a licence gate, or an explicit non-capability exemption (only the
dependency probes). It must see the known references, so it cannot pass by
scanning nothing, and no exemption may cover capability or web3-assurance
code. Planted failures: `archive/receipts/2026-09-10-test-run-vendor-terms-guard-mutations.json`.

The rule from the first audit stands, now with a check behind it: find the
vendor's terms and record whether they permit resale before the executor is
written. A free tier from a commercial vendor is the default no.
