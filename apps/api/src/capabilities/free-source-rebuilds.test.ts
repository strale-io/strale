/**
 * The six capabilities rebuilt 2026-09-11 onto sources whose terms permit
 * resale (vendor-terms audit batch 2): four on Alchemy, contract verification
 * on Sourcify, job search on JobTech (CC0). Each executor is run against
 * responses in the upstream's real shape, and every request it makes is
 * recorded, so a test fails if a rebuild ever reaches a host other than its
 * licensed one.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { feeTiers } from "./gas-price-check.js";
import { mergeTransactions } from "./wallet-transactions-lookup.js";
import { earliest } from "./wallet-age-check.js";
import { fromSourcify, sourcifyRefusal } from "./contract-verify-check.js";
import { recentTokens } from "./wallet-balance-lookup.js";
import { franceTravailLocation, resetFranceTravailTokenForTests, usajobsSalary } from "./job-board-search.js";
import { CHAINS, resolveChain, TRANSFER_CHAINS, type AssetTransfer } from "./lib/alchemy-client.js";

const W = "0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe";
let requests: { url: string; method?: string; params?: unknown[] }[] = [];

const tx = (over: Partial<AssetTransfer>): AssetTransfer => ({
  blockNum: "0x10", hash: "0xh", from: "0xa", to: "0xb", value: 1, asset: "ETH", category: "external",
  metadata: { blockTimestamp: "2015-08-08T15:44:00.000Z" }, ...over,
});

/** Routes Alchemy JSON-RPC by method; anything else by URL. */
function mockUpstreams(rpc: Record<string, (params: unknown[]) => unknown>, other: (url: string) => Response = () => new Response("nope", { status: 500 })) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (/^https:\/\/[a-z]+-mainnet\.g\.alchemy\.com\/v2\//.test(url)) {
      const body = JSON.parse(String(init?.body));
      requests.push({ url, method: body.method, params: body.params });
      const handler = rpc[body.method];
      if (!handler) return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { message: "unmocked" } }));
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: handler(body.params) }));
    }
    requests.push({ url });
    return other(url);
  });
}

const run = (slug: string, input: Record<string, unknown>) =>
  getDirectExecutor(slug)!(input) as Promise<{ output: Record<string, unknown>; provenance: Record<string, unknown> }>;

const ALCHEMY_HOSTS = Object.values(CHAINS).map((c) => c.host).join("|");
const LICENSED = [new RegExp(`^https://(${ALCHEMY_HOSTS})\\.g\\.alchemy\\.com/v2/`), /^https:\/\/sourcify\.dev\/server\/v2\//, /^https:\/\/jobsearch\.api\.jobtechdev\.se\//,
  /^https:\/\/entreprise\.francetravail\.fr\/connexion\/oauth2\/access_token\?realm=%2Fpartenaire$/,
  /^https:\/\/api\.francetravail\.io\/partenaire\/offresdemploi\/v2\/offres\/search\?/,
  /^https:\/\/data\.usajobs\.gov\/api\/search\?/];

beforeAll(async () => {
  for (const m of ["gas-price-check", "wallet-balance-lookup", "wallet-transactions-lookup", "wallet-age-check", "contract-verify-check", "job-board-search"]) {
    await import(`./${m}.js`);
  }
});
beforeEach(() => { requests = []; process.env.ALCHEMY_API_KEY = "test-key"; });
afterEach(() => {
  for (const r of requests) expect(LICENSED.some((re) => re.test(r.url)), `unlicensed request: ${r.url}`).toBe(true);
  vi.restoreAllMocks();
  delete process.env.ALCHEMY_API_KEY;
});

