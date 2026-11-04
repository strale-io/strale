// Browser tests for /topup's wiring (src/scripts/topup.ts), against a built dist/ served locally.
// Every request leaving the page is intercepted: the Strale API is mocked with page.route and
// anything else is aborted, so nothing reaches production. Timers are driven with page.clock.
//
//   npm run build:preview-data            (or any build into dist/)
//   npm run test:browser                  (needs Chromium: npx playwright install chromium)
//   PLAYWRIGHT_PATH=/path/to/playwright npm run test:browser   to use another Playwright install
//
// Not part of `npm test`: that runs before any build and without a browser.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(web, "dist");
const require = createRequire(import.meta.url);
const { chromium } = process.env.PLAYWRIGHT_PATH ? require(resolve(process.env.PLAYWRIGHT_PATH)) : require("playwright");
const API = "https://api.strale.io"; // the build's API_BASE (STRALE_API_BASE unset)
const KEY_STORE = "strale_topup_api_key";

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2", ".ico": "image/x-icon" };
let server;
let base;
let browser;

before(async () => {
  if (!existsSync(join(dist, "topup.html"))) throw new Error("dist/topup.html is missing: build the site first (npm run build:preview-data)");
  // Serves dist/ the way Cloudflare Pages does for build.format "file": /topup → topup.html.
  server = createServer((req, res) => {
    const clean = decodeURIComponent((req.url ?? "/").split("?")[0]);
    const file = [clean.slice(1), `${clean.slice(1)}.html`].map((c) => join(dist, c)).find((p) => p.startsWith(dist) && existsSync(p) && statSync(p).isFile());
    if (!file) return res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  server?.close();
});

const json = (body, status = 200) => ({ status, contentType: "application/json", body: JSON.stringify(body) });
const deferred = () => {
  let release;
  const promise = new Promise((r) => (release = r));
  return { promise, release };
};
const waitFor = async (fn, ms = 5000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("timed out waiting");
};

/**
 * A page whose API answers come from `handler({ method, path, key })`, which returns a route.fulfill
 * argument, or a promise of one. Requests are recorded; anything not local and not the API is aborted.
 */
async function openPage(handler, { storedKey, query = "", clock = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const calls = [];
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.origin === API) {
      const key = (route.request().headers().authorization ?? "").replace(/^Bearer /, "");
      calls.push({ method: route.request().method(), path: url.pathname, key, body: route.request().postData() });
      const answer = await handler({ method: route.request().method(), path: url.pathname, key });
      return route.fulfill(answer).catch(() => {});
    }
    if (url.hostname === "checkout.stripe.com") return route.fulfill({ status: 200, contentType: "text/html", body: "<title>checkout stub</title>" });
    return route.abort();
  });
  if (storedKey) await context.addInitScript(([k, v]) => { try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem(k, v); sessionStorage.setItem("seeded", "1"); } } catch {} }, [KEY_STORE, storedKey]);
  if (clock) await page.clock.install();
  await page.goto(`${base}/topup${query}`);
  return { context, page, calls, errors };
}
const balanceText = (page) => page.textContent("[data-balance-amount]");
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && !el.closest("[hidden]"));

test("a slow answer for the old key never overwrites the new key's balance (per-kind counter and active-key guard)", async () => {
  const slowA = deferred();
  const { context, page, calls, errors } = await openPage(async ({ path, key }) => {
    if (path === "/v1/wallet/balance" && key === "sk_live_a") { await slowA.promise; return json({ balance_cents: 111, currency: "EUR" }); }
    if (path === "/v1/wallet/balance") return json({ balance_cents: 999, currency: "EUR" });
    return json({ transactions: [] });
  }, { storedKey: "sk_live_a" });
  try {
    await waitFor(() => calls.some((c) => c.key === "sk_live_a"));
    await page.click("[data-clear-key]");
    await page.fill("#topup-key", "sk_live_b");
    await page.click("[data-key-form] button");
    await page.waitForSelector("[data-balance-value]:not([hidden])");
    assert.equal(await balanceText(page), "€9.99");
    slowA.release();
    await waitFor(() => calls.filter((c) => c.path === "/v1/wallet/transactions" && c.key === "sk_live_b").length > 0);
    await page.waitForTimeout(300);
    assert.equal(await balanceText(page), "€9.99", "A's late answer was discarded");
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), KEY_STORE), "sk_live_b");
    assert.equal(calls.filter((c) => c.path === "/v1/wallet/transactions" && c.key === "sk_live_a").length, 0, "no activity is loaded for the abandoned key");
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});

test("an older balance request for the same key cannot overwrite a newer one", async () => {
  const first = deferred();
  let n = 0;
  const { context, page, calls } = await openPage(async ({ path }) => {
    if (path === "/v1/wallet/balance") {
      n += 1;
      if (n === 1) { await first.promise; return json({ balance_cents: 100, currency: "EUR" }); }
      return json({ balance_cents: 500, currency: "EUR" });
    }
    return json({ transactions: [] });
  }, { storedKey: "sk_live_k", query: "?status=success", clock: true });
  try {
    await waitFor(() => n === 1);
    await page.clock.runFor(2000); // the first poll tick sends a second balance request
    await waitFor(() => n === 2);
    await page.waitForSelector("[data-balance-value]:not([hidden])");
    assert.equal(await balanceText(page), "€5.00");
    first.release();
    await waitFor(() => calls.some((c) => c.path === "/v1/wallet/transactions"));
    await page.waitForTimeout(300);
    assert.equal(await balanceText(page), "€5.00", "the first, slower answer was discarded");
  } finally {
    await context.close();
  }
});

