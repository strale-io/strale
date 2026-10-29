import { test } from "node:test";
import assert from "node:assert/strict";
import { main, EXIT, HELP } from "../dist/main.js";
import { CLIENT_ID } from "../dist/package-version.js";

// Offline: every test drives main() with a mocked fetch. No network.

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function harness({ env = {}, responses = [] } = {}) {
  const calls = [];
  const out = [];
  const err = [];
  const queue = [...responses];
  let clock = 0;
  const deps = {
    env,
    io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      const next = queue.shift();
      if (!next) throw new Error(`unexpected request to ${url}`);
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next(url, init) : next;
    },
    sleep: async (ms) => {
      clock += ms;
    },
    now: () => clock,
  };
  return {
    deps,
    calls,
    run: (argv) => main(argv, deps),
    stdoutJson: () => {
      assert.equal(out.length, 1, "exactly one stdout write");
      assert.ok(out[0].endsWith("\n"));
      return JSON.parse(out[0]);
    },
    stderrJson: () => {
      assert.equal(err.length, 1, "exactly one stderr write");
      return JSON.parse(err[0]).error;
    },
    out,
    err,
  };
}

test("run refuses without --max-price-cents and sends nothing", async () => {
  const h = harness({ env: { STRALE_API_KEY: "sk_live_x" } });
  const code = await h.run(["run", "iban-validate", "--input", '{"iban":"DE89370400440532013000"}']);
  assert.equal(code, EXIT.USAGE);
  assert.equal(h.calls.length, 0);
  assert.equal(h.out.length, 0);
  const e = h.stderrJson();
  assert.equal(e.error_code, "invalid_request");
  assert.equal(e.source, "cli");
  assert.match(e.fix, /--max-price-cents/);
});

test("run rejects bad caps, bad JSON and non-object input locally", async () => {
  for (const argv of [
    ["run", "iban-validate", "--max-price-cents", "-1"],
    ["run", "iban-validate", "--max-price-cents", "2001"],
    ["run", "iban-validate", "--max-price-cents", "1.5"],
    ["run", "iban-validate", "--max-price-cents", "abc"],
    ["run", "iban-validate", "--max-price-cents", "5", "--input", "{nope"],
    ["run", "iban-validate", "--max-price-cents", "5", "--input", "[1,2]"],
    ["run", "iban-validate", "--max-price-cents", "5", "--input", "null"],
    ["run", "Not A Slug", "--max-price-cents", "5"],
    ["run", "--max-price-cents", "5"],
    ["run", "a", "b", "--max-price-cents", "5"],
    ["run", "iban-validate", "--max-price-cents", "5", "--max-price-cents", "6"],
    ["run", "iban-validate", "--max-price-cents", "5", "--bogus", "1"],
    ["run", "iban-validate", "--max-price-cents"],
    ["frobnicate"],
  ]) {
    const h = harness();
    assert.equal(await h.run(argv), EXIT.USAGE, argv.join(" "));
    assert.equal(h.calls.length, 0, argv.join(" "));
    assert.equal(h.stderrJson().error_code, "invalid_request", argv.join(" "));
  }
});

test("run posts to /v1/do with src=cli, client header, key and cap", async () => {
  const body = { result: { transaction_id: "t1", status: "completed", output: { valid: true } }, meta: {} };
  const h = harness({ env: { STRALE_API_KEY: "sk_live_abc" }, responses: [jsonResponse(200, body)] });
  const code = await h.run([
    "run", "iban-validate",
    "--input", '{"iban":"DE89370400440532013000"}',
    "--max-price-cents=5",
    "--timeout", "10",
    "--idempotency-key", "k-1",
  ]);
  assert.equal(code, EXIT.OK);
  assert.deepEqual(h.stdoutJson(), body);
  assert.equal(h.err.length, 0);
  const [call] = h.calls;
  assert.equal(call.url, "https://api.strale.io/v1/do?src=cli");
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["X-Strale-Client"], CLIENT_ID);
  assert.match(CLIENT_ID, /^strale-cli\/\d+\.\d+\.\d+$/);
  assert.equal(call.init.headers.Authorization, "Bearer sk_live_abc");
  assert.equal(call.init.headers["Idempotency-Key"], "k-1");
  assert.deepEqual(JSON.parse(call.init.body), {
    capability_slug: "iban-validate",
    inputs: { iban: "DE89370400440532013000" },
    max_price_cents: 5,
    timeout_seconds: 10,
  });
});

