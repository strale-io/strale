const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const nock = require("nock");
const zapier = require("zapier-platform-core");
const App = require("..");
const { jobs } = require("../lib/jobs");
const { version } = require("../package.json");
const fixtures = require("./fixtures/responses.json");
const schemas = require("./fixtures/schemas.json");
const appTester = zapier.createAppTester(App);
function structuralSchema(value) {
  if (Array.isArray(value)) return value.map(structuralSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([k]) => !["description", "example", "examples"].includes(k))
        .map(([k, v]) => [k, structuralSchema(v)])
    );
  return value;
}
const authData = { api_key: "test-key-placeholder" };
const bundle = (inputData) => ({ authData, inputData });
function scope() {
  return nock("https://api.strale.io", {
    reqheaders: {
      authorization: "Bearer test-key-placeholder",
      "x-strale-client": `zapier-strale/${version}`,
    },
  });
}
function mock(slug, inputs, response = fixtures[slug], status = 200) {
  return scope()
    .post("/v1/do", {
      capability_slug: slug,
      inputs,
      max_price_cents: 100,
      timeout_seconds: 20,
    })
    .query({ src: "zapier" })
    .reply(status, response);
}
function run(key, inputs) {
  return appTester(App.creates[key].operation.perform, bundle(inputs));
}
before(() => nock.disableNetConnect());
after(() => nock.enableNetConnect());
afterEach(() => {
  const pending = nock.pendingMocks();
  nock.cleanAll();
  assert.deepEqual(pending, []);
});
describe("Zapier native app", () => {
  it("passes the official platform schema validation", () => {
    assert.deepEqual(
      require("zapier-platform-core/src/tools/schema").validateApp(App),
      []
    );
  });
  it("has exactly five visible fixed jobs with general business tools first", () => {
    assert.deepEqual(Object.keys(App.creates), Object.keys(jobs));
    assert.deepEqual(Object.keys(jobs), [
      "lookup_company",
      "check_eu_vat",
      "check_iban",
      "check_email",
      "screen_name",
    ]);
    assert.deepEqual(
      Object.keys(App.creates).filter((k) => App.creates[k].display.hidden),
      []
    );
    // Every tool an action can call is fixed and has a schema snapshot.
    for (const job of Object.values(jobs))
      for (const tool of job.tools) assert.ok(schemas[tool], tool);
  });
  it("keeps listing and action text within the claims register", () => {
    const claims = YAML.parse(
      fs.readFileSync(
        path.join(__dirname, "../../../docs/company/claims.yaml"),
        "utf8"
      )
    );
    const text = [
      require("../package.json").description,
      ...Object.values(App.creates).map((a) => a.display.description),
    ].join("\n");
    for (const row of claims.filter((c) =>
      ["forbidden", "retired"].includes(c.status)
    )) {
      const match = row.is_regex
        ? new RegExp(row.claim.slice(1, row.claim.lastIndexOf("/")), "i").test(
            text
          )
        : text.toLowerCase().includes(row.claim.toLowerCase());
      assert.equal(
        match,
        false,
        `Claim ${row.id} is not allowed in the listing`
      );
    }
  });
  it("keeps schema snapshots in sync with the real manifests", () => {
    for (const [slug, schema] of Object.entries(schemas)) {
      const m = YAML.parse(
        fs.readFileSync(
          path.join(__dirname, "../../../manifests", `${slug}.yaml`),
          "utf8"
        )
      );
      assert.deepEqual(
        schema,
        structuralSchema({ input: m.input_schema, output: m.output_schema })
      );
    }
  });
  for (const [code, slug, input, output] of [
    ["GB", "uk-company-data", "company_number", "company_number"],
    ["SE", "swedish-company-data", "org_number", "org_number"],
    ["NO", "norwegian-company-data", "org_number", "org_number"],
    ["FI", "finnish-company-data", "business_id", "business_id"],
  ]) {
    it(`looks up ${code} with explicit input/output mappings and attribution`, async () => {
      mock(slug, { [input]: "EXAMPLE" });
      const o = await run("lookup_company", {
        country: code,
        registration_number: "EXAMPLE",
      });
      assert.equal(o.company_name, "Example Company");
      assert.equal(o.registration_number, fixtures[slug].result.output[output]);
      assert.equal(o.country, code);
      assert.equal(o.status, "active");
      assert.equal(o.source, "Example registry");
      assert.equal(o.fetched_at, fixtures[slug].result.provenance.fetched_at);
      assert.ok(o.address.includes("Example"));
    });
  }
  for (const [code, slug] of [
    ["GB", "uk-company-data"],
    ["NO", "norwegian-company-data"],
    ["FI", "finnish-company-data"],
  ]) {
    it(`maps ${code} name lookup`, async () => {
      mock(slug, { company_name: "Example Company" });
      assert.equal(
        (
          await run("lookup_company", {
            country: code,
            company_name: "Example Company",
          })
        ).company_name,
        "Example Company"
      );
    });
  }
  it("maps VAT false and empty company fields without inventing values", async () => {
    mock("vat-validate", { vat_number: "EXAMPLE" });
    assert.deepEqual(
      await run("check_eu_vat", { vat_number: "EXAMPLE" }),
      jobs.check_eu_vat.sample
    );
  });
  it("maps both screening tools, date aliases and evidence", async () => {
    mock("sanctions-check", {
      name: "Example Person",
      entity_type: "person",
      country: "SE",
      birth_date: "1990-01-01",
    });
    mock("pep-check", {
      name: "Example Person",
      country: "SE",
      date_of_birth: "1990-01-01",
    });
    const o = await run("screen_name", {
      name: "Example Person",
      country: "se",
      birth_date: "1990-01-01",
    });
    assert.equal(o.sanctions_match_count, 0);
    assert.equal(o.pep_match_count, 0);
    assert.deepEqual(JSON.parse(o.sanctions_matches), []);
    assert.deepEqual(
      JSON.parse(o.pep_lists),
      fixtures["pep-check"].result.output.lists_queried
    );
    assert.equal(o.pep_source, "dilisense");
  });
  it("maps a valid IBAN with its bank code and source", async () => {
    mock("iban-validate", { iban: "SE00EXAMPLE" });
    assert.deepEqual(
      await run("check_iban", { iban: " SE00EXAMPLE " }),
      jobs.check_iban.sample
    );
  });
  it("returns the reason for an invalid IBAN and leaves empty codes empty", async () => {
    mock(
      "iban-validate",
      { iban: "XX00" },
      {
        result: {
          ...fixtures["iban-validate"].result,
          output: {
            valid: false,
            country_code: "",
            check_digits: "",
            bban: "",
            bank_code: "",
            branch_code: null,
            expected_length: null,
            error: "Invalid IBAN format.",
          },
        },
      }
    );
    const o = await run("check_iban", { iban: "XX00" });
    assert.equal(o.valid, false);
    assert.equal(o.country_code, null);
    assert.equal(o.bank_code, null);
    assert.equal(o.reason, "Invalid IBAN format.");
  });
  it("maps a full email check", async () => {
    mock("email-validate", { email: "person@example.com" });
    assert.deepEqual(
      await run("check_email", { email: "person@example.com" }),
      jobs.check_email.sample
    );
  });
  it("leaves DNS checks empty, not false, when the format check fails", async () => {
    mock(
      "email-validate",
      { email: "not-an-email" },
      {
        result: {
          ...fixtures["email-validate"].result,
          output: {
            valid: false,
            email: "not-an-email",
            format_valid: false,
            reason: "Invalid email format.",
          },
          provenance: { source: "algorithmic", fetched_at: "2026-10-27T12:00:00.000Z" },
        },
      }
    );
    const o = await run("check_email", { email: "not-an-email" });
    assert.equal(o.valid, false);
    assert.equal(o.format_valid, false);
    assert.equal(o.has_mx_records, null);
    assert.equal(o.is_disposable, null);
    assert.equal(o.reason, "Invalid email format.");
  });
  it("authenticates with the non-billable balance GET and attribution", async () => {
    scope()
      .get("/v1/wallet/balance")
      .query({ src: "zapier" })
      .reply(200, { balance_cents: 100, currency: "EUR" });
    assert.equal(
      (await appTester(App.authentication.test, bundle({}))).balance_cents,
      100
    );
  });
  it("asks for manual reconnection on invalid custom-auth keys", async () => {
    scope()
      .get("/v1/wallet/balance")
      .query({ src: "zapier" })
      .reply(401, {
        error_code: "unauthorized",
        message: "Invalid key",
        details: { fix: "Replace the API key." },
      });
    await assert.rejects(
      appTester(App.authentication.test, bundle({})),
      (e) =>
        e.name === "ExpiredAuthError" &&
        e.message.includes("Replace the API key.")
    );
  });
  for (const [status, body, error] of [
    [
      400,
      {
        error_code: "invalid_request",
        message: "Bad VAT",
        details: { fix: "Include a country prefix.", retryable: false },
      },
      "HaltedError",
    ],
    [
      402,
      {
        error_code: "insufficient_balance",
        message: "Balance too low",
        details: { fix: "Add wallet credit.", retryable: false },
      },
      "HaltedError",
    ],
    [
      503,
      {
        error_code: "capability_unavailable",
        message: "Disabled",
        retryable: false,
        details: { fix: "Choose another tool." },
      },
      "HaltedError",
    ],
    [
      503,
      {
        error_code: "execution_failed",
        message: "Temporarily unavailable",
        details: { fix: "Try later.", retryable: true },
      },
      "AppError",
    ],
    [
      401,
      {
        error_code: "unauthorized",
        message: "Expired key",
        details: { fix: "Replace key." },
      },
      "ExpiredAuthError",
    ],
    [
      429,
      {
        error_code: "rate_limited",
        message: "Too many calls",
        details: { fix: "Wait before retrying.", retry_after_seconds: 17 },
      },
      "ThrottledError",
    ],
  ])
    it(`maps ${status}/${body.error_code} to ${error} including fix`, async () => {
      mock("vat-validate", { vat_number: "EXAMPLE" }, body, status);
      await assert.rejects(
        run("check_eu_vat", { vat_number: "EXAMPLE" }),
        (e) =>
          e.name === error &&
          e.message.includes(body.details.fix) &&
          (status !== 429 || JSON.parse(e.message).delay === 17)
      );
    });
  it("halts non-retryable cap errors with the code and fix", async () => {
    mock("vat-validate", { vat_number: "EXAMPLE" }, {
      error_code: "key_total_cap_exceeded",
      message: "Key cap reached.",
      details: { retryable: false, fix: "Raise the cap." },
    }, 429);
    await assert.rejects(run("check_eu_vat", { vat_number: "EXAMPLE" }),
      (e) => e.name === "HaltedError" && e.message.includes("key_total_cap_exceeded") && e.message.includes("Key cap reached.") && e.message.includes("Raise the cap."));
  });
  it("includes next-step guidance when fix is absent", async () => {
    mock("vat-validate", { vat_number: "EXAMPLE" }, {
      error_code: "execution_failed",
      message: "Execution failed.",
      details: { retryable: true, next_step: "Check the transaction." },
    }, 503);
    await assert.rejects(run("check_eu_vat", { vat_number: "EXAMPLE" }),
      (e) => e.name === "AppError" && e.message.includes("Check the transaction."));
  });
  it("uses Retry-After when the 429 body has no delay", async () => {
    scope()
      .post("/v1/do")
      .query({ src: "zapier" })
      .reply(
        429,
        { message: "Slow down", details: { fix: "Wait." } },
        { "Retry-After": "23" }
      );
    await assert.rejects(
      run("check_eu_vat", { vat_number: "EXAMPLE" }),
      (e) => e.name === "ThrottledError" && JSON.parse(e.message).delay === 23
    );
  });
  it("returns a safe message for a non-JSON upstream failure", async () => {
    mock(
      "vat-validate",
      { vat_number: "EXAMPLE" },
      "<html>internal stack trace</html>",
      502
    );
    await assert.rejects(
      run("check_eu_vat", { vat_number: "EXAMPLE" }),
      (e) => e.name === "AppError" && !e.message.includes("<html>")
    );
  });
  it("polls async work without resubmitting and maps the completed output", async () => {
    mock(
      "vat-validate",
      { vat_number: "EXAMPLE" },
      {
        result: {
          status: "executing",
          transaction_id: "synthetic-transaction",
        },
      },
      202
    );
    scope()
      .get("/v1/transactions/synthetic-transaction")
      .query({ src: "zapier" })
      .reply(200, {
        id: "synthetic-transaction",
        ...fixtures["vat-validate"].result,
      });
    assert.deepEqual(
      await run("check_eu_vat", { vat_number: "EXAMPLE" }),
      jobs.check_eu_vat.sample
    );
  });
  for (const [status, errorName] of [
    [503, "HaltedError"],
    [429, "HaltedError"],
    [401, "ExpiredAuthError"],
  ]) {
    it(`preserves the submitted transaction on polling failure ${status}`, async () => {
      mock(
        "vat-validate",
        { vat_number: "EXAMPLE" },
        {
          result: {
            status: "executing",
            transaction_id: "synthetic-transaction",
          },
        },
        202
      );
      scope()
        .get("/v1/transactions/synthetic-transaction")
        .query({ src: "zapier" })
        .reply(status, {
          message: "Cannot read now",
          details: { fix: "Review the existing check.", retryable: true },
        });
      await assert.rejects(
        run("check_eu_vat", { vat_number: "EXAMPLE" }),
        (e) =>
          e.name === errorName &&
          e.message.includes("synthetic-transaction") &&
          e.message.includes("Review the existing check.")
      );
    });
  }
  it("halts with the submitted transaction on a polling network failure", async () => {
    mock(
      "vat-validate",
      { vat_number: "EXAMPLE" },
      {
        result: {
          status: "executing",
          transaction_id: "synthetic-transaction",
        },
      },
      202
    );
    scope()
      .get("/v1/transactions/synthetic-transaction")
      .query({ src: "zapier" })
      .replyWithError("Network unavailable");
    await assert.rejects(
      run("check_eu_vat", { vat_number: "EXAMPLE" }),
      (e) =>
        e.name === "HaltedError" && e.message.includes("synthetic-transaction")
    );
  });
  it("does not report pending work as a successful check", async () => {
    mock(
      "vat-validate",
      { vat_number: "EXAMPLE" },
      {
        result: {
          status: "executing",
          transaction_id: "synthetic-transaction",
        },
      },
      202
    );
    scope()
      .get("/v1/transactions/synthetic-transaction")
      .query({ src: "zapier" })
      .reply(200, {
        id: "synthetic-transaction",
        status: "failed",
        details: { fix: "Correct the VAT number." },
      });
    await assert.rejects(
      run("check_eu_vat", { vat_number: "EXAMPLE" }),
      /synthetic-transaction.*Correct the VAT number/
    );
  });
  it("does not start PEP after sanctions fails", async () => {
    mock(
      "sanctions-check",
      { name: "Example Person", entity_type: "person" },
      {
        error_code: "invalid_request",
        message: "Fix name",
        details: { retryable: false },
      },
      400
    );
    await assert.rejects(
      run("screen_name", { name: "Example Person" }),
      (e) => e.name === "HaltedError"
    );
  });
  for (const [key, inputs] of [
    ["lookup_company", { country: "SE", company_name: "Example Company" }],
    ["lookup_company", { country: "US", registration_number: "EXAMPLE" }],
    [
      "lookup_company",
      {
        country: "GB",
        registration_number: "EXAMPLE",
        company_name: "Example Company",
      },
    ],
    ["check_eu_vat", { vat_number: " " }],
    ["screen_name", { name: "X" }],
    ["screen_name", { name: "Example Person", birth_date: "2026-02-30" }],
    ["check_iban", { iban: " " }],
    ["check_email", { email: "x" }],
  ]) {
    it(`validates before paid calls: ${key} ${JSON.stringify(
      inputs
    )}`, async () => {
      await assert.rejects(run(key, inputs), (e) => e.name === "HaltedError");
    });
  }
});
