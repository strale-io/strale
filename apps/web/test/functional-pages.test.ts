// The logic behind /signup, /topup and /audit, carried over from strale-frontend, checked here
// so the browser scripts stay thin. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ActiveKey,
  RequestGate,
  centsToEur,
  checkoutRedirect,
  currentGuard,
  friendlyError,
  isCredit,
  openingBalance,
  parseCustomEuros,
  registerBody,
  registerErrorMessage,
  validateAmount,
} from "../src/lib/wallet.ts";
import { auditOutcome, auditRequestUrl, entityPath, formatPeriod, parseAuditLocation, safeHttpUrl } from "../src/lib/audit-record.ts";
import { MAX_TOPUP_CENTS, MIN_TOPUP_CENTS, TRIAL_CREDITS_CENTS } from "../src/lib/code-facts.ts";
import { product } from "../src/lib/load-preview.ts";

const repo = resolve(import.meta.dirname, "../../..");

// ---------- latest request wins ----------

test("only the newest request of a kind may touch the page", () => {
  const gate = new RequestGate();
  const active = new ActiveKey();
  active.value = "sk_a";
  const first = currentGuard(gate, active, "sk_a");
  const second = currentGuard(gate, active, "sk_a");
  assert.equal(first.isCurrent(), false, "a superseded request is stale");
  assert.equal(second.isCurrent(), true);
  assert.equal(gate.isLatest(first.ticket), false, "a stale completion may not clear the loading flag");
  assert.equal(gate.isLatest(second.ticket), true);
});

test("an answer for a key that is no longer active is discarded", () => {
  const gate = new RequestGate();
  const active = new ActiveKey();
  active.value = "sk_a";
  const forA = currentGuard(gate, active, "sk_a");
  active.value = "sk_b"; // the visitor switched keys while A's request was in flight
  assert.equal(forA.isCurrent(), false);
  assert.equal(gate.isLatest(forA.ticket), true, "still the newest of its kind, so it may clear loading, but not write data");
});

test("each kind of request has its own counter", () => {
  const balance = new RequestGate();
  const transactions = new RequestGate();
  const active = new ActiveKey();
  active.value = "k";
  const b = currentGuard(balance, active, "k");
  currentGuard(transactions, active, "k");
  assert.equal(b.isCurrent(), true);
});

// ---------- amounts ----------

test("custom amounts are validated as typed, before rounding", () => {
  assert.equal(parseCustomEuros("25"), 2500);
  assert.equal(parseCustomEuros("25.5"), 2550);
  assert.equal(parseCustomEuros("25,50"), 2550);
  assert.equal(parseCustomEuros(" 10.00 "), 1000);
  assert.equal(parseCustomEuros("10.009"), null, "three decimals is an error, not €10.01");
  assert.equal(parseCustomEuros("-5"), null);
  assert.equal(parseCustomEuros("1e3"), null);
  assert.equal(parseCustomEuros(""), null);
});

test("amount errors match the old page and the API's bounds", () => {
  const opts = { min: MIN_TOPUP_CENTS, max: MAX_TOPUP_CENTS };
  assert.equal(validateAmount(2500, { ...opts, custom: false, raw: "" }), "");
  assert.equal(validateAmount(null, { ...opts, custom: true, raw: "10.009" }), "Enter an amount like 25 or 25.50 (max 2 decimal places).");
  assert.equal(validateAmount(null, { ...opts, custom: true, raw: "" }), "Enter an amount.");
  assert.equal(validateAmount(MIN_TOPUP_CENTS - 1, { ...opts, custom: true, raw: "9.99" }), `Minimum top-up is ${centsToEur(MIN_TOPUP_CENTS)}.`);
  assert.equal(validateAmount(MAX_TOPUP_CENTS + 1, { ...opts, custom: true, raw: "10000.01" }), `Maximum top-up is ${centsToEur(MAX_TOPUP_CENTS)}.`);
  assert.equal(validateAmount(MAX_TOPUP_CENTS, { ...opts, custom: true, raw: "10000" }), "");
});

