/**
 * Swallowed-upstream-failure fixes, wave 1: the DNS family (audit rows 4, 10,
 * 11, 12, 13, 25, 36, 37, 38;
 * archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md).
 *
 * For each executor, three claims:
 *   - a resolver that could not answer (ETIMEOUT, ESERVFAIL) THROWS
 *     UpstreamUnavailableError, which the outcome module files as unbilled;
 *   - a real negative (ENOTFOUND, ENODATA) still returns the exact output the
 *     executor returned before the fix, and that output is still billable;
 *   - the thrown path is unbillable at the billing authority itself.
 *
 * `node:dns/promises` is stubbed (and `node:dns` / `dns`, which the pre-fix
 * executors imported, so the same file can be run against them to show the
 * transient cases failing before the fix).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({
  resolve4: vi.fn(),
  resolve6: vi.fn(),
  resolveMx: vi.fn(),
  resolveNs: vi.fn(),
  resolveTxt: vi.fn(),
  resolveCname: vi.fn(),
  resolveSoa: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock("node:dns/promises", () => ({ default: dns, ...dns }));
vi.mock("dns/promises", () => ({ default: dns, ...dns }));
vi.mock("node:dns", async (orig) => {
  const real = (await orig()) as Record<string, unknown> & { default: Record<string, unknown> };
  return { ...real, promises: dns, default: { ...real.default, promises: dns } };
});
vi.mock("dns", async (orig) => {
  const real = (await orig()) as Record<string, unknown> & { default: Record<string, unknown> };
  return { ...real, promises: dns, default: { ...real.default, promises: dns } };
});

const safeFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: safeFetchMock, discardBody: vi.fn(async () => {}) }));
vi.mock("../lib/robots-txt.js", () => ({ assertRobotsAllowed: vi.fn(async () => {}) }));
const renderMock = vi.hoisted(() => vi.fn(async () => "<html><body>hi</body></html>"));
vi.mock("./lib/browserless-extract.js", () => ({ fetchRenderedHtml: renderMock }));
const llmMock = vi.hoisted(() => vi.fn(async () => ({ domain: "example.com", detected_technologies: [] })));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm: llmMock }));

import { getDirectExecutor } from "./index.js";
import "./mx-lookup.js";
import "./dns-lookup.js";
import "./email-auth-check.js";
import "./email-deliverability-check.js";
import "./domain-reputation.js";
import "./email-pattern-discover.js";
import "./email-reputation-score.js";
import "./email-validate.js";
import "./email-validate-bulk.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { assertBillableOutput, outcomeFromError } from "../lib/execution-outcome.js";

const IP = "93.184.216.34";

function dnsError(code: string): Error {
  return Object.assign(new Error(`query ${code} example.com`), { code });
}
const reject = (code: string) => () => Promise.reject(dnsError(code));

/** Every query answers NXDOMAIN unless a test says otherwise. */
function allNxdomain(): void {
  for (const fn of Object.values(dns)) fn.mockReset().mockImplementation(reject("ENOTFOUND"));
  dns.lookup.mockReset().mockResolvedValue([{ address: IP, family: 4 }]);
}

function run(slug: string, input: Record<string, unknown>) {
  const exec = getDirectExecutor(slug);
  if (!exec) throw new Error(`${slug} is not registered`);
  return exec(input);
}

/** The thrown path: an UpstreamUnavailableError that billing refuses to charge. */
async function expectUnbilledUpstreamFailure(promise: Promise<unknown>, code: string): Promise<void> {
  const err = await promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UpstreamUnavailableError);
  expect((err as UpstreamUnavailableError).code).toBe(code);
  expect(outcomeFromError(err)).toMatchObject({
    billable: false,
    failure_class: "provider_unavailable",
    retryable: true,
  });
}

/** The negative path: the old output, and still a billable answer. */
async function expectBilledNegative(slug: string, input: Record<string, unknown>, expected: Record<string, unknown>) {
  const result = await run(slug, input);
  expect(result.output).toEqual(expected);
  expect(() => assertBillableOutput(slug, result.output)).not.toThrow();
}