test("run without a key sends no Authorization header (free tier)", async () => {
  const h = harness({ responses: [jsonResponse(200, { result: { status: "completed" }, free_tier: true })] });
  assert.equal(await h.run(["run", "iban-validate", "--max-price-cents", "0", "--input", "{}"]), EXIT.OK);
  assert.equal(h.calls[0].init.headers.Authorization, undefined);
  assert.equal(JSON.parse(h.calls[0].init.body).max_price_cents, 0);
});

test("API errors surface error_code, fix and retryable on stderr with mapped exit codes", async () => {
  const cases = [
    [400, "invalid_request", EXIT.API_ERROR],
    [401, "unauthorized", EXIT.AUTH],
    [403, "primary_key_required", EXIT.AUTH],
    [402, "insufficient_balance", EXIT.PAYMENT],
    [402, "budget_exceeded", EXIT.PAYMENT],
    [429, "spend_cap_exceeded", EXIT.PAYMENT],
    [429, "rate_limited", EXIT.RATE_LIMITED],
    [503, "capability_unavailable", EXIT.API_ERROR],
  ];
  for (const [status, code, exit] of cases) {
    const apiBody = {
      error_code: code,
      message: `msg ${code}`,
      details: { fix: `fix ${code}`, retryable: false, next_step: "do x", actual_price_cents: 7 },
    };
    const h = harness({ env: { STRALE_API_KEY: "sk_live_x" }, responses: [jsonResponse(status, apiBody)] });
    assert.equal(await h.run(["run", "x-y", "--max-price-cents", "5"]), exit, code);
    assert.equal(h.out.length, 0);
    const e = h.stderrJson();
    assert.deepEqual(e, {
      error_code: code,
      message: `msg ${code}`,
      source: "api",
      http_status: status,
      fix: `fix ${code}`,
      retryable: false,
      next_step: "do x",
      details: { actual_price_cents: 7 },
    });
  }
});

test("keyless paid call turns the x402 challenge into payment_required", async () => {
  const challenge = {
    x402Version: 1,
    accepts: [{ scheme: "exact", network: "base", maxAmountRequired: "21600" }],
    error: "Payment required. IBAN to Bank costs $0.0216 USDC per call.",
    details: { fix: "Sign an x402 payment." },
  };
  const h = harness({ responses: [jsonResponse(402, challenge)] });
  assert.equal(await h.run(["run", "iban-to-bank", "--max-price-cents", "0"]), EXIT.PAYMENT);
  const e = h.stderrJson();
  assert.equal(e.error_code, "payment_required");
  assert.equal(e.message, challenge.error);
  assert.match(e.fix, /STRALE_API_KEY/);
  assert.deepEqual(e.details.accepts, challenge.accepts);
});

test("non-JSON error and success bodies still produce JSON", async () => {
  const h1 = harness({ responses: [new Response("<html>bad gateway</html>", { status: 502 })] });
  assert.equal(await h1.run(["tools"]), EXIT.API_ERROR);
  const e1 = h1.stderrJson();
  assert.equal(e1.error_code, "execution_failed");
  assert.equal(e1.http_status, 502);

  const h2 = harness({ responses: [new Response("not json", { status: 200 })] });
  assert.equal(await h2.run(["tools"]), EXIT.API_ERROR);
  assert.equal(h2.stderrJson().error_code, "execution_failed");
});

test("network failure and timeout exit 6 with retryable errors", async () => {
  const h1 = harness({ responses: [new TypeError("fetch failed")] });
  assert.equal(await h1.run(["search", "iban"]), EXIT.NETWORK);
  assert.deepEqual(
    [h1.stderrJson().error_code, h1.stderrJson().retryable],
    ["network_error", true],
  );
  const timeout = new Error("timed out");
  timeout.name = "TimeoutError";
  const h2 = harness({ responses: [timeout] });
  assert.equal(await h2.run(["search", "iban"]), EXIT.NETWORK);
  assert.equal(h2.stderrJson().error_code, "timeout_exceeded");
});

