Intent: Carry out Phase 0 of the portfolio plan (catalogue repairs) and draft the sanctions-source correction for Petter.

# Phase 0 catalogue repairs (block 0121) and DQ-36

Petter asked on 2026-10-23 for the Phase 0 repairs from
[the portfolio plan](../../../docs/strategy/2026-10-23-portfolio-plan.md).
Each was verified in production read-only before the change.

**Block 0121** (`runMigration0121_phase0CatalogueRepairs`, ledger M064) runs once
on the next boot. It does four things:
1. **Delists the Danish bundles.** `kyb-essentials-dk`, `kyb-complete-dk`,
   `invoice-verify-dk` and `kyc-denmark` depend on `danish-company-data`, which
   had 0 completed of 197 calls in 90 days. None of the four had an external
   call in that window.
2. **Repairs `kyb-complete-se`.** It removes the dead `credit-report-summary`
   step, moves `risk-narrative-generate` from position 14 to 13, removes the
   credit-report claim from the long description, and relists the bundle.
3. **Puts 15 bundles and 3 tools on x402.** The bundles are the
   AT/GR/HR/IE/SG kyb-essentials, kyb-complete and invoice-verify families.
   The tools are `cz-unreliable-vat-payer`, `no-bankruptcy-check` and
   `fr-bodacc-lookup`. All components pass the capability gate with 100% over
   7 days.
4. **Narrows five descriptions to what is served.**
   - The wallet and gas tools now say Ethereum mainnet only: the Alchemy app
     has no other networks, and Base calls failed 3 of 3.
   - `job-board-search` now says Sweden only: the France and US keys are not
     set on Railway.

The manifests carry the same narrowed text. Three tools that were
deactivated in the database (`officer-search`, `website-to-company`,
`us-court-search`) are now also in the `DEACTIVATED` map.

**DQ-36** (`your_call`) drafts the sanctions and web3 methodology correction:
- "UK OFSI" becomes the UK Sanctions List (the OFSI list closed 2026-01-28).
- The web3 methodology still names Etherscan, GoPlus and "direct
  OFAC/UN/EU/OFSI lists"; none of these is used.

Nothing is published until Petter approves.

**Mail check for Petter, the same day (read-only):**
- **Openapi resale addendum (case 151296): never countersigned.**
  - The ticket closed on 17 May for lack of reply.
  - Openapi's billing team said Moonlighter's VAT number SE5593957979 is not
    in VIES, re-invoiced with 25% VAT, and asked for a €12.50 difference.
  - `OPENAPI_ENABLED` is not set on Railway.
  - DQ-6 was dropped from the queue on 2026-08-16 without a resolution.
- **Danish CVR applications:** sent 12 April, 15 May and 12 August, with no
  reply.
- **HMRC:**
  - The production credentials request has been with the DRM team since
    May.
  - **The sandbox app will be deleted around 12 November** unless an API call
    is made before then.
- **KVK** is closed to foreign entities. **InfoCamere** offered a paid
  contract. **KBO** has not replied.
- Petter's standing preference: no fixed or recurring-cost services before
  recurring revenue.

**Independent review:** PASS WITH FIXES, all applied.
- The step renumber now runs unconditionally, guarded on slot 13 being free.
- `seed-kyb-solutions.ts` no longer rebuilds the SE credit-report step or its
  copy.
- The tests now assert the step order and the renumber scope. Each was
  mutation-checked: a broken guard and a swapped order both fail.

**Follow-up, open:** the wallet and gas tools' `input_schema`, `data_source`
and limitation text, and `TRANSFER_CHAINS`/`GAS_CHAINS`, still list Base,
Arbitrum, Optimism, Polygon and BNB.
- Today a call for one of them fails with Alchemy's HTTP 403 instead of a clean
  refusal.
- Narrowing the lists breaks six routing tests that cover those networks.
- **The right fix depends on Petter:** either he enables the networks on the
  Alchemy app (an account action), or the lists and schema are narrowed
  together and the routing tests are rewritten.

**Verify after deploy:**
1. In the boot log, block 0121's outcome shows 4 delisted, 1 step removed, 1
   relisted, 15 bundles and 3 capabilities on x402, and 5 descriptions narrowed.
2. `GET /x402/catalog` includes the new bundles and tools, and excludes
   `kyc-denmark`.
3. `/v1/solutions` no longer lists the DK bundles, and does list
   `kyb-complete-se`.