test("a 401 drops the restored key when it is the current answer", async () => {
  const { context, page } = await openPage(async ({ path }) => {
    if (path === "/v1/wallet/balance") return json({ error_code: "unauthorized", message: "Invalid API key." }, 401);
    return json({ transactions: [] });
  }, { storedKey: "sk_live_revoked" });
  try {
    await page.waitForSelector("[data-key-error]:not([hidden])");
    assert.equal(await page.textContent("[data-key-error] span"), "Your saved API key is no longer valid. Paste a current one to continue.");
    assert.equal(await visible(page, "[data-key-entry]"), true);
    assert.equal(await visible(page, "[data-amount-card]"), false);
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), KEY_STORE), null);
  } finally {
    await context.close();
  }
});

test("a stale 401 for an abandoned key does not drop the key now in use", async () => {
  const slowA = deferred();
  const { context, page, calls } = await openPage(async ({ path, key }) => {
    if (path === "/v1/wallet/balance" && key === "sk_live_a") { await slowA.promise; return json({ error_code: "unauthorized", message: "Invalid API key." }, 401); }
    if (path === "/v1/wallet/balance") return json({ balance_cents: 999, currency: "EUR" });
    return json({ transactions: [] });
  }, { storedKey: "sk_live_a" });
  try {
    await waitFor(() => calls.some((c) => c.key === "sk_live_a"));
    await page.click("[data-clear-key]");
    await page.fill("#topup-key", "sk_live_b");
    await page.click("[data-key-form] button");
    await page.waitForSelector("[data-balance-value]:not([hidden])");
    slowA.release();
    await page.waitForTimeout(400);
    assert.equal(await visible(page, "[data-key-active]"), true, "B stays active");
    assert.equal(await visible(page, "[data-key-error]"), false);
    assert.equal(await balanceText(page), "€9.99");
    assert.equal(await page.evaluate((k) => sessionStorage.getItem(k), KEY_STORE), "sk_live_b");
  } finally {
    await context.close();
  }
});

test("checkout goes to the API's https checkout_url, and nowhere else", async () => {
  let checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_fixture";
  const { context, page, calls } = await openPage(async ({ path }) => {
    if (path === "/v1/wallet/balance") return json({ balance_cents: 1234, currency: "EUR" });
    if (path === "/v1/wallet/transactions") return json({ transactions: [] });
    if (path === "/v1/wallet/topup") return json({ checkout_url: checkoutUrl, session_id: "cs_test_fixture", amount_cents: 2500 });
    return json({}, 404);
  }, { storedKey: "sk_live_k" });
  try {
    await page.waitForSelector("[data-amount-card]:not([hidden])");
    // A non-https URL is refused: no navigation, an error instead.
    checkoutUrl = "http://evil.example/pay";
    await page.click("[data-continue]");
    await page.waitForSelector("[data-submit-error]:not([hidden])");
    assert.match(await page.textContent("[data-submit-error] span"), /not a secure address/);
    assert.equal(new URL(page.url()).pathname, "/topup");
    checkoutUrl = "javascript:alert(1)";
    await page.click("[data-continue]");
    await page.waitForTimeout(300);
    assert.equal(new URL(page.url()).pathname, "/topup");
    // The real shape: follow it.
    checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_fixture";
    await Promise.all([page.waitForURL("https://checkout.stripe.com/**"), page.click("[data-continue]")]);
    assert.equal(page.url(), "https://checkout.stripe.com/c/pay/cs_test_fixture");
    const posts = calls.filter((c) => c.path === "/v1/wallet/topup");
    assert.equal(posts.length, 3);
    for (const p of posts) {
      assert.equal(p.method, "POST");
      assert.equal(p.key, "sk_live_k");
      assert.deepEqual(JSON.parse(p.body), { amount_cents: 2500 });
    }
  } finally {
    await context.close();
  }
});

test("after Stripe returns, polling stops after five attempts", async () => {
  const { context, page, calls } = await openPage(async ({ path }) => {
    if (path === "/v1/wallet/balance") return json({ balance_cents: 1234, currency: "EUR" });
    return json({ transactions: [] });
  }, { storedKey: "sk_live_k", query: "?status=success&session_id=cs_test_1", clock: true });
  try {
    const count = (p) => calls.filter((c) => c.path === p).length;
    await waitFor(() => count("/v1/wallet/transactions") === 1); // the load: one balance, then activity
    assert.equal(count("/v1/wallet/balance"), 1);
    assert.equal(await page.textContent("[data-banner-title]"), "Checkout finished");
    assert.equal(new URL(page.url()).search, "", "status and session_id are stripped from the address");
    for (let tick = 1; tick <= 8; tick++) {
      await page.clock.runFor(2000);
      if (tick <= 5) await waitFor(() => count("/v1/wallet/transactions") === 1 + tick);
      else await page.waitForTimeout(200);
    }
    assert.equal(count("/v1/wallet/balance"), 6, "one on load plus five polls");
    assert.equal(count("/v1/wallet/transactions"), 6);
  } finally {
    await context.close();
  }
});