test("async run polls the transaction until completed", async () => {
  const done = { id: "t9", status: "completed", output: { ok: 1 } };
  const h = harness({
    env: { STRALE_API_KEY: "sk_live_x" },
    responses: [
      jsonResponse(202, { result: { transaction_id: "t9", status: "executing" } }),
      jsonResponse(200, { id: "t9", status: "executing" }),
      jsonResponse(200, done),
    ],
  });
  assert.equal(await h.run(["run", "slow-thing", "--max-price-cents", "50"]), EXIT.OK);
  assert.deepEqual(h.stdoutJson(), done);
  assert.equal(h.calls[1].url, "https://api.strale.io/v1/transactions/t9?src=cli");
  assert.equal(h.calls.length, 3);
});

test("async run reports a failed transaction as execution_failed", async () => {
  const h = harness({
    env: { STRALE_API_KEY: "sk_live_x" },
    responses: [
      jsonResponse(202, { result: { transaction_id: "t9", status: "executing" } }),
      jsonResponse(200, { id: "t9", status: "failed", error: "Upstream down", details: { fix: "Retry later.", retryable: true } }),
    ],
  });
  assert.equal(await h.run(["run", "slow-thing", "--max-price-cents", "50"]), EXIT.API_ERROR);
  const e = h.stderrJson();
  assert.equal(e.error_code, "execution_failed");
  assert.equal(e.message, "Upstream down");
  assert.equal(e.fix, "Retry later.");
  assert.equal(e.details.transaction_id, "t9");
});

test("async run gives up after --wait and names the transaction", async () => {
  const pending = () => jsonResponse(200, { id: "t9", status: "executing" });
  const h = harness({
    env: { STRALE_API_KEY: "sk_live_x" },
    responses: [jsonResponse(202, { result: { transaction_id: "t9", status: "executing" } }), pending, pending, pending],
  });
  assert.equal(await h.run(["run", "slow-thing", "--max-price-cents", "50", "--wait", "4"]), EXIT.API_ERROR);
  const e = h.stderrJson();
  assert.equal(e.error_code, "timeout_exceeded");
  assert.equal(e.retryable, false);
  assert.equal(e.details.transaction_id, "t9");
});

test("search calls typeahead without a key, even when one is set", async () => {
  const results = { results: [{ slug: "iban-validate" }], total: 1 };
  const h = harness({ env: { STRALE_API_KEY: "sk_live_x" }, responses: [jsonResponse(200, results)] });
  assert.equal(await h.run(["search", "validate", "an", "iban", "--limit", "3"]), EXIT.OK);
  assert.deepEqual(h.stdoutJson(), results);
  assert.equal(h.calls[0].url, "https://api.strale.io/v1/suggest/typeahead?q=validate%20an%20iban&limit=3&src=cli");
  assert.equal(h.calls[0].init.headers.Authorization, undefined);

  const h2 = harness();
  assert.equal(await h2.run(["search"]), EXIT.USAGE);
  assert.equal(await harness().run(["search", "x"]), EXIT.USAGE);
  assert.equal(await harness().run(["search", "iban", "--limit", "11"]), EXIT.USAGE);
});

test("tools returns a compact list, filters by category, and --full keeps schemas", async () => {
  const catalog = {
    capabilities: [
      { slug: "a", name: "A", category: "validation", price_cents: null, is_free_tier: true, description: "d", input_schema: {} },
      { slug: "b", name: "B", category: "finance", price_cents: 5, description: "e", input_schema: {} },
    ],
  };
  const h = harness({ responses: [jsonResponse(200, catalog)] });
  assert.equal(await h.run(["tools"]), EXIT.OK);
  assert.deepEqual(h.stdoutJson(), {
    count: 2,
    tools: [
      { slug: "a", name: "A", category: "validation", price_cents: null, is_free_tier: true, description: "d" },
      { slug: "b", name: "B", category: "finance", price_cents: 5, is_free_tier: false, description: "e" },
    ],
  });

  const h2 = harness({ responses: [jsonResponse(200, catalog)] });
  assert.equal(await h2.run(["tools", "--category", "finance", "--full"]), EXIT.OK);
  assert.deepEqual(h2.stdoutJson(), { count: 1, tools: [catalog.capabilities[1]] });
});