describe("chain resolution", () => {
  it("accepts ids, numbers, hex ids and names, and defaults to Ethereum", () => {
    expect(resolveChain({}, TRANSFER_CHAINS, "chain_id").id).toBe("1");
    expect(resolveChain({ chain_id: 8453 }, TRANSFER_CHAINS, "chain_id").id).toBe("8453");
    expect(resolveChain({ chain_id: "0x2105" }, TRANSFER_CHAINS, "chain_id").id).toBe("8453");
    expect(resolveChain({ chain: "Arbitrum" }, TRANSFER_CHAINS, "chain_id", "chain").id).toBe("42161");
    expect(resolveChain({ chain_id: "matic" }, TRANSFER_CHAINS, "chain_id").id).toBe("137");
    expect(resolveChain({ chain_id: "op" }, TRANSFER_CHAINS, "chain_id").id).toBe("10");
  });
  it("refuses a chain the capability does not serve, naming the ones it does", () => {
    expect(() => resolveChain({ chain_id: "56" }, TRANSFER_CHAINS, "chain_id")).toThrow(/must be one of 1 \(Ethereum\), 8453 \(Base\), 42161 \(Arbitrum One\), 10 \(OP Mainnet\), 137 \(Polygon PoS\); '56'/);
    expect(() => resolveChain({ chain_id: "41923" }, TRANSFER_CHAINS, "chain_id")).toThrow(/not supported/);
    expect(() => resolveChain({ chain_id: "0xzz" }, TRANSFER_CHAINS, "chain_id")).toThrow(/not supported/);
    for (const chain_id of ["constructor", "__proto__", "toString"]) {
      expect(() => resolveChain({ chain_id }, TRANSFER_CHAINS, "chain_id")).toThrow(/not supported/);
    }
  });
});

