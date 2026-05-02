/**
 * Curated registry of known-rug contract bytecodes.
 *
 * Each entry maps a normalized SHA-256 hash of deployed bytecode to its
 * provenance. v0.1 seeds with a small set of known patterns; v0.2 expands
 * via continuous indexing of new rugs from REKT Database + DefiLlama Hacks
 * + ScamSniffer reports.
 *
 * Normalization strategy:
 *   - Strip the trailing CBOR metadata block (Solidity 0.8.x appends a
 *     ~53-byte CBOR-encoded metadata hash; same source compiled twice
 *     produces different metadata so we exclude it)
 *   - Lowercase
 *   - SHA-256 the resulting bytes
 *
 * Per DEC-20260428-A, all entries verified manually from public on-chain
 * reads; no scraping.
 *
 * v0.1 seed is intentionally small. The infrastructure (hashing,
 * normalization, lookup) is what compounds — adding more entries is a
 * data-curation task, not an engineering one. As a Strale-internal
 * artifact this is data-as-moat: every new rug we hash and add raises
 * the cost of competitors replicating the index.
 *
 * Seeding criteria (to keep the index high-precision):
 *   - The bytecode pattern, when matched in a NEW deployment, must
 *     correlate with rug/scam intent (honeypot transfer hooks,
 *     drainer factories, sell-blocking ERC-20 templates).
 *   - Exploit-target contracts (e.g. Nomad Replica, Euler eToken,
 *     Curve pools) are EXPLICITLY NOT in scope: their bytecode
 *     re-appearing in a fork is normal, not a rug signal.
 *   - Each entry needs a public postmortem URL we can republish under
 *     `provenance.primary_source_reference` per DEC-20260428-A.
 *
 * 2026-05-01 curation pass: rejected 7 exploit-target candidates
 * (PAID, Nomad, Euler eUSDC/eDAI, Curve CRV/ETH, Harvest fUSDC,
 * dForce Lendf.Me) on the false-positive-risk argument above. Right
 * sources for the next pass are honeypot/drainer catalogs (GoPlus
 * Token Security API, Tokensniffer, Forta scam-detector bot) — these
 * publish pattern bytecode where match = malicious by definition.
 */

export interface KnownRugBytecodeEntry {
  bytecode_sha256: string;
  pattern_name: string;
  first_seen_address: string;
  first_seen_chain: string;
  first_seen_at: string;
  classification: "rug_pull" | "honeypot" | "drainer_factory" | "scam_token";
  amount_lost_usd_estimate: number | null;
  notes: string;
}

export const KNOWN_RUG_BYTECODES: readonly KnownRugBytecodeEntry[] = [];

const HASH_INDEX: Map<string, KnownRugBytecodeEntry> = new Map();
for (const entry of KNOWN_RUG_BYTECODES) {
  HASH_INDEX.set(entry.bytecode_sha256.toLowerCase(), entry);
}

export function lookupRugBytecode(hash: string): KnownRugBytecodeEntry | null {
  return HASH_INDEX.get(hash.toLowerCase()) ?? null;
}

export function getRugBytecodeCount(): number {
  return KNOWN_RUG_BYTECODES.length;
}
