Intent: Carry out DQ-37 as approved by Petter — correct the remaining web3 methodology source claims and verify them in production.

# DQ-37: web3 methodology sources

Petter approved DQ-37 on 2026-10-23. `apps/api/src/web3-assurance/methodology.ts`
now credits:
- `wallet-identity` to Alchemy (Ethereum mainnet);
- `contract-verification` to Sourcify + Alchemy (Ethereum mainnet).

These are marked "not currently offered":
- `wallet-history-risk` (no licensed source; GoPlus has been off since
  2026-09-10);
- `sister-rug`, `wallet-velocity` and `stablecoin-issuer` (they need a
  commercial Etherscan plan; `etherscanFetch` refuses without one).

The reason codes `WALLET_MALICIOUS`, `WALLET_HISTORY_CLEAN` and
`TOKEN_SAFETY_OK`, all credited to GoPlus, are removed from the published
glossary. `WALLET_MALICIOUS` is also removed from the explanations in
`explanation.ts`. None of the three can be produced: their evaluators wrap
deactivated tools, which are not registered, so they return `ok: false`.

**Left as is, outside the approved table:**
- `CONTRACT_UNVERIFIED` still says "not verified on Etherscan or Sourcify".
- An illustrative Etherscan example remains in the disagreements field
  description.
- The other `wallet-history-risk` reason-code explanations (phishing and the
  like) remain. They do not name GoPlus but share the dead evaluator.

**Checks:** the root `typecheck` passes after building the MCP and SDK
packages. The web3-assurance tests pass.

**Verify after deploy:** `GET /v1/web3-assurance/methodology` no longer
contains "GoPlus", and shows the new sources.
