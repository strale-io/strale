Intent: Close the x402 public price-representation drift without changing what customers are challenged or charged.

# Outcome

- PR [#459](https://github.com/strale-io/strale/pull/459) merged as
  `74117c51ded7fae809a6430a797b46fb52243b2a` after repository and
  disposable-database CI passed.
- Manifest and OpenAPI prices now derive from the canonical integer USDC
  atomic amount and publish fixed six-decimal strings for capabilities and
  solutions.
- Fail-before tests independently reproduced both mappings on both surfaces.
  Pass-after coverage follows a two-cent fixture through catalog, manifest,
  OpenAPI, v2 challenge, facilitator verify, and mocked settle.
- Independent technical, product, and exact-commit reviews passed with zero
  high or medium findings. Claude Opus and Sonnet timed out; founder-authorized
  Codex fallback sessions were used and all are complete.
- Production stayed on merge SHA `74117c51ded7` through the full cache window.
  Live `csv-clean` returned catalog `0.0216`, discovery `"0.021600"`, and
  challenge `"21600"`. No payment was submitted.
- The protected decision and collision-resolution evidence remained
  byte-for-byte unchanged. Repo-native authority is still inactive.
- Journal: [Session log — x402 price representation parity 2026-09-01](https://app.notion.com/p/3ce67c87082c815cb2f0cfae11d56906?pvs=204).

# Open

- `@agentcash/discovery@1.7.5` discards the existing OpenAPI payment metadata
  because Strale publishes `protocols: ["x402"]` while that parser expects
  protocol records. This is pre-existing and unchanged by PR #459. Handle it as
  a separate public-contract change with a parser contract test.
- Claude cross-provider verification remains backlogged because both Claude
  review attempts timed out; no implementation blocker remains.
- Three old Notion To-do rows owned by Claude code still say `In progress`
  despite last updates in April/May 2026. They were not mutated.

# Non-obvious learnings

- Public decimal metadata must be rendered from integer atomic units; applying
  `toFixed` independently on each surface creates contradictory prices even
  when settlement itself is exact.
- Money-path tests need to exercise the production `priceUsdOverride` branch
  and observe the same requirements object at both facilitator verify and
  settle.
- Discovery-parser compatibility is a separate contract from raw OpenAPI JSON
  correctness; changing both in one money-critical patch would obscure risk.

# Cost

No metered API spend and no production payment; subscription-included routes
only.
