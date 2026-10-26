Intent: Carry out DQ-38 — remove false web3 regulatory claims from the public methodology.

# DQ-38: web3 regulatory claims

Approved by Petter on 2026-10-24.

**Methodology (`/v1/web3-assurance/methodology`):**
- `regulatory_posture` no longer claims OFAC crypto-address screening, Travel
  Rule transmission or a "jurisdiction-aware verdict surface". It now states
  name screening of protocols and domains via Dilisense, no wallet-address
  OFAC screening, and no Travel Rule support.
- `contract-verification` is credited to Sourcify only.

**Reason codes:** 16 glossary codes are removed from `methodology.ts` and their
explainers from `explanation.ts`. They are the eight `WALLET_*` codes, the seven
`TOKEN_*` codes and `APPROVALS_RISKY`. Their only producers are the
`wallet-history-risk`, `token-safety` and `approval-inventory` evaluators.
Those wrap the deactivated `wallet-risk-score`, `token-security-check` and
`approval-security-check`, which are not registered, so they return
`ok: false`.

**Code:**
- `verdict.ts` no longer pushes `WALLET_HISTORY_CLEAN` or `TOKEN_SAFETY_OK`.
- `disagreement.ts` no longer emits `contract_verification_mismatch`: both of
  its inputs now come from Sourcify, so it compared Sourcify with itself.

**Checks:** typecheck and web3-assurance tests pass.

**Verify after deploy:** the methodology response contains neither "crypto-specific
addresses screened" nor "Travel Rule transmission supported", nor any of the 16
codes.
