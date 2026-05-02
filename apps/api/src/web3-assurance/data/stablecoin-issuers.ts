/**
 * Stablecoin issuer registry for the stablecoin-issuer evaluator.
 *
 * Maps known stablecoin contract addresses to their issuer + regulatory
 * jurisdiction + freeze-capability + redemption model. Direct value to
 * EU-CASP buyers ahead of MiCA Q3 2026 enforcement: agents receiving
 * USDC vs USDT vs DAI vs PYUSD have materially different freeze risk,
 * deposit-insurance status, and regulatory exposure.
 *
 * Data sourced from public regulator filings + issuer disclosures. Not
 * scraping; all entries verified manually against issuer documentation.
 */

export type StablecoinJurisdiction =
  | "US_NY_BitLicense"
  | "US_OCC"
  | "EU_MiCA_EMI"
  | "BVI"
  | "Bermuda"
  | "decentralized"
  | "unknown";

export type FreezeCapability = "freezable" | "non_freezable" | "limited_freeze";

export interface StablecoinIssuerEntry {
  contract_address: string;
  chain: string;
  symbol: string;
  issuer: string;
  jurisdiction: StablecoinJurisdiction;
  freeze_capability: FreezeCapability;
  reserve_disclosure: "monthly_attestation" | "quarterly_attestation" | "audited_annual" | "on_chain_only" | "opaque";
  mica_compliant: boolean;
  notes: string;
}

export const STABLECOIN_ISSUERS: readonly StablecoinIssuerEntry[] = [
  {
    contract_address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chain: "ethereum",
    symbol: "USDC",
    issuer: "Circle",
    jurisdiction: "EU_MiCA_EMI",
    freeze_capability: "freezable",
    reserve_disclosure: "monthly_attestation",
    mica_compliant: true,
    notes:
      "Circle holds an EMI license in France (ACPR-authorised) and is MiCA-compliant in the EU as of 2024-07. Reserves are monthly-attested by Deloitte.",
  },
  {
    contract_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
    chain: "base",
    symbol: "USDC",
    issuer: "Circle",
    jurisdiction: "EU_MiCA_EMI",
    freeze_capability: "freezable",
    reserve_disclosure: "monthly_attestation",
    mica_compliant: true,
    notes: "Same issuer as Ethereum mainnet USDC.",
  },
  {
    contract_address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    chain: "ethereum",
    symbol: "USDT",
    issuer: "Tether",
    jurisdiction: "BVI",
    freeze_capability: "freezable",
    reserve_disclosure: "quarterly_attestation",
    mica_compliant: false,
    notes:
      "Tether is BVI-domiciled and has not obtained MiCA authorisation. EU CASPs are de-listing USDT post-MiCA enforcement; receiving USDT in EU jurisdictions raises regulatory risk for the recipient.",
  },
  {
    contract_address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    chain: "ethereum",
    symbol: "DAI",
    issuer: "MakerDAO",
    jurisdiction: "decentralized",
    freeze_capability: "non_freezable",
    reserve_disclosure: "on_chain_only",
    mica_compliant: false,
    notes:
      "DAI is governed by MakerDAO with on-chain collateral. No issuer entity to freeze; reserves are observable on-chain. Not MiCA-authorised because there is no centralised issuer to authorise.",
  },
  {
    contract_address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
    chain: "ethereum",
    symbol: "PYUSD",
    issuer: "Paxos (PayPal partnership)",
    jurisdiction: "US_NY_BitLicense",
    freeze_capability: "freezable",
    reserve_disclosure: "monthly_attestation",
    mica_compliant: false,
    notes:
      "Paxos issues under NYDFS BitLicense. Not MiCA-authorised; EU receipt may require additional compliance review.",
  },
  {
    contract_address: "0x4c9edd5852cd905f086c759e8383e09bff1e68b3",
    chain: "ethereum",
    symbol: "USDe",
    issuer: "Ethena Labs",
    jurisdiction: "BVI",
    freeze_capability: "limited_freeze",
    reserve_disclosure: "monthly_attestation",
    mica_compliant: false,
    notes:
      "Synthetic-dollar backed by perp-funding-rate strategies, not classical fiat reserves. Different risk profile from regulated stablecoins.",
  },
  {
    contract_address: "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409",
    chain: "ethereum",
    symbol: "FDUSD",
    issuer: "First Digital Trust",
    jurisdiction: "Bermuda",
    freeze_capability: "freezable",
    reserve_disclosure: "monthly_attestation",
    mica_compliant: false,
    notes: "First Digital is HK-based with Bermuda trust structure. Not MiCA-authorised.",
  },
  {
    contract_address: "0x8e870d67f660d95d5be530380d0ec0bd388289e1",
    chain: "ethereum",
    symbol: "USDP",
    issuer: "Paxos",
    jurisdiction: "US_NY_BitLicense",
    freeze_capability: "freezable",
    reserve_disclosure: "monthly_attestation",
    mica_compliant: false,
    notes: "Paxos USD; same issuer regime as PYUSD.",
  },
];

const ADDRESS_INDEX: Map<string, StablecoinIssuerEntry> = new Map();
for (const entry of STABLECOIN_ISSUERS) {
  ADDRESS_INDEX.set(`${entry.chain}:${entry.contract_address.toLowerCase()}`, entry);
}

export function lookupStablecoinIssuer(
  contractAddress: string,
  chain: string,
): StablecoinIssuerEntry | null {
  return (
    ADDRESS_INDEX.get(`${chain.toLowerCase()}:${contractAddress.toLowerCase()}`) ?? null
  );
}
