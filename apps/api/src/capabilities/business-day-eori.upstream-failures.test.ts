/**
 * Swallowed-upstream-failure fixes, wave 2a: business-day-check (audit row 17)
 * and eori-validate (row 19); archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md.
 *
 * business-day-check answered `is_business_day: true` on a public holiday when
 * Nager.Date failed, and eori-validate answered `valid: null` (service down) or
 * `valid: false` (a reply it could not read), all billed. Each now throws,
 * unbilled. A number the EORI service says is not valid keeps its output; a
 * country Nager.Date holds no calendar for is refused, unbilled (below).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityExecutor } from "./index.js";

let fetchMock: ReturnType<typeof vi.fn>;

/** Fresh modules per test: holiday-calendar caches Nager.Date answers in module state. */
async function load(slug: string, module: string): Promise<CapabilityExecutor> {
  vi.resetModules();
  const index = await import("./index.js");
  await import(module);
  const exec = index.getDirectExecutor(slug);
  if (!exec) throw new Error(`${slug} is not registered`);
  return exec;
}

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  const err = await promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e,
  );
  expect((err as Error).name).toBe("UpstreamUnavailableError");
  expect((err as Error).message).not.toMatch(/not found|invalid|missing|required/i);
  const { outcomeFromError } = await import("../lib/execution-outcome.js");
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err as Error & { retryable?: boolean };
}

async function expectBillable(slug: string, output: unknown): Promise<void> {
  const { assertBillableOutput } = await import("../lib/execution-outcome.js");
  expect(() => assertBillableOutput(slug, output)).not.toThrow();
}

const status = (code: number, body = "") => new Response(body, { status: code });
const networkError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

const failures: Array<[string, () => Promise<Response>, boolean]> = [
  ["HTTP 503", async () => status(503), true],
  ["HTTP 429", async () => status(429), true],
  ["network error", async () => { throw networkError(); }, true],
  ["timeout", async () => { throw timeout(); }, true],
];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── business-day-check (row 17) ────────────────────────────────────────────

// 2026-12-25 is a Friday and a public holiday in Sweden.
const CHRISTMAS = { date: "2026-12-25", country_code: "SE" };
const SE_HOLIDAYS = [
  { date: "2026-12-24", localName: "Julafton", name: "Christmas Eve" },
  { date: "2026-12-25", localName: "Juldagen", name: "Christmas Day" },
  { date: "2026-12-26", localName: "Annandag jul", name: "St. Stephen's Day" },
];