test("top-up bounds and the trial credit are read from the API source", () => {
  const wallet = readFileSync(resolve(repo, "apps/api/src/routes/wallet.ts"), "utf8");
  assert.match(wallet, new RegExp(`MAX_TOPUP_CENTS = ${MAX_TOPUP_CENTS.toLocaleString("en-US").replace(/,/g, "_")}\\b`));
  const trial = readFileSync(resolve(repo, "apps/api/src/lib/trial-eligibility.ts"), "utf8");
  assert.match(trial, new RegExp(`TRIAL_CREDITS_CENTS = ${TRIAL_CREDITS_CENTS};`));
  assert.ok(MIN_TOPUP_CENTS < MAX_TOPUP_CENTS);
});

test("errors prefer the API's message, then its code", () => {
  assert.equal(friendlyError({ message: "No such key" }, "x"), "No such key");
  assert.equal(friendlyError({ error_code: "unauthorized" }, "x"), "Error: unauthorized");
  assert.equal(friendlyError(null, "fallback"), "fallback");
  assert.equal(centsToEur(-250), "€2.50");
  assert.equal(isCredit("refund"), true);
  assert.equal(isCredit("purchase"), false);
});

// ---------- signup ----------

test("registration sends the name only when given, and maps errors by status", () => {
  assert.deepEqual(registerBody("a@b.co", ""), { email: "a@b.co" });
  assert.deepEqual(registerBody("a@b.co", "Jane"), { email: "a@b.co", name: "Jane" });
  assert.equal(registerErrorMessage(409, "s@x"), "An account with this email already exists.");
  assert.equal(registerErrorMessage(400, "s@x"), "Please enter a valid email address.");
  assert.equal(registerErrorMessage(429, "s@x"), "Too many attempts. Please wait a moment.");
  assert.match(registerErrorMessage(500, "s@x"), /contact support at s@x\.$/);
});

test("the balance after signup is the one the API states, never an assumed trial credit", () => {
  assert.equal(openingBalance({ wallet_balance_cents: 200 }), "€2.00");
  assert.equal(openingBalance({ wallet_balance_cents: 0, trial_credits: { granted: false } }), "€0.00");
  assert.equal(openingBalance({ balance: "2.00" }), "€2.00");
  assert.equal(openingBalance({}), null);
});

// ---------- audit ----------

test("the record id comes from the path, or from ?id= without a rewrite", () => {
  assert.deepEqual(parseAuditLocation("/audit/txn_123", "?token=abc&expires_at=1800000000"), { id: "txn_123", token: "abc", expiresAt: "1800000000" });
  assert.deepEqual(parseAuditLocation("/audit/9f1c-uuid/", "?token=t"), { id: "9f1c-uuid", token: "t", expiresAt: null });
  assert.equal(parseAuditLocation("/audit/a%20b", "?token=t").id, "a b");
  assert.equal(parseAuditLocation("/audit", "?id=txn_9&token=t").id, "txn_9");
  assert.equal(parseAuditLocation("/audit.html", "?id=txn_9&token=t").id, "txn_9");
  assert.equal(parseAuditLocation("/audit", "?token=t").id, null);
  assert.equal(parseAuditLocation("/audit/x", "").token, null);
  assert.equal(parseAuditLocation("/audit/a/b", "?token=t").id, null, "a nested path is not an id");
  assert.equal(parseAuditLocation("/audit/%E0%A4%A", "?token=t").id, null, "a malformed escape is not an id");
});

test("the audit request carries the token and, when the link has one, its expiry", () => {
  assert.equal(auditRequestUrl("https://api.example", { id: "t 1", token: "a+b", expiresAt: "1800000000" }), "https://api.example/v1/audit/t%201?token=a%2Bb&expires_at=1800000000");
  assert.equal(auditRequestUrl("https://api.example", { id: "t1", token: "abc", expiresAt: null }), "https://api.example/v1/audit/t1?token=abc");
});

test("the audit answer decides which state the page shows", () => {
  const audit = { type: "capability", steps: [{ step: 1 }] };
  assert.equal(auditOutcome(200, { audit }).kind, "record");
  assert.equal(auditOutcome(202, { status: "pending" }).kind, "pending");
  assert.deepEqual(auditOutcome(410, { message: "This audit URL was issued under a pre-F-A-006 format" }), { kind: "expired" }, "the API's message is not carried to the page");
  for (const status of [400, 401, 403, 429, 500, 503]) assert.equal(auditOutcome(status, { message: "x" }).kind, "unavailable", `${status} is "could not be loaded", not "not found"`);
  assert.equal(auditOutcome(404, null).kind, "not_found");
  assert.equal(auditOutcome(200, { audit: { steps: [] } }).kind, "not_found", "a record with no steps cannot be drawn");
  assert.equal(entityPath({ type: "capability", entity_slug: "vat-validate" }), "/tools/vat-validate");
  assert.equal(entityPath({ type: "solution", entity_slug: "kyb-essentials-se" }), "/solutions/kyb-essentials-se");
});