beforeEach(() => {
  allNxdomain();
  safeFetchMock.mockReset().mockRejectedValue(new Error("fetch failed"));
  llmMock.mockClear();
  renderMock.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(["ETIMEOUT", "ESERVFAIL"])("a resolver failure (%s) throws, unbilled", (code) => {
  it("mx-lookup", async () => {
    dns.resolve4.mockResolvedValue([IP]);
    dns.resolveMx.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("mx-lookup", { domain: "example.com" }), code);
  });

  it("dns-lookup (free tier)", async () => {
    dns.resolve4.mockResolvedValue([IP]);
    dns.resolveTxt.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("dns-lookup", { domain: "example.com" }), code);
  });

  it("email-auth-check, on the DMARC lookup", async () => {
    dns.resolveTxt.mockImplementation((name: string) =>
      name.startsWith("_dmarc.") ? Promise.reject(dnsError(code)) : Promise.resolve([["v=spf1 -all"]]),
    );
    await expectUnbilledUpstreamFailure(run("email-auth-check", { domain: "example.com" }), code);
  });

  it("email-deliverability-check, on the SPF lookup", async () => {
    dns.resolve4.mockResolvedValue([IP]);
    dns.resolveTxt.mockImplementation((name: string) =>
      name === "example.com" ? Promise.reject(dnsError(code)) : Promise.reject(dnsError("ENOTFOUND")),
    );
    await expectUnbilledUpstreamFailure(run("email-deliverability-check", { domain: "example.com" }), code);
  });

  it("email-deliverability-check, when every blocklist errored", async () => {
    dns.resolve4.mockImplementation((name: string) =>
      name === "example.com" ? Promise.resolve([IP]) : Promise.reject(dnsError(code)),
    );
    await expectUnbilledUpstreamFailure(run("email-deliverability-check", { domain: "example.com" }), code);
  });

  it("domain-reputation, on the TXT lookup", async () => {
    dns.resolve4.mockResolvedValue([IP]);
    dns.resolveTxt.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("domain-reputation", { domain: "example.com" }), code);
  });

  it("domain-reputation, on the A lookup", async () => {
    dns.resolve4.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("domain-reputation", { domain: "example.com" }), code);
  });

  // company-tech-stack is not in this family any more: since #938 it reads DNS
  // through lib/tech-dns.ts and reports a resolver fault in the result
  // (dns_status plus a warning) beside its page detections, instead of
  // throwing. company-tech-stack.test.ts ("states a DNS fault in the result")
  // covers that; either is an honest answer under the audit's rule.

  it("email-pattern-discover, on the MX lookup", async () => {
    dns.resolveMx.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("email-pattern-discover", { domain: "example.com" }), code);
  });

  it("email-reputation-score, on the MX lookup", async () => {
    dns.resolveMx.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("email-reputation-score", { email: "jane@example.com" }), code);
  });

  it("email-validate (free tier), on the MX lookup", async () => {
    dns.resolveMx.mockImplementation(reject(code));
    await expectUnbilledUpstreamFailure(run("email-validate", { email: "jane@example.com" }), code);
  });
});