describe("business-day-check: Nager.Date failures throw (row 17)", () => {
  it.each(failures)("throws, unbilled, when Nager.Date fails with %s", async (_label, answer, retryable) => {
    fetchMock.mockImplementation(answer);
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = await expectUnbilledUpstreamFailure(exec(CHRISTMAS));
    expect(err.message).toContain("Nager.Date public-holiday API");
    expect(err.retryable).toBe(retryable);
  });

  it("throws, unbilled, when Nager.Date answers 200 with a body that does not parse", async () => {
    fetchMock.mockImplementation(async () => status(200, "<html>maintenance</html>"));
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = await expectUnbilledUpstreamFailure(exec(CHRISTMAS));
    expect(err.message).toContain("did not parse");
  });

  it("throws, unbilled, when Nager.Date answers 200 with JSON that is not a holiday list", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ status: "maintenance" }), { status: 200 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = await expectUnbilledUpstreamFailure(exec(CHRISTMAS));
    expect(err.message).toContain("not a holiday list");
    expect((err as { code?: unknown }).code).toBe("unparseable");
  });

  // Derived from the clock so the cases stay outside Nager.Date's window of
  // about 50 years either side of the current year, whenever the suite runs.
  const NOW_YEAR = new Date().getUTCFullYear();
  it.each([[`${NOW_YEAR - 51}-06-02`, NOW_YEAR - 51], [`${NOW_YEAR + 51}-06-03`, NOW_YEAR + 51]])(
    "refuses %s, a year Nager.Date does not cover (HTTP 400): unbilled, not counted against the capability",
    async (date, year) => {
      fetchMock.mockImplementation(async () => status(400));
      const exec = await load("business-day-check", "./business-day-check.js");
      const err = (await exec({ date, country_code: "SE" }).catch((e: unknown) => e)) as Error;
      expect(err.name).not.toBe("UpstreamUnavailableError");
      const { isCapabilityRefusal } = await import("../lib/capability-refusal.js");
      expect(isCapabilityRefusal(err)).toBe(true);
      expect(isCapabilityRefusal(err.message)).toBe(true);
      expect(err.message).toContain(`${year} is outside that range`);
      const { outcomeFromError } = await import("../lib/execution-outcome.js");
      expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "capability_refused", counts_against_capability: false });
    },
  );

  it.each([[`${NOW_YEAR + 50}-12-30`, NOW_YEAR + 51], [`${NOW_YEAR - 50}-01-05`, NOW_YEAR - 51]])(
    "refuses %s, whose next or previous business day search reaches %s, outside Nager.Date's window: unbilled",
    async (date, outside) => {
      fetchMock.mockImplementation(async (url: string | URL | Request) =>
        String(url).includes(`/${outside}/`) ? status(400) : new Response("[]", { status: 200 }));
      const exec = await load("business-day-check", "./business-day-check.js");
      const err = (await exec({ date, country_code: "SE" }).catch((e: unknown) => e)) as Error;
      const { isCapabilityRefusal } = await import("../lib/capability-refusal.js");
      expect(isCapabilityRefusal(err)).toBe(true);
      expect(err.message).toContain(`reaches ${outside}`);
      const { outcomeFromError } = await import("../lib/execution-outcome.js");
      expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "capability_refused", counts_against_capability: false });
    },
  );

  it.each(["1!", "Ö1", ".."])("refuses the country code %s before asking Nager.Date: unbilled", async (code) => {
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = (await exec({ date: "2026-06-03", country_code: code }).catch((e: unknown) => e)) as Error;
    const { outcomeFromError } = await import("../lib/execution-outcome.js");
    expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "capability_refused", counts_against_capability: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws, unbilled, on a 400 for a year inside Nager.Date's window: the caller's date does not explain it", async () => {
    fetchMock.mockImplementation(async () => status(400));
    const exec = await load("business-day-check", "./business-day-check.js");
    const year = new Date().getUTCFullYear();
    const err = await expectUnbilledUpstreamFailure(exec({ date: `${year}-06-03`, country_code: "SE" }));
    expect(err.message).not.toContain("outside that range");
  });

  it("answers a holiday correctly when Nager.Date answers", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(SE_HOLIDAYS), { status: 200 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    const r = await exec(CHRISTMAS);
    expect(r.output).toMatchObject({ is_business_day: false, reason: "public_holiday: Christmas Day", next_business_day: "2026-12-28" });
  });

  // A country Nager.Date holds no calendar for used to get a weekends-only
  // answer, billed: `is_business_day: true` on that country's public holidays.
  // Both no-calendar answers are now refusals, unbilled and not counted
  // against the capability (promise-audit T1, the Nager.Date no-calendar path).
  async function expectNoCalendarRefusal(promise: Promise<unknown>): Promise<Error & { field?: unknown; fix?: unknown }> {
    const err = (await promise.then(
      (r) => {
        throw new Error(`expected a refusal, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
      },
      (e: unknown) => e,
    )) as Error & { field?: unknown; fix?: unknown };
    const { isCapabilityRefusal } = await import("../lib/capability-refusal.js");
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(isCapabilityRefusal(err.message)).toBe(true);
    const { outcomeFromError } = await import("../lib/execution-outcome.js");
    expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "capability_refused", counts_against_capability: false });
    return err;
  }

  it("refuses, unbilled, a country Nager.Date holds no calendar for (204), instead of a weekends-only answer", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = await expectNoCalendarRefusal(exec({ date: "2026-12-25", country_code: "TH" }));
    expect(err.message).toContain("TH");
    expect(err.message).toMatch(/holds none for 'TH'/);
    expect(err.message).toContain("2026-12-25");
  });

  it("refuses, unbilled, a country code Nager.Date does not recognise (404), such as ZZ", async () => {
    fetchMock.mockImplementation(async () => status(404));
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = await expectNoCalendarRefusal(exec({ date: "2026-12-25", country_code: "ZZ" }));
    expect(err.message).toContain("ZZ");
    expect(err.message).not.toMatch(/retry/i);
  });

  it("refuses again from the negative cache: a second call for the same uncovered country is still unbilled", async () => {
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    await expectNoCalendarRefusal(exec({ date: "2026-06-03", country_code: "TH" }));
    await expectNoCalendarRefusal(exec({ date: "2026-06-04", country_code: "TH" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // The next and previous business day can fall in the adjacent year; they
  // used to be found with the date's own year's holidays only, so 31 December
  // answered 1 January (a public holiday) as the next business day, billed.
  const byYear = (lists: Record<string, unknown>) => async (url: string | URL | Request) => {
    const year = /PublicHolidays\/(\d{4})\//.exec(String(url))?.[1] ?? "";
    return year in lists ? new Response(JSON.stringify(lists[year]), { status: 200 }) : status(503);
  };
  const SE_2026 = [...SE_HOLIDAYS, { date: "2026-12-31", localName: "Nyårsafton", name: "New Year's Eve" }];
  const SE_2027 = [{ date: "2027-01-01", localName: "Nyårsdagen", name: "New Year's Day" }, { date: "2027-01-06", localName: "Trettondedag jul", name: "Epiphany" }];

  it("counts next year's holidays for the next business day: 30 Dec 2026 is followed by 4 Jan 2027, not 1 Jan", async () => {
    fetchMock.mockImplementation(byYear({ 2026: SE_2026, 2027: SE_2027 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    const r = await exec({ date: "2026-12-30", country_code: "SE" });
    expect(r.output).toMatchObject({ is_business_day: true, next_business_day: "2027-01-04", previous_business_day: "2026-12-29" });
    await expectBillable("business-day-check", r.output);
  });

  it("counts last year's holidays for the previous business day: 4 Jan 2027 is preceded by 30 Dec 2026, not 31 Dec", async () => {
    fetchMock.mockImplementation(byYear({ 2026: SE_2026, 2027: SE_2027 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    const r = await exec({ date: "2027-01-04", country_code: "SE" });
    expect(r.output).toMatchObject({ is_business_day: true, previous_business_day: "2026-12-30", next_business_day: "2027-01-05" });
  });

  it("throws, unbilled, when the adjacent year's holidays do not arrive", async () => {
    fetchMock.mockImplementation(byYear({ 2026: SE_2026 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    const err = await expectUnbilledUpstreamFailure(exec({ date: "2026-12-30", country_code: "SE" }));
    expect(err.message).toContain("Nager.Date public-holiday API");
  });

  it("asks for one year only when the search cannot leave it", async () => {
    fetchMock.mockImplementation(byYear({ 2026: SE_2026 }));
    const exec = await load("business-day-check", "./business-day-check.js");
    await exec({ date: "2026-06-03", country_code: "SE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ─── eori-validate (row 19) ─────────────────────────────────────────────────

const soap = (result: string) =>
  new Response(
    `<?xml version="1.0"?><S:Envelope xmlns:S="http://schemas.xmlsoap.org/soap/envelope/"><S:Body><ns2:validateEORIResponse xmlns:ns2="http://eori.ws.eos.dds.s/"><return><requestDate>11/11/2026</requestDate>${result}</return></ns2:validateEORIResponse></S:Body></S:Envelope>`,
    { status: 200, headers: { "content-type": "text/xml" } },
  );
const EORI = { eori: "DE123456789012345" };

describe("eori-validate: service failures throw (row 19)", () => {
  it.each([...failures, ["HTTP 500 SOAP fault", async () => status(500, "<S:Fault>server</S:Fault>"), true] as const])(
    "throws, unbilled, when the EORI service fails with %s",
    async (_label, answer, retryable) => {
      fetchMock.mockImplementation(answer);
      const exec = await load("eori-validate", "./eori-validate.js");
      const err = await expectUnbilledUpstreamFailure(exec(EORI));
      expect(err.message).toContain("EU EORI validation service");
      expect(err.retryable).toBe(retryable);
    },
  );

  it("throws, not retryable, when the endpoint is gone (404)", async () => {
    fetchMock.mockImplementation(async () => status(404));
    const exec = await load("eori-validate", "./eori-validate.js");
    const err = await expectUnbilledUpstreamFailure(exec(EORI));
    expect(err.retryable).toBe(false);
  });

  it("throws, unbilled, when a 200 reply carries no validation status (it used to read valid: false)", async () => {
    fetchMock.mockImplementation(async () => status(200, "<html><body>Service under maintenance</body></html>"));
    const exec = await load("eori-validate", "./eori-validate.js");
    const err = await expectUnbilledUpstreamFailure(exec(EORI));
    expect(err.message).toContain("no validation status");
  });

  it("keeps the real negative: a number the service says is not valid", async () => {
    fetchMock.mockImplementation(async () =>
      soap("<result><eori>DE123456789012345</eori><status>1</status><statusDescr>Not valid</statusDescr></result>"),
    );
    const exec = await load("eori-validate", "./eori-validate.js");
    const r = await exec(EORI);
    expect(r.output).toEqual({
      valid: false,
      eori_number: "DE123456789012345",
      country_code: "DE",
      trader_name: null,
      trader_address: null,
      street: null,
      city: null,
      postal_code: null,
      country: null,
    });
    await expectBillable("eori-validate", r.output);
  });

  it("keeps the positive answer", async () => {
    fetchMock.mockImplementation(async () =>
      soap("<result><eori>DE123456789012345</eori><status>0</status><statusDescr>Valid</statusDescr><name>Example GmbH</name><city>Berlin</city></result>"),
    );
    const exec = await load("eori-validate", "./eori-validate.js");
    const r = await exec(EORI);
    expect(r.output).toMatchObject({ valid: true, trader_name: "Example GmbH", city: "Berlin" });
  });

  it("still answers a malformed number from the format check without calling the service", async () => {
    const exec = await load("eori-validate", "./eori-validate.js");
    const r = await exec({ eori: "12" });
    expect(r.output).toMatchObject({ valid: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
