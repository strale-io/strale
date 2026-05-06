/**
 * HMRC VAT Checker — sandbox retest (HMRC support ref 2026-CNS433).
 *
 * Calls the sandbox `Check a UK VAT Number` v2 endpoint with the headers and
 * scope HMRC support specified, captures full request/response, and writes a
 * markdown report at the repo root that can be attached to the next reply.
 *
 * Reads HMRC_SANDBOX_CLIENT_ID and HMRC_SANDBOX_CLIENT_SECRET from .env.
 * Hits sandbox only — no production calls, no production credentials read.
 *
 * Usage:  cd apps/api && npx tsx scripts/test-hmrc-sandbox.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const SANDBOX_BASE = "https://test-api.service.hmrc.gov.uk";
const TOKEN_URL = `${SANDBOX_BASE}/oauth/token`;
const SCOPE = "read:vat";
const ACCEPT = "application/vnd.hmrc.2.0+json";
// HMRC publishes a small set of canned VRNs that always succeed in sandbox.
// 553557817 is the most-cited example in HMRC's API docs and forum threads.
const TEST_VRN = process.env.HMRC_TEST_VRN ?? "553557817";

const REPORT_PATH = resolve(import.meta.dirname, "../../../hmrc-sandbox-retest-report.md");

const clientId = process.env.HMRC_SANDBOX_CLIENT_ID;
const clientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing HMRC_SANDBOX_CLIENT_ID and/or HMRC_SANDBOX_CLIENT_SECRET in .env",
  );
  process.exit(1);
}

function redact(s: string | null | undefined): string {
  if (!s) return "<empty>";
  if (s.length <= 8) return "<REDACTED>";
  return `${s.slice(0, 4)}…${s.slice(-2)} (len=${s.length}) <REDACTED>`;
}

function headersToObject(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => {
    if (k.toLowerCase() === "authorization") out[k] = "Bearer <REDACTED>";
    else if (k.toLowerCase().includes("token")) out[k] = "<REDACTED>";
    else out[k] = v;
  });
  return out;
}

async function main() {
  const startedAt = new Date().toISOString();
  console.log(`HMRC sandbox retest — started at ${startedAt}`);
  console.log(`client_id: ${redact(clientId)}`);
  console.log(`scope: ${SCOPE}`);
  console.log(`base: ${SANDBOX_BASE}`);
  console.log(`vrn: ${TEST_VRN}`);

  // ---------------- Step 1: token ----------------
  const tokenBody = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId!,
    client_secret: clientSecret!,
    scope: SCOPE,
  });

  const tokenStart = Date.now();
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody.toString(),
    signal: AbortSignal.timeout(15000),
  });
  const tokenMs = Date.now() - tokenStart;
  const tokenText = await tokenRes.text();

  let tokenJson: { access_token?: string; expires_in?: number; scope?: string; token_type?: string; error?: string; error_description?: string } | null = null;
  try {
    tokenJson = JSON.parse(tokenText);
  } catch {
    /* leave null */
  }

  console.log(`\n[token] HTTP ${tokenRes.status} in ${tokenMs}ms`);
  if (!tokenRes.ok || !tokenJson?.access_token) {
    console.error(`Token request failed. Body: ${tokenText.slice(0, 800)}`);
  }

  const grantedScope = tokenJson?.scope ?? "<not returned>";
  const accessToken = tokenJson?.access_token ?? "";

  // ---------------- Step 2: lookup ----------------
  const lookupUrl = `${SANDBOX_BASE}/organisations/vat/check-vat-number/lookup/${TEST_VRN}`;
  const lookupHeaders: Record<string, string> = {
    Accept: ACCEPT,
  };
  if (accessToken) lookupHeaders.Authorization = `Bearer ${accessToken}`;

  const lookupAt = new Date().toISOString();
  const lookupStart = Date.now();
  let lookupRes: Response | null = null;
  let lookupText = "";
  let lookupErr: string | null = null;
  try {
    lookupRes = await fetch(lookupUrl, {
      headers: lookupHeaders,
      signal: AbortSignal.timeout(15000),
    });
    lookupText = await lookupRes.text();
  } catch (e) {
    lookupErr = e instanceof Error ? e.message : String(e);
  }
  const lookupMs = Date.now() - lookupStart;

  let lookupJson: unknown = null;
  try {
    lookupJson = JSON.parse(lookupText);
  } catch {
    /* leave null */
  }

  if (lookupRes) {
    console.log(`[lookup] HTTP ${lookupRes.status} in ${lookupMs}ms`);
  } else {
    console.error(`[lookup] network error: ${lookupErr}`);
  }

  // ---------------- Step 3: report ----------------
  const finishedAt = new Date().toISOString();
  const success = Boolean(lookupRes?.ok && lookupJson);

  const tokenResHeaders = headersToObject(tokenRes.headers);
  const lookupResHeaders = lookupRes ? headersToObject(lookupRes.headers) : {};

  const report = `# HMRC VAT Checker Sandbox Retest — ${startedAt}

Support reference: 2026-CNS433
Application: Strale
Environment: HMRC Sandbox (${SANDBOX_BASE})
Test started: ${startedAt}
Test finished: ${finishedAt}

## Application credentials (sandbox)
- client_id (redacted): \`${redact(clientId)}\`
- client_secret: \`<REDACTED>\`
- Source: \`HMRC_SANDBOX_CLIENT_ID\` / \`HMRC_SANDBOX_CLIENT_SECRET\` env vars
- No production credentials referenced or read by this script.

---

## Step 1 — OAuth2 token request

**Request**
- Method: \`POST\`
- URL: \`${TOKEN_URL}\`
- Headers:
  - \`Content-Type: application/x-www-form-urlencoded\`
- Body (form-encoded):
  - \`grant_type=client_credentials\`
  - \`client_id=<REDACTED>\`
  - \`client_secret=<REDACTED>\`
  - \`scope=${SCOPE}\`

**Response**
- HTTP status: \`${tokenRes.status} ${tokenRes.statusText}\`
- Wall clock: \`${tokenMs}ms\`
- Headers:
\`\`\`json
${JSON.stringify(tokenResHeaders, null, 2)}
\`\`\`
- Body:
\`\`\`json
${tokenJson
  ? JSON.stringify(
      {
        ...tokenJson,
        access_token: tokenJson.access_token ? "<REDACTED>" : undefined,
      },
      null,
      2,
    )
  : tokenText.slice(0, 2000)}
\`\`\`
- Granted scope: \`${grantedScope}\`

---

## Step 2 — VAT lookup

**Request**
- Method: \`GET\`
- URL: \`${lookupUrl}\`
- Headers:
  - \`Accept: ${ACCEPT}\`
  - \`Authorization: Bearer <REDACTED>\`
- Time of call (UTC): \`${lookupAt}\`
- Test VRN: \`${TEST_VRN}\` (HMRC sandbox canned test value)

**Response**
${
  lookupRes
    ? `- HTTP status: \`${lookupRes.status} ${lookupRes.statusText}\`
- Wall clock: \`${lookupMs}ms\`
- Headers:
\`\`\`json
${JSON.stringify(lookupResHeaders, null, 2)}
\`\`\`
- Body:
\`\`\`json
${lookupJson ? JSON.stringify(lookupJson, null, 2) : lookupText.slice(0, 2000)}
\`\`\``
    : `- Network error: \`${lookupErr}\``
}

---

## Result

${
  success
    ? `**SUCCESS** — sandbox call returned HTTP ${lookupRes!.status} with a parseable JSON body in ${lookupMs}ms. Application "Strale" is correctly configured against the sandbox with Accept \`${ACCEPT}\` and scope \`${SCOPE}\`.`
    : `**FAILURE** — see status codes above. Token HTTP ${tokenRes.status}; lookup ${
        lookupRes ? `HTTP ${lookupRes.status}` : `network error: ${lookupErr}`
      }.`
}
`;

  await writeFile(REPORT_PATH, report, "utf-8");
  console.log(`\nReport written to ${REPORT_PATH}`);

  if (!success) process.exit(2);
}

main().catch((e) => {
  console.error("Unhandled error:", e);
  process.exit(1);
});