describe("a real negative keeps today's output, and is still billed", () => {
  it("mx-lookup: NXDOMAIN everywhere", async () => {
    await expectBilledNegative("mx-lookup", { domain: "example.com" }, {
      domain: "example.com",
      mx_records: [],
      email_provider: "unknown",
      a_records: [],
      aaaa_records: [],
      nameservers: [],
      spf_record: null,
      dmarc_record: null,
      soa: null,
      has_ipv6: false,
      has_mx: false,
      has_spf: false,
      has_dmarc: false,
    });
  });

  it("mx-lookup: A record only, every other type ENODATA", async () => {
    for (const fn of Object.values(dns)) fn.mockImplementation(reject("ENODATA"));
    dns.resolve4.mockResolvedValue([IP]);
    await expectBilledNegative("mx-lookup", { domain: "example.com" }, {
      domain: "example.com",
      mx_records: [],
      email_provider: "unknown",
      a_records: [IP],
      aaaa_records: [],
      nameservers: [],
      spf_record: null,
      dmarc_record: null,
      soa: null,
      has_ipv6: false,
      has_mx: false,
      has_spf: false,
      has_dmarc: false,
    });
  });

  it("dns-lookup: A record only, every other type ENODATA", async () => {
    for (const fn of Object.values(dns)) fn.mockImplementation(reject("ENODATA"));
    dns.resolve4.mockResolvedValue([IP]);
    await expectBilledNegative("dns-lookup", { domain: "example.com" }, {
      domain: "example.com",
      a_records: [IP],
      aaaa_records: [],
      mx_records: [],
      ns_records: [],
      txt_records: [],
      cname_records: [],
      has_spf: false,
      has_dmarc: false,
    });
  });

  it("dns-lookup: NXDOMAIN still refuses as 'No DNS records found'", async () => {
    await expect(run("dns-lookup", { domain: "example.com" })).rejects.toThrow(/No DNS records found for "example.com"/);
  });

  it("email-auth-check: no records of any kind", async () => {
    for (const fn of Object.values(dns)) fn.mockImplementation(reject("ENODATA"));
    await expectBilledNegative("email-auth-check", { domain: "example.com" }, {
      domain: "example.com",
      has_mx: false,
      mx_hosts: [],
      spf_status: "missing",
      spf_record: null,
      dmarc_status: "missing",
      dmarc_present: false,
      dmarc_record: null,
      dmarc_policy: null,
      dmarc_effective_policy: null,
      dmarc_inherited_from: null,
      dmarc_subdomain_policy: null,
      dmarc_pct: null,
      dkim_checked_selectors: ["default", "google", "selector1", "selector2", "k1", "s1", "dkim"],
      dkim_found: [],
      dkim_note: "DKIM probed via common selectors only — a miss does not prove the domain has no DKIM; pass dkim_selector for an exact check",
      auth_summary: "incomplete",
    });
  });

  const deliverabilityNegative = {
    domain: "example.com",
    score: 20,
    grade: "F",
    mx_records: [],
    spf: { exists: false, record: null, valid: false, mechanism: null },
    dmarc: { exists: false, record: null, policy: null },
    dkim: { detected: false, selector_found: null },
    blacklisted: false,
    blacklists_checked: [
      { name: "zen.spamhaus.org", listed: false },
      { name: "bl.spamcop.net", listed: false },
      { name: "b.barracudacentral.org", listed: false },
    ],
    issues: [
      "No MX records found",
      "No SPF record found",
      "No DMARC record found",
      "No DKIM record found for common selectors",
    ],
    recommendations: [
      "Configure MX records pointing to your mail server.",
      "Add a TXT record with v=spf1 specifying your authorized mail servers.",
      "Add a DMARC record at _dmarc.example.com with at minimum v=DMARC1; p=none; rua=mailto:dmarc@example.com",
      "Configure DKIM signing and publish a DKIM DNS record. Note: custom selectors may exist but were not detected.",
    ],
  };

  it("email-deliverability-check: resolves, no mail records, not listed (NXDOMAIN on every list)", async () => {
    dns.resolve4.mockImplementation((name: string) =>
      name === "example.com" ? Promise.resolve([IP]) : Promise.reject(dnsError("ENOTFOUND")),
    );
    dns.resolveMx.mockImplementation(reject("ENODATA"));
    dns.resolveTxt.mockImplementation(reject("ENODATA"));
    await expectBilledNegative("email-deliverability-check", { domain: "example.com" }, deliverabilityNegative);
  });

  it("domain-reputation: resolves, no MX and no TXT at all (historical: no SPF/DMARC penalty)", async () => {
    dns.resolve4.mockResolvedValue([IP]);
    dns.resolveMx.mockImplementation(reject("ENODATA"));
    dns.resolveTxt.mockImplementation(reject("ENODATA"));
    safeFetchMock.mockResolvedValue(
      new Response(null, { status: 200, headers: { "strict-transport-security": "max-age=1", "x-content-type-options": "nosniff" } }),
    );
    await expectBilledNegative("domain-reputation", { domain: "example.com" }, {
      domain: "example.com",
      reputation_score: 100,
      grade: "A",
      checks: {
        resolves: true,
        ip_addresses: [IP],
        has_mx: false,
        mx_count: 0,
        has_spf: false,
        has_dmarc: false,
        https_works: true,
        https_status: 200,
        has_hsts: true,
        has_csp: false,
        has_xfo: false,
        has_xcto: true,
      },
      issues: [],
      issue_count: 0,
    });
  });

  it("domain-reputation: TXT without SPF and NXDOMAIN on _dmarc is penalised as before", async () => {
    dns.resolve4.mockResolvedValue([IP]);
    dns.resolveTxt.mockImplementation((name: string) =>
      name === "example.com" ? Promise.resolve([["google-site-verification=abc"]]) : Promise.reject(dnsError("ENOTFOUND")),
    );
    // The domain refuses the HTTPS connection, as undici reports it. Only a
    // failure at the domain's own network or TLS layer is graded (follow-up 23).
    safeFetchMock.mockRejectedValue(
      Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }) }),
    );
    await expectBilledNegative("domain-reputation", { domain: "example.com" }, {
      domain: "example.com",
      reputation_score: 60,
      grade: "C",
      checks: {
        resolves: true,
        ip_addresses: [IP],
        has_mx: false,
        mx_count: 0,
        has_spf: false,
        has_dmarc: false,
        https_works: false,
      },
      issues: ["No SPF record", "No DMARC record", "HTTPS connection failed"],
      issue_count: 3,
    });
  });

  it("email-pattern-discover: no MX", async () => {
    dns.resolveMx.mockImplementation(reject("ENODATA"));
    await expectBilledNegative("email-pattern-discover", { domain: "example.com" }, {
      domain: "example.com",
      accepts_email: false,
      mx_records: [],
      email_provider: null,
      patterns: [],
      common_pattern_addresses: [],
      recommendation: "example.com does not have MX records configured. This domain may not accept email.",
    });
  });

  it("email-reputation-score: NXDOMAIN keeps the mx_lookup_failed factor", async () => {
    await expectBilledNegative("email-reputation-score", { email: "jane@example.com" }, {
      email: "jane@example.com",
      email_valid: true,
      reputation_score: 40,
      risk_level: "medium",
      domain: "example.com",
      provider_type: "custom",
      factors: [
        { factor: "custom_domain", impact: 5, detail: "Custom domain — likely corporate email" },
        { factor: "mx_lookup_failed", impact: -15, detail: "MX lookup failed — domain may not exist" },
      ],
    });
  });

  it("email-validate: NXDOMAIN is still undeliverable", async () => {
    await expectBilledNegative("email-validate", { email: "jane@example.com" }, {
      valid: false,
      email: "jane@example.com",
      format_valid: true,
      domain: "example.com",
      has_mx_records: false,
      mx_records: [],
      is_disposable: false,
      is_role_address: false,
      is_free_provider: false,
    });
  });
});