test("a data-source link is drawn only for http(s) addresses", () => {
  assert.equal(safeHttpUrl("https://bolagsverket.se/x"), "https://bolagsverket.se/x");
  assert.equal(safeHttpUrl("http://example.org"), "http://example.org/");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,<b>x</b>"), null);
  assert.equal(safeHttpUrl("/relative"), null);
  assert.equal(safeHttpUrl(undefined), null);
});

test("checkout redirects only to the API's https checkout_url", () => {
  assert.deepEqual(checkoutRedirect({ checkout_url: "https://checkout.stripe.com/c/pay/cs_test_1" }), { url: "https://checkout.stripe.com/c/pay/cs_test_1" });
  for (const bad of ["http://checkout.stripe.com/x", "javascript:alert(1)", "//evil.example", "not a url"]) assert.ok("error" in checkoutRedirect({ checkout_url: bad }), bad);
  assert.deepEqual(checkoutRedirect({}), { error: "Checkout session was created but no payment URL was returned." });
  assert.ok("error" in checkoutRedirect(null));
});

test("retention periods read as years when they are whole years", () => {
  assert.equal(formatPeriod(1095), "3 years");
  assert.equal(formatPeriod(365), "1 year");
  assert.equal(formatPeriod(90), "90 days");
  assert.equal(formatPeriod(product("7 * 365")), "7 years");
  assert.ok(Number.isNaN(product("7 * x")));
  const facts = readFileSync(resolve(repo, "apps/api/src/lib/platform-facts.ts"), "utf8");
  assert.ok(Number.isFinite(product(facts.match(/retention_days_max_configurable:\s*([\d\s*]+),/)?.[1])), "the preview loader can read the configurable maximum");
});

// The page's AuditRecord must match the API's (apps/api/src/routes/audit.ts), field for field,
// the same comparison apps/api/scripts/check-shape-contracts.mjs makes for strale-frontend.
function fields(source: string, name: string): Map<string, string> {
  const start = source.search(new RegExp(`(?:export\\s+)?interface\\s+${name}\\s*\\{`));
  assert.ok(start >= 0, `interface ${name} not found`);
  let i = source.indexOf("{", start) + 1;
  let depth = 1;
  const bodyStart = i;
  while (depth > 0 && i < source.length) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") depth--;
    i++;
  }
  const body = source.slice(bodyStart, i - 1).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  // Statements end at a semicolon outside braces (as in check-shape-contracts.mjs parseFields).
  const out = new Map<string, string>();
  let d = 0;
  let buf = "";
  const statements: string[] = [];
  for (const ch of body) {
    if (ch === "{") d++;
    else if (ch === "}") d--;
    if (ch === ";" && d === 0) {
      statements.push(buf.trim());
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) statements.push(buf.trim());
  for (const st of statements) {
    const m = st.match(/^([A-Za-z_]\w*)(\?)?:\s*([\s\S]+)$/);
    if (m) out.set(m[1], `${m[3].replace(/\s+/g, "")}${m[2] ? "|undefined" : ""}`);
  }
  return out;
}

test("the page's AuditRecord and AuditStep match the API's field for field", () => {
  const api = readFileSync(resolve(repo, "apps/api/src/routes/audit.ts"), "utf8");
  const web = readFileSync(resolve(repo, "apps/web/src/lib/audit-record.ts"), "utf8");
  for (const name of ["AuditRecord", "AuditStep"]) {
    const a = fields(api, name);
    const w = fields(web, name);
    assert.ok(a.size > 5, `${name}: parsed the API's fields`);
    assert.deepEqual([...w.keys()].sort(), [...a.keys()].sort(), `${name}: field names`);
    for (const [k, t] of a) assert.equal(w.get(k), t, `${name}.${k}: type`);
  }
});