describe("gas-price-check (Alchemy eth_feeHistory)", () => {
  it("computes tiers as next base fee plus median tips", () => {
    const t = feeTiers({
      baseFeePerGas: ["0x3b9aca00", "0x3b9aca00", "0x77359400"], // 1, 1, 2 gwei — the last is the next block
      gasUsedRatio: [0.5, 0.25],
      reward: [["0x3b9aca00", "0x77359400", "0xb2d05e00"], ["0x3b9aca00", "0x77359400", "0xb2d05e00"]], // 1 / 2 / 3 gwei
    });
    expect(t).toEqual({ safe_gas_gwei: 3, proposed_gas_gwei: 4, fast_gas_gwei: 5, base_fee_gwei: 2, gas_used_ratio: "0.5,0.25" });
  });
  it("serves mainnet and refuses other chains", async () => {
    mockUpstreams({ eth_feeHistory: () => ({ baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"], gasUsedRatio: [0.5], reward: [["0x1", "0x2", "0x3"]] }) });
    const r = await run("gas-price-check", {});
    expect(r.output.chain_id).toBe("1");
    expect(r.output.blocks_sampled).toBe(20);
    expect(requests[0].params?.[2]).toEqual([10, 50, 90]);
    await expect(run("gas-price-check", { chain_id: "8453" })).rejects.toThrow(/Base is a rollup/);
  });
  it("accepts every spelling of mainnet a caller might send", async () => {
    mockUpstreams({ eth_feeHistory: () => ({ baseFeePerGas: ["0x1", "0x1"], gasUsedRatio: [0.5], reward: [["0x1", "0x1", "0x1"]] }) });
    for (const chain_id of [1, "1", "0x1", "ethereum", "Mainnet", "eth"]) {
      expect((await run("gas-price-check", { chain_id })).output.chain_id, String(chain_id)).toBe("1");
    }
  });
  it("names the missing licence instead of calling anything when no key is set", async () => {
    delete process.env.ALCHEMY_API_KEY;
    mockUpstreams({});
    await expect(run("gas-price-check", {})).rejects.toThrow(/No licensed Ethereum RPC endpoint/);
    expect(requests).toEqual([]);
  });
});

describe("wallet-balance-lookup (Alchemy)", () => {
  it("returns the ETH balance and recent tokens with names", async () => {
    mockUpstreams({
      eth_getBalance: () => "0xde0b6b3a7640000", // 1 ETH
      alchemy_getAssetTransfers: (p) => ({ transfers: (p[0] as { toAddress?: string }).toAddress
        ? [tx({ category: "erc20", asset: "USDC", blockNum: "0x20", rawContract: { address: "0xA0b8" } })]
        : [tx({ category: "erc20", asset: "DAI", blockNum: "0x10", rawContract: { address: "0x6B17" } })] }),
      alchemy_getTokenMetadata: (p) => ({ name: p[0] === "0xA0b8" ? "USD Coin" : null }),
    });
    const r = await run("wallet-balance-lookup", { address: W });
    expect(r.output.native_balance_eth).toBe(1);
    expect(r.output.native_balance_wei).toBe("1000000000000000000");
    expect(r.output.recent_tokens).toEqual([
      { name: "USD Coin", symbol: "USDC", address: "0xA0b8" },
      { name: "Unknown", symbol: "DAI", address: "0x6B17" },
    ]);
  });
  it("dedupes tokens newest first", () => {
    const t = recentTokens([
      tx({ asset: "A", blockNum: "0x1", rawContract: { address: "0xaa" } }),
      tx({ asset: "A", blockNum: "0x5", rawContract: { address: "0xAA" } }),
      tx({ asset: "B", blockNum: "0x3", rawContract: { address: "0xbb" } }),
    ]);
    expect(t.map((x) => x.symbol)).toEqual(["A", "B"]);
  });
  it("refuses a malformed address before any request", async () => {
    mockUpstreams({});
    await expect(run("wallet-balance-lookup", { address: "0x123" })).rejects.toThrow(/must be an Ethereum address/);
    expect(requests).toEqual([]);
  });
});

describe("wallet-transactions-lookup (Alchemy transfer index)", () => {
  it("merges both directions newest first and says what it cannot know", () => {
    const m = mergeTransactions(W, [tx({ hash: "0x1", blockNum: "0x1", from: "0xother", to: W })], [tx({ hash: "0x2", blockNum: "0x2", from: W, to: "0xother", value: 0.5 })], 10);
    expect(m.transactions.map((t) => t.hash)).toEqual(["0x2", "0x1"]);
    expect(m.sent_count).toBe(1);
    expect(m.received_count).toBe(1);
    expect(m.transactions[0]).toMatchObject({ direction: "sent", value_eth: 0.5, gas_used: null, is_error: null, block_number: 2 });
  });
  it("caps at the limit and carries the note", async () => {
    mockUpstreams({ alchemy_getAssetTransfers: () => ({ transfers: [tx({ hash: "0x1" }), tx({ hash: "0x2", blockNum: "0x11" })] }) });
    const r = await run("wallet-transactions-lookup", { address: W, limit: 1 });
    expect(r.output.total_returned).toBe(1);
    expect(String(r.output.note)).toMatch(/Gas used and failure status are not available/);
  });
});

describe("wallet-age-check (Alchemy transfer index)", () => {
  it("takes the earlier of the first incoming and first outgoing transfer", () => {
    expect(earliest(tx({ hash: "in", blockNum: "0x9" }), tx({ hash: "out", blockNum: "0x3" }))?.hash).toBe("out");
    expect(earliest(undefined, tx({ hash: "out" }))?.hash).toBe("out");
    expect(earliest(undefined, undefined)).toBeUndefined();
  });
  it("reports an unused wallet as having no activity", async () => {
    mockUpstreams({ alchemy_getAssetTransfers: () => ({ transfers: [] }) });
    const r = await run("wallet-age-check", { address: W });
    expect(r.output).toMatchObject({ has_activity: false, first_tx_date: null, age_days: 0 });
  });
  it("dates a wallet from its first outgoing transfer when that came first", async () => {
    mockUpstreams({
      alchemy_getAssetTransfers: (p) => ({ transfers: (p[0] as { fromAddress?: string }).fromAddress
        ? [tx({ hash: "0xout", blockNum: "0x5", metadata: { blockTimestamp: "2016-01-01T00:00:00.000Z" } })]
        : [tx({ hash: "0xin", blockNum: "0x9", metadata: { blockTimestamp: "2017-01-01T00:00:00.000Z" } })] }),
    });
    const r = await run("wallet-age-check", { address: W });
    expect(r.output).toMatchObject({ first_tx_hash: "0xout", first_tx_date: "2016-01-01T00:00:00.000Z" });
  });

  it("dates the wallet from its first transfer", async () => {
    mockUpstreams({ alchemy_getAssetTransfers: () => ({ transfers: [tx({ hash: "0xfirst" })] }) });
    const r = await run("wallet-age-check", { address: W });
    expect(r.output).toMatchObject({ has_activity: true, first_tx_date: "2015-08-08T15:44:00.000Z", first_tx_hash: "0xfirst" });
    expect(Number(r.output.age_days)).toBeGreaterThan(3000);
  });
});

describe("contract-verify-check (Sourcify)", () => {
  const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
  const record = {
    match: "match",
    compilation: { name: "FiatTokenProxy", compilerVersion: "0.4.24+commit.e67f0147", compilerSettings: { optimizer: { enabled: false }, evmVersion: "byzantium" } },
    proxyResolution: { isProxy: true, implementations: [{ address: "0x43506849D7C04F9138D1A2050bbF3A0c054402dd" }] },
  };
  it("maps a verified record", () => {
    expect(fromSourcify(USDC, "1", record)).toMatchObject({
      is_verified: true, contract_name: "FiatTokenProxy", compiler_version: "0.4.24+commit.e67f0147",
      optimization_used: false, is_proxy: true, implementation_address: "0x43506849D7C04F9138D1A2050bbF3A0c054402dd",
      evm_version: "byzantium", license_type: null, verification_source: "sourcify",
    });
  });
  it("treats a record without a match as not verified", () => {
    expect(fromSourcify(USDC, "1", { ...record, match: null })).toMatchObject({ is_verified: false, verification_source: "sourcify" });
  });

  it("reads a 404 as not verified on Sourcify, and says so", async () => {
    mockUpstreams({}, () => new Response("", { status: 404 }));
    const r = await run("contract-verify-check", { contract_address: USDC, chain_id: "56" });
    expect(requests[0].url).toBe(`https://sourcify.dev/server/v2/contract/56/${USDC}?fields=compilation,proxyResolution`);
    expect(r.output).toMatchObject({ is_verified: false, verification_source: "sourcify" });
    expect(String(r.output.note)).toMatch(/Not verified on Sourcify/);
  });
  it("serves a verified record", async () => {
    mockUpstreams({}, () => new Response(JSON.stringify(record)));
    const r = await run("contract-verify-check", { contract_address: USDC });
    expect(r.output.is_verified).toBe(true);
    expect(r.provenance.source).toBe("sourcify.dev");
  });
  it("passes Sourcify's own explanation through when it refuses", async () => {
    mockUpstreams({}, () => new Response(JSON.stringify({ customCode: "unsupported_chain", message: "Chain 999999999999 not found" }), { status: 400 }));
    await expect(run("contract-verify-check", { contract_address: USDC, chain_id: "999999999999" }))
      .rejects.toThrow("Sourcify returned HTTP 400: Chain 999999999999 not found");
  });

  it("reads an error body that is not JSON without crashing", async () => {
    expect(sourcifyRefusal("<html>502 Bad Gateway</html>")).toBe(".");
    expect(sourcifyRefusal("")).toBe(".");
    expect(sourcifyRefusal('{"message":"  "}')).toBe(".");
    expect(sourcifyRefusal(JSON.stringify({ message: "x".repeat(500) }))).toBe(`: ${"x".repeat(160)}`);
    mockUpstreams({}, () => new Response("<html>502 Bad Gateway</html>", { status: 502 }));
    await expect(run("contract-verify-check", { contract_address: USDC })).rejects.toThrow(/^Sourcify returned HTTP 502\.$/);
  });

  it("refuses a non-numeric chain id before any request", async () => {
    mockUpstreams({});
    await expect(run("contract-verify-check", { contract_address: USDC, chain_id: "../x" })).rejects.toThrow(/numeric EVM chain id/);
    expect(requests).toEqual([]);
  });
});

describe("job-board-search (JobTech, CC0)", () => {
  const hit = {
    headline: "Sjuksköterska", employer: { name: "Region X", email: "rekrytering@region.se", phone_number: "+46 8 123 45 67", organization_number: "2321000000" },
    workplace_address: { municipality: "Stockholm" }, salary_description: "Månadslön", webpage_url: "https://arbetsformedlingen.se/platsbanken/annonser/1",
    publication_date: "2026-09-10T00:00:00", application_contacts: [{ name: "Anna Andersson", email: "anna@region.se", telephone: "070-000 00 00" }],
    application_details: { email: "jobb@region.se", url: null },
  };
  it("returns listings and never a contact person's name, email or phone", async () => {
    mockUpstreams({}, () => new Response(JSON.stringify({ total: { value: 1 }, hits: [hit] })));
    const r = await run("job-board-search", { query: "sjuksköterska" });
    expect(r.output.jobs).toEqual([{
      title: "Sjuksköterska", company: "Region X", location: "Stockholm", salary_range: "Månadslön",
      url: "https://arbetsformedlingen.se/platsbanken/annonser/1", posted_date: "2026-09-10T00:00:00", source: "arbetsformedlingen.se",
    }]);
    const text = JSON.stringify(r);
    for (const pii of ["Anna Andersson", "anna@region.se", "rekrytering@region.se", "jobb@region.se", "070-000", "+46 8"]) {
      expect(text, `leaked ${pii}`).not.toContain(pii);
    }
    expect(r.output.sources_queried).toEqual(["arbetsformedlingen.se"]);
  });
  it("refuses other countries without calling anything", async () => {
    mockUpstreams({});
    for (const country_code of ["constructor", "__proto__", "toString"]) {
      await expect(run("job-board-search", { query: "developer", country_code })).rejects.toThrow(/must be one of/);
    }
    await expect(run("job-board-search", { query: "developer", country_code: "gb" })).rejects.toThrow(/must be one of "se" \(Sweden\), "fr" \(France\), "us"/);
    expect(requests).toEqual([]);
  });
  it("surfaces the upstream failure instead of hiding it", async () => {
    mockUpstreams({}, () => new Response("down", { status: 503 }));
    await expect(run("job-board-search", { query: "x" })).rejects.toThrow(/HTTP 503/);
  });
});

describe("per-chain routing", () => {
  const fee = () => ({ baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"], gasUsedRatio: [0.5], reward: [["0x1", "0x2", "0x3"]] });
  it("gas price on Polygon and BNB goes to their own networks", async () => {
    mockUpstreams({ eth_feeHistory: fee });
    expect((await run("gas-price-check", { chain_id: "137" })).output.chain_id).toBe("137");
    expect((await run("gas-price-check", { chain: "bsc" })).output.chain_id).toBe("56");
    expect(requests.map((r) => new URL(r.url).host)).toEqual(["polygon-mainnet.g.alchemy.com", "bnb-mainnet.g.alchemy.com"]);
  });
  it("gas price refuses every rollup, with the reason, before any request", async () => {
    mockUpstreams({ eth_feeHistory: fee });
    for (const chain_id of ["8453", "base", "0xa4b1", "optimism"]) {
      await expect(run("gas-price-check", { chain_id })).rejects.toThrow(/is a rollup: most of a transaction's cost/);
    }
    await expect(run("gas-price-check", { chain_id: "41923" })).rejects.toThrow(/not supported/);
    await expect(run("gas-price-check", { chain_id: "", chain: "base" })).rejects.toThrow(/Base is a rollup/);
    expect(requests).toEqual([]);
  });
  it("wallet balance on Polygon reports POL and uses the Polygon network", async () => {
    mockUpstreams({ eth_getBalance: () => "0xde0b6b3a7640000", alchemy_getAssetTransfers: () => ({ transfers: [] }) });
    const r = await run("wallet-balance-lookup", { address: W, chain_id: "137" });
    expect(r.output).toMatchObject({ chain_id: "137", native_symbol: "POL", native_balance_eth: 1 });
    expect(new Set(requests.map((x) => new URL(x.url).host))).toEqual(new Set(["polygon-mainnet.g.alchemy.com"]));
  });
  it("wallet transactions on Arbitrum use the Arbitrum network and say which coin", async () => {
    mockUpstreams({ alchemy_getAssetTransfers: () => ({ transfers: [tx({ hash: "0xarb" })] }) });
    const r = await run("wallet-transactions-lookup", { address: W, chain: "arbitrum" });
    expect(r.output).toMatchObject({ chain_id: "42161", native_symbol: "ETH" });
    expect(new Set(requests.map((x) => new URL(x.url).host))).toEqual(new Set(["arb-mainnet.g.alchemy.com"]));
  });
  it("wallet transactions on Polygon name POL as the coin", async () => {
    mockUpstreams({ alchemy_getAssetTransfers: () => ({ transfers: [tx({ hash: "0xpol" })] }) });
    const r = await run("wallet-transactions-lookup", { address: W, chain_id: "137" });
    expect(r.output).toMatchObject({ chain_id: "137", native_symbol: "POL" });
  });
  it("wallet age refuses BNB Chain, whose transfer index Alchemy does not document", async () => {
    mockUpstreams({});
    await expect(run("wallet-age-check", { address: W, chain_id: "56" })).rejects.toThrow(/not supported/);
    expect(requests).toEqual([]);
  });
});

describe("job-board-search: France Travail", () => {
  const offer = {
    id: "201ABCD", intitule: "Infirmier (H/F)", entreprise: { nom: "Hôpital Y" }, lieuTravail: { libelle: "75 - Paris 15e Arrondissement" },
    salaire: { libelle: "Mensuel de 2500 Euros" }, dateCreation: "2026-09-10T08:00:00.000Z",
    contact: { nom: "Marie Dupont", coordonnees1: "marie.dupont@hopital.fr", telephone: "01 23 45 67 89", courriel: "rh@hopital.fr" },
  };
  beforeEach(() => { resetFranceTravailTokenForTests(); });
  afterEach(() => { delete process.env.FRANCE_TRAVAIL_CLIENT_ID; delete process.env.FRANCE_TRAVAIL_CLIENT_SECRET; });

  it("is refused, without any request, until its credentials are configured", async () => {
    mockUpstreams({});
    await expect(run("job-board-search", { query: "infirmier", country_code: "fr" })).rejects.toThrow(/Job search for France is not available yet/);
    expect(requests).toEqual([]);
  });
  it("searches with one cached token, maps offers, and never returns the contact", async () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "id"; process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "secret";
    mockUpstreams({}, (url) => url.includes("access_token")
      ? new Response(JSON.stringify({ access_token: "tok", expires_in: 1499 }))
      : new Response(JSON.stringify({ resultats: [offer] }), { status: 206, headers: { "Content-Range": "offres 0-9/345" } }));
    const r = await run("job-board-search", { query: "infirmier", country_code: "FR", location: "75" });
    await run("job-board-search", { query: "infirmier", country_code: "fr" });
    expect(requests.filter((q) => q.url.includes("access_token"))).toHaveLength(1);
    const search = new URL(requests[1].url);
    expect(search.searchParams.get("motsCles")).toBe("infirmier");
    expect(search.searchParams.get("departement")).toBe("75");
    expect(r.output).toMatchObject({ country_code: "fr", total_results: 345, sources_queried: ["francetravail.fr"] });
    expect(r.output.jobs).toEqual([{
      title: "Infirmier (H/F)", company: "Hôpital Y", location: "75 - Paris 15e Arrondissement", salary_range: "Mensuel de 2500 Euros",
      url: "https://candidat.francetravail.fr/offres/recherche/detail/201ABCD", posted_date: "2026-09-10T08:00:00.000Z", source: "francetravail.fr",
    }]);
    const text = JSON.stringify(r);
    for (const pii of ["Marie Dupont", "marie.dupont@", "rh@hopital", "01 23 45"]) expect(text, `leaked ${pii}`).not.toContain(pii);
  });
  it("refuses remote_only, which the search API has no documented filter for, before any request", async () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "id"; process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "secret";
    mockUpstreams({});
    await expect(run("job-board-search", { query: "dev", country_code: "fr", remote_only: true })).rejects.toThrow(/'remote_only' is not supported for France/);
    expect(requests).toEqual([]);
  });
  it("asks only for France Travail's own offers", async () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "id"; process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "secret";
    mockUpstreams({}, (url) => url.includes("access_token") ? new Response(JSON.stringify({ access_token: "t", expires_in: 60 })) : new Response(null, { status: 204 }));
    await run("job-board-search", { query: "dev", country_code: "fr" });
    expect(new URL(requests[1].url).searchParams.get("origineOffre")).toBe("1");
  });
  it("drops a rejected token and retries once with a fresh one", async () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "id"; process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "secret";
    let tokens = 0; let searches = 0;
    mockUpstreams({}, (url) => {
      if (url.includes("access_token")) return new Response(JSON.stringify({ access_token: `t${++tokens}`, expires_in: 1499 }));
      return ++searches === 1 ? new Response("", { status: 401 }) : new Response(null, { status: 204 });
    });
    const r = await run("job-board-search", { query: "dev", country_code: "fr" });
    expect(r.output).toMatchObject({ total_results: 0 });
    expect([tokens, searches]).toEqual([2, 2]);
  });
  it("reads 204 as no results", async () => {
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "id"; process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "secret";
    mockUpstreams({}, (url) => url.includes("access_token") ? new Response(JSON.stringify({ access_token: "t", expires_in: 60 })) : new Response(null, { status: 204 }));
    const r = await run("job-board-search", { query: "zzz", country_code: "fr" });
    expect(r.output).toMatchObject({ total_results: 0, jobs: [] });
  });
  it("takes a department or INSEE commune code, and refuses free text", () => {
    expect(franceTravailLocation("75")).toEqual({ departement: "75" });
    expect(franceTravailLocation("2a")).toEqual({ departement: "2A" });
    expect(franceTravailLocation("974")).toEqual({ departement: "974" });
    expect(franceTravailLocation("75115")).toEqual({ commune: "75115" });
    expect(franceTravailLocation(undefined)).toEqual({});
    expect(() => franceTravailLocation("Paris")).toThrow(/department number/);
  });
});

describe("job-board-search: USAJOBS", () => {
  const item = { MatchedObjectDescriptor: {
    PositionTitle: "Nurse", OrganizationName: "Veterans Health Administration", PositionLocationDisplay: "Denver, Colorado",
    PositionRemuneration: [{ MinimumRange: "80000", MaximumRange: "120000", RateIntervalCode: "PA", Description: "Per Year" }],
    PositionURI: "https://www.usajobs.gov:443/job/812345600", PublicationStartDate: "2026-09-09T00:00:00.0000",
    UserArea: { Details: { AgencyContactEmail: "hr.person@va.gov", AgencyContactPhone: "303-555-0100" } },
  } };
  afterEach(() => { delete process.env.USAJOBS_API_KEY; delete process.env.USAJOBS_USER_AGENT; });

  it("is refused, without any request, until its key and registered email are configured", async () => {
    process.env.USAJOBS_API_KEY = "k";
    mockUpstreams({});
    await expect(run("job-board-search", { query: "nurse", country_code: "us" })).rejects.toThrow(/Job search for United States \(federal jobs\) is not available yet/);
    expect(requests).toEqual([]);
  });
  it("sends the key and registered email, keeps values unaltered, links to USAJOBS, credits it, and drops contacts", async () => {
    process.env.USAJOBS_API_KEY = "k"; process.env.USAJOBS_USER_AGENT = "ops@strale.io";
    let headers: Headers | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({ url: String(input) });
      headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ SearchResult: { SearchResultCountAll: 57, SearchResultItems: [item] } }));
    });
    const r = await run("job-board-search", { query: "nurse", country_code: "us", location: "Denver, Colorado" });
    expect(headers?.get("Authorization-Key")).toBe("k");
    expect(headers?.get("User-Agent")).toBe("ops@strale.io");
    expect(new URL(requests[0].url).searchParams.get("LocationName")).toBe("Denver, Colorado");
    expect(r.output.jobs).toEqual([{
      title: "Nurse", company: "Veterans Health Administration", location: "Denver, Colorado", salary_range: "80000–120000 Per Year",
      url: "https://www.usajobs.gov:443/job/812345600", posted_date: "2026-09-09T00:00:00.0000", source: "usajobs.gov",
    }]);
    expect(r.output).toMatchObject({ total_results: 57, country_code: "us" });
    expect(String(r.output.attribution)).toMatch(/USAJOBS/);
    const text = JSON.stringify(r);
    for (const pii of ["hr.person@va.gov", "303-555"]) expect(text, `leaked ${pii}`).not.toContain(pii);
  });
  it("passes pay values through as published", () => {
    expect(usajobsSalary({ MinimumRange: "15.5", MaximumRange: "20.25", Description: "Per Hour" })).toBe("15.5–20.25 Per Hour");
    expect(usajobsSalary({ MinimumRange: "90000", RateIntervalCode: "PA" })).toBe("90000 PA");
    expect(usajobsSalary(undefined)).toBeNull();
  });
});
