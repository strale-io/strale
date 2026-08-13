/**
 * x402 autonomous buyer -- no API key, no signup. Discovers a Strale
 * capability, pays for it per-call with USDC on Base mainnet via the x402
 * HTTP-native payment protocol, and prints the result.
 *
 * Usage: npx tsx src/buy.ts [capability-slug] [query-string]
 *   npx tsx src/buy.ts isbn-validate "isbn=9780134685991"
 *
 * Requires X402_PRIVATE_KEY: a Base-mainnet EOA private key holding a small
 * amount of USDC (and a trace of ETH for gas is NOT required -- x402's
 * "exact" scheme uses a gasless EIP-3009 transferWithAuthorization; the
 * facilitator submits and pays gas). This script never sends a transaction
 * itself -- it only *signs* an authorization; @x402/evm's ExactEvmScheme
 * builds that signature and the Strale-side facilitator settles on-chain
 * after your GET succeeds.
 */
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";

const CAPABILITY_SLUG = process.argv[2] ?? "isbn-validate";
const QUERY_STRING = process.argv[3] ?? "isbn=9780134685991";

const privateKey = process.env.X402_PRIVATE_KEY;
if (!privateKey) {
  console.error(
    "Set X402_PRIVATE_KEY to a Base-mainnet EOA private key funded with a\n" +
      "small amount of USDC. Copy .env.example to .env and fill it in.\n" +
      "This is the ONLY credential this script needs -- no Strale account,\n" +
      "no API key.",
  );
  process.exit(1);
}

const account = privateKeyToAccount(privateKey as `0x${string}`);
console.log(`Buyer wallet: ${account.address}`);

// @x402/core's client, configured with an EVM "exact" scheme on Base
// mainnet (eip155:8453 -- CAIP-2 form, required for x402 v2).
const client = x402Client.fromConfig({
  schemes: [{ network: "eip155:8453", client: new ExactEvmScheme(account) }],
});
const httpClient = new x402HTTPClient(client);

const url = `https://api.strale.io/x402/v2/${CAPABILITY_SLUG}?${QUERY_STRING}`;
console.log(`GET ${url}`);

const firstResponse = await fetch(url);
if (firstResponse.status !== 402) {
  // Free capability, or already-paid via some other mechanism.
  console.log(`HTTP ${firstResponse.status}`);
  console.log(JSON.stringify(await firstResponse.json(), null, 2));
  process.exit(0);
}

// Strale's /x402/v2/* routes carry the v2 payment challenge in the JSON
// body only -- they deliberately don't also send a `Payment-Required`
// header, because emitting a header trips some v2-header-only decoders
// (see apps/api/src/routes/x402-gateway-v2.ts). @x402/fetch's automatic
// wrapFetchWithPayment(FromConfig) wrapper requires that header for v2 and
// will throw "Failed to parse payment requirements" against a body-only
// challenge -- so this script drives the lower-level @x402/core client
// methods directly instead of the fetch wrapper.
const paymentRequired = await firstResponse.json();
const accepted = paymentRequired.accepts?.[0];
console.log(
  `Price: ${accepted?.amount} atomic units of USDC on ${accepted?.network} ` +
    `(payTo ${accepted?.payTo})`,
);

const paymentPayload = await client.createPaymentPayload(paymentRequired);
const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);

const paidResponse = await fetch(url, { headers: paymentHeaders });
const body = await paidResponse.json();
console.log(`\nHTTP ${paidResponse.status}`);
console.log(JSON.stringify(body, null, 2));

const settlementHeader =
  paidResponse.headers.get("PAYMENT-RESPONSE") ?? paidResponse.headers.get("X-PAYMENT-RESPONSE");
if (settlementHeader) {
  console.log("\nSettlement:", JSON.stringify(httpClient.getPaymentSettleResponse((n) => paidResponse.headers.get(n))));
}
