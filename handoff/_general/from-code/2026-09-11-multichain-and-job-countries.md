# More chains for the wallet and gas capabilities; France and US federal job search built behind their keys

**Intent:** founder asked (2026-09-11) whether the Alchemy-based capabilities
can cover other chains and whether job search can open beyond Sweden, then
"proceed according to your recommendations".

Date: 2026-09-11
Branch: `feat/multichain-and-job-countries`

## Chains

One Alchemy key serves every network, so this needs no new account or spend.

| Capability | Chains served | Why not more |
|---|---|---|
| `wallet-balance-lookup`, `wallet-transactions-lookup`, `wallet-age-check` | Ethereum (1), Base (8453), Arbitrum One (42161), OP Mainnet (10), Polygon PoS (137) | These are the networks where Alchemy documents its transfer index (`alchemy_getAssetTransfers`) with block timestamps. BNB Chain is refused. |
| `gas-price-check` | Ethereum (1), Polygon PoS (137), BNB Smart Chain (56) | Rollups (Base, Arbitrum, OP) are refused, with the reason: most of a rollup transaction's cost is the fee for posting its data to Ethereum, which `eth_feeHistory` does not contain. Tiers computed from it would understate the real cost. |

- `chain_id` accepts a number, a hex id (`0x2105`), or a name/alias (`base`,
  `arbitrum`, `matic`, `bsc`). The default is still Ethereum, so existing
  callers see no change.
- Balance and transactions add `native_symbol` (POL on Polygon, ETH elsewhere);
  `value_eth` / `native_balance_eth` are in that coin.
- Code: `apps/api/src/capabilities/lib/alchemy-client.ts` (`CHAINS`,
  `TRANSFER_CHAINS`, `resolveChain`).

Quota estimate: a full known-answer round across every chain is about 3,750
compute units. Balance is about 260, transactions 240, age 240 and gas 10 per
chain. Hourly, that comes to roughly 2.7M a month, against the free tier's 30M.

## Job search: France and the United States

Each country has one public-employment-service source. A country whose
credentials aren't set refuses, and the refusal names the country.

| Country | Source | Terms, as read |
|---|---|---|
| se (default) | Arbetsförmedlingen JobTech | CC0, no key (unchanged) |
| fr | France Travail, Offres d'emploi v2 | Read 2026-09-11 on the CGU page (`francetravail.fr/informations/informations-legales-et-conditio/conditions-generales-dutilisatio.html`). Offers are available through an API to partners who join the offer-reuse licence, contact data excepted: *"Ces offres pourront être réutilisées pour tout usage et notamment être rediffusées sur des sites tiers."* (A plain curl of the page earlier did not contain the text, which is rendered by script. It was read through a fetch that renders the page.) The reuse licence itself is accepted at registration and has not been read. |
| us | USAJOBS Search API (federal jobs only) | Known only through FedScoop's quote of OPM: reposting is permitted if data values are not altered, USAJOBS is credited and users are sent to USAJOBS to apply; raw data feeds may not be redistributed. The primary terms page did not show this section. **Confirm the text at key registration before the key goes on Railway.** |

- The code sends unaltered values, links every US result to its USAJOBS posting,
  and returns an `attribution` string for every country.
- Contact names, emails and phone numbers are never returned. Tests plant them
  in the upstream data and assert that they are absent from the output.
- Vendor register: `france-travail` (redistribution verified, conditional) and
  `usajobs` (unknown), both `candidate`.
- The manifest `geography` stays `nordic` until a second country is actually
  live.

## Petter's steps (only he can do these)

1. **France Travail.** Create an account at francetravail.io and create an
   application. Add the API "Offres d'emploi" v2 and accept its reuse licence.
   Copy the client ID and secret.
2. **USAJOBS.** Request a key at developer.usajobs.gov with the Strale email
   address. Read the terms shown there for the reposting clause quoted above.
   If it says anything different, tell me before setting the key.
3. In Railway (project desirable-serenity, service strale), set
   `FRANCE_TRAVAIL_CLIENT_ID`, `FRANCE_TRAVAIL_CLIENT_SECRET`,
   `USAJOBS_API_KEY`, and `USAJOBS_USER_AGENT` (the email the key was registered
   to).

After step 3, a session adds fr/us known answers to
`manifests/job-board-search.yaml`, backfills them, verifies them in production,
and sets those env-manifest rows' `set_in` to `railway`.

## After deploy (this batch)

- `onboard.ts --manifest ../../manifests/<slug>.yaml --backfill` (dry run first,
  with the write grant) for `gas-price-check`, `wallet-balance-lookup`,
  `wallet-transactions-lookup`, and `wallet-age-check`. This inserts the
  per-chain known-answer rows.
- `sync-manifest-canonical-to-db.ts <slug> --all-fields` for those four and
  `job-board-search`.
- Verify each chain's known-answer result in `test_results`, using real latency
  rather than a schema check.