test("balance needs STRALE_API_KEY and sends it", async () => {
  const h = harness();
  assert.equal(await h.run(["balance"]), EXIT.AUTH);
  assert.equal(h.calls.length, 0);
  assert.equal(h.stderrJson().error_code, "unauthorized");

  const h2 = harness({ env: { STRALE_API_KEY: "  " } });
  assert.equal(await h2.run(["balance"]), EXIT.AUTH);

  const h3 = harness({ env: { STRALE_API_KEY: "sk_live_k" }, responses: [jsonResponse(200, { balance_cents: 150, currency: "EUR" })] });
  assert.equal(await h3.run(["balance"]), EXIT.OK);
  assert.deepEqual(h3.stdoutJson(), { balance_cents: 150, currency: "EUR" });
  assert.equal(h3.calls[0].url, "https://api.strale.io/v1/wallet/balance?src=cli");
  assert.equal(h3.calls[0].init.headers.Authorization, "Bearer sk_live_k");
});

test("the API key never appears in output", async () => {
  const key = "sk_live_supersecret";
  const h = harness({ env: { STRALE_API_KEY: key }, responses: [new TypeError("fetch failed")] });
  await h.run(["balance"]);
  assert.ok(!h.err.join("").includes(key));
  assert.ok(!h.out.join("").includes(key));
});

test("help and version are JSON on stdout, including per-command help", async () => {
  for (const argv of [[], ["help"], ["--help"], ["-h"]]) {
    const h = harness();
    assert.equal(await h.run(argv), EXIT.OK);
    assert.deepEqual(h.stdoutJson(), HELP);
  }
  const hv = harness();
  assert.equal(await hv.run(["--version"]), EXIT.OK);
  assert.equal(hv.stdoutJson().name, "strale-cli");

  const hr = harness();
  assert.equal(await hr.run(["run", "--help"]), EXIT.OK);
  assert.deepEqual(hr.stdoutJson(), HELP.commands.run);
  assert.equal(hr.calls.length, 0);
});

test("README documents every exit code the CLI defines", async () => {
  const { readFile } = await import("node:fs/promises");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  for (const [code, meaning] of Object.entries(HELP.exit_codes)) {
    assert.ok(readme.includes(`| ${code} | ${meaning} |`), `README row for exit ${code}`);
  }
  assert.deepEqual(Object.values(EXIT).map(String).sort(), Object.keys(HELP.exit_codes).sort());
});

test("a cap of 0 takes the keyless free-tier path even when a key is set", async () => {
  const h = harness({ env: { STRALE_API_KEY: "sk_live_k" }, responses: [jsonResponse(200, { result: { status: "completed" } })] });
  assert.equal(await h.run(["run", "iban-validate", "--max-price-cents", "0"]), EXIT.OK);
  assert.equal(h.calls[0].init.headers.Authorization, undefined);

  const h2 = harness({ env: { STRALE_API_KEY: "sk_live_k" }, responses: [jsonResponse(200, { result: { status: "completed" } })] });
  assert.equal(await h2.run(["run", "iban-validate", "--max-price-cents", "1"]), EXIT.OK);
  assert.equal(h2.calls[0].init.headers.Authorization, "Bearer sk_live_k");
});

test("top-level guidance in an API error is kept in details", async () => {
  const apiBody = {
    error_code: "unauthorized",
    message: "This capability requires an API key.",
    free_capabilities: ["iban-validate"],
    hint: "Try a free tool.",
    details: { fix: "Send a key." },
  };
  const h = harness({ responses: [jsonResponse(401, apiBody)] });
  assert.equal(await h.run(["run", "paid-thing", "--max-price-cents", "5"]), EXIT.AUTH);
  const e = h.stderrJson();
  assert.equal(e.fix, "Send a key.");
  assert.deepEqual(e.details, { free_capabilities: ["iban-validate"], hint: "Try a free tool." });
});

test("--help after -- is an argument, and a flag is not taken as a value", async () => {
  const h = harness({ responses: [jsonResponse(200, { results: [] })] });
  assert.equal(await h.run(["search", "--", "--help"]), EXIT.OK);
  assert.match(h.calls[0].url, /q=--help/);

  const h2 = harness();
  assert.equal(await h2.run(["run", "x", "--input", "--max-price-cents", "5"]), EXIT.USAGE);
  assert.match(h2.stderrJson().message, /'--input' needs a value/);
  assert.equal(h2.calls.length, 0);
});