describe("email-deliverability-check: an errored blocklist is unknown, never 'not listed'", () => {
  function lists(answer: (list: string) => Promise<string[]>) {
    dns.resolve4.mockImplementation((name: string) => {
      if (name === "example.com") return Promise.resolve([IP]);
      const list = name.split(".").slice(4).join(".");
      return answer(list);
    });
  }

  it("one list timing out is reported unknown, and not credited", async () => {
    lists((list) => (list === "bl.spamcop.net" ? Promise.reject(dnsError("ETIMEOUT")) : Promise.reject(dnsError("ENOTFOUND"))));
    const { output } = await run("email-deliverability-check", { domain: "example.com" });
    expect(output.blacklisted).toBe(false);
    expect(output.blacklists_checked).toEqual([
      { name: "zen.spamhaus.org", listed: false },
      { name: "bl.spamcop.net", listed: null, error: "ETIMEOUT" },
      { name: "b.barracudacentral.org", listed: false },
    ]);
    expect(output.issues).toContain("Blocklist check incomplete: 1 of 3 lists did not answer, so their listing status is unknown");
    expect(output.score).toBe(13);
  });

  it("a Spamhaus refusal code (127.255.255.254) is not a listing", async () => {
    lists((list) => (list === "zen.spamhaus.org" ? Promise.resolve(["127.255.255.254"]) : Promise.reject(dnsError("ENOTFOUND"))));
    const { output } = await run("email-deliverability-check", { domain: "example.com" });
    expect(output.blacklisted).toBe(false);
    expect((output.blacklists_checked as unknown[])[0]).toEqual({ name: "zen.spamhaus.org", listed: null, error: "127.255.255.254" });
  });

  it("an IPv6-only domain is not checked, and earns no blocklist credit", async () => {
    for (const fn of Object.values(dns)) fn.mockImplementation(reject("ENODATA"));
    dns.resolve6.mockResolvedValue(["2001:db8::1"]);
    const { output } = await run("email-deliverability-check", { domain: "example.com" });
    expect(output.blacklisted).toBe(false);
    expect(output.blacklists_checked).toEqual([]);
    expect(output.issues).toContain(
      "Blocklist check not performed: the domain resolves only to IPv6, and the checked lists cover IPv4 only",
    );
    // No MX, SPF, DMARC or DKIM, and no blocklist credit: nothing is earned.
    expect(output.score).toBe(0);
    // No reversed-IPv6 query was sent to any list.
    expect(dns.resolve4.mock.calls.map((c) => c[0])).toEqual(["example.com"]);
  });

  it("a real listing is still a listing", async () => {
    lists((list) => (list === "bl.spamcop.net" ? Promise.resolve(["127.0.0.2"]) : Promise.reject(dnsError("ENOTFOUND"))));
    const { output } = await run("email-deliverability-check", { domain: "example.com" });
    expect(output.blacklisted).toBe(true);
    expect(output.issues).toContain("Domain IP is listed on one or more DNS blocklists");
  });
});

describe("email-validate-bulk inherits the fix through the shared checkMx", () => {
  it("marks a timed-out domain mx_checked:false instead of reporting it has no MX", async () => {
    dns.resolveMx.mockImplementation(async (domain: string) => {
      if (domain === "example.com") throw Object.assign(new Error("queryMx ETIMEOUT"), { code: "ETIMEOUT" });
      return [{ exchange: "mx.example.org", priority: 10 }];
    });
    const { output } = await run("email-validate-bulk", { emails: ["jane@example.com", "joe@example.org"] });
    const [first] = output.results as Array<Record<string, unknown>>;
    expect(first).toMatchObject({ email: "jane@example.com", mx_checked: false });
  });

  it("REGRESSION (promise-audit T1 wave 6): no MX lookup completing is an outage, not a billed batch", async () => {
    dns.resolveMx.mockImplementation(reject("ETIMEOUT"));
    await expect(run("email-validate-bulk", { emails: ["jane@example.com"] })).rejects.toBeInstanceOf(UpstreamUnavailableError);
  });
});
