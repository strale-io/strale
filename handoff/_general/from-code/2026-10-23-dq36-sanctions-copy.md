Intent: Carry out DQ-36 as approved by Petter — correct the sanctions and web3 methodology source copy, and verify it in production.

# DQ-36: sanctions and methodology source copy

Petter approved DQ-36 on 2026-10-23: "I approve DQ-36 as drafted".

**"UK OFSI" is now "the UK Sanctions List".** The OFSI Consolidated List closed
on 2026-01-28. Corrected in:
- the `sanctions-check` manifest description and data source;
- the npm `strale-capabilities` JSON;
- `seed-limitations.ts`;
- the web3 `SANCTIONS_MATCH` text in `methodology.ts` and `explanation.ts`;
- the DPIA;
- the coverage-matrix row;
- the executor comment.

**Web3 methodology sources:**
- sanctions: "Dilisense consolidated sanctions database". There are no direct
  list fetches.
- wallet transactions and balance: "Alchemy (Ethereum mainnet)".
- token-safety and approval-inventory: "not currently offered (no licensed
  source)". The GoPlus tools have been off since 2026-09-10.

**Unchanged on purpose:**
- `lib/dilisense-sources.ts` mirrors Dilisense's own labels, including
  "HMT OFSI".
- The manifest's example output quotes them too.

**Production:** block 0122 (ledger M065) rewrites `sanctions-check`'s
`description` and `data_source`, guarded on the exact old text, and runs once.
No other production row named OFSI as Strale's own claim; checked read-only on
2026-10-23.

**Not done:**
- The npm package `strale-capabilities` is not republished. Its JSON is
  regenerated from the live API by `generate.js` whenever it is next published.
- The web3 methodology entry `contract-verification` still names Etherscan's
  getsourcecode. It was not in the approved table, so it is left for a separate
  check.

**Verify after deploy:**
1. `GET /v1/capabilities` shows the new `sanctions-check` description.
2. `GET /v1/web3-assurance/methodology` shows the new sources and reason-code
   text.
