import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeWithTransientRetry } from "../lib/retry.js";
import * as log from "../lib/log.js";
import { getDirectExecutor } from "./index.js";
import { fetchNtaCorporations, mapNtaCorporation, validCorporateNumber } from "../lib/nta-corporate.js";
import { normaliseRegistryOutput } from "../lib/company-status/normalise.js";
import { getErrorCodes } from "../data/error-codes.js";
import { getUnconfiguredCapabilities } from "../lib/credential-health.js";
import { PROVIDERS, hasMissingRequiredCredential } from "../lib/dependency-manifest.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import { SourceBlockedError } from "../lib/site-access.js";
import { classifyTransactionFailure, countsAgainstCapability } from "../lib/transaction-failure-taxonomy.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import "./risk-narrative-generate.js";
import "./japanese-company-data.js";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/nta-corporate/${name}.xml`, import.meta.url), "utf8");
const execute = (input: Record<string, unknown>) => getDirectExecutor("japanese-company-data")!(input);
// Advance past any prior test's in-process cool-down without exporting a
// production reset hook. Individual tests can advance this clock explicitly.
let clock = Date.now();
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clock += 120_000;
  vi.spyOn(Date, "now").mockImplementation(() => clock);
  vi.stubEnv("NTA_HOUJIN_APP_ID", "synthetic-test-id");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  fetchMock = vi.fn(async () => new Response(fixture("num_0_ver4_x4")));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Japanese company data through the official NTA v4 API", () => {
  it("maps the published number sample without browser or LLM, with attribution and provenance", async () => {
    const { output, provenance } = await execute({ corporate_number: "5111101000006" });
    expect(output).toMatchObject({ registration_number: "5111101000006", company_name: "株式会社検索対象除外", business_type: "株式会社", status: "active", assignment_date: "2015-10-05", registration_date: null, directors: null, industry: null, search_excluded: true });
    expect(output.address).toContain("東京都千代田区");
    expect(output.attribution).toContain("国税庁法人番号システムWeb-API 機能");
    expect(output.attribution).toContain("Straleが加工");
    expect(provenance).toMatchObject({ acquisition_method: "direct_api", data_access_lane: "preferred", upstream_vendor: "nta-houjin", source: "https://www.houjin-bangou.nta.go.jp/", api_version: "4" });
    expect(provenance.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const [url, options] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin + url.pathname).toBe("https://api.houjin-bangou.nta.go.jp/4/num");
    expect(Object.fromEntries(url.searchParams)).toEqual({ id: "synthetic-test-id", type: "12", history: "0", number: "5111101000006" });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers).toMatchObject({ "User-Agent": expect.stringContaining("StraleBot/1.0") });
    expect(options.redirect).toBe("error");
    expect(JSON.stringify({ output, provenance })).not.toContain("synthetic-test-id");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["company_name", "corporate_number", "task"])("accepts literal Japanese name input in %s and requests closed records too", async field => {
    fetchMock.mockResolvedValue(new Response(fixture("name-single")));
    const { output } = await execute({ [field]: "株式会社国税商事あ" });
    expect(output.company_name).toBe("株式会社国税商事あ");
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/4/name");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ name: "株式会社国税商事あ", type: "12", target: "2", mode: "2", change: "0", close: "1" });
  });

  it("uses the registered English-name target without full-width conversion", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name_ver4_x4").replace(/<enName\s*\/>/, "<enName>KOKUZEI CORPORATION</enName>")));
    const { output } = await execute({ company_name: "KOKUZEI CORPORATION" });
    expect(output.registration_number).toBe("2040001999902");
    expect(Object.fromEntries((fetchMock.mock.calls[0][0] as URL).searchParams)).toMatchObject({ target: "3", name: "KOKUZEI CORPORATION" });
  });

  it("refuses ambiguity instead of silently returning the first company", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name_ver4_x4")));
    await expect(execute({ company_name: "国税商事" })).rejects.toMatchObject({ error_code: "invalid_request", isCapabilityRefusal: true, message: expect.stringContaining("corporate number") });
  });

  it("resolves an exact name that only one open, current record carries, and lists candidates otherwise", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name_ver4_x4")));
    const { output } = await execute({ company_name: "株式会社国税商事あ" });
    expect(output.registration_number).toBe("2040001999902");
    fetchMock.mockResolvedValue(new Response(fixture("name_ver4_x4")));
    // Two open records share this name, so it stays ambiguous.
    await expect(execute({ company_name: "株式会社国税商事亜" })).rejects.toMatchObject({
      error_code: "invalid_request", message: expect.stringContaining("(1040001999903)") });
  });

  it("keeps the recorded closure through the company-status normaliser and narrative", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("closed")));
    const { output } = await execute({ corporate_number: "2310001010007" });
    expect(output).toMatchObject({ status: "dissolved", close_date: "2018-05-09", close_reason_code: "01", close_reason: "清算の結了等" });
    expect(normaliseRegistryOutput("japanese-company-data", output).status).toBe("dissolved");
    const narrative = await getDirectExecutor("risk-narrative-generate")!({ check_results: { "japanese-company-data": output }, context: "kyb" });
    expect(narrative.output.passed_checks).toEqual([]);
    expect(narrative.output.flags).toEqual([expect.objectContaining({ source_check: "japanese-company-data", severity: "critical" })]);
  });

  it("returns structured not-found for a count-zero XML response", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("not-found")));
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "not_found" });
  });

  it.each([{}, { corporate_number: "" }, { company_name: "日" }, { corporate_number: "1180301018772" }, { corporate_number: "123" }, { corporate_number: 1180301018771 }, { corporate_number: "0000000000000" }, { company_name: "あ".repeat(151) }])("rejects invalid input before calling NTA: %j", async input => {
    await expect(execute(input)).rejects.toMatchObject({ error_code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a partial single-result name with recognised ambiguity and candidates", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name-single")));
    const error = await execute({ company_name: "国税商事" }).catch(e => e);
    expect(error).toMatchObject({ error_code: "invalid_request", message: expect.stringMatching(/^Ambiguous /) });
    expect(error.message).toContain("株式会社国税商事あ (2040001999902)");
    expect(isCapabilityRefusal(error.message)).toBe(true);
  });

  it.each(["T5111101000006", "Look up 5111101000006 please", "５１１１１０１０００００６", "5111101000006 and 5111101000006"])("restores number form %s before name search", async corporate_number => {
    const { output } = await execute({ corporate_number });
    expect(output.registration_number).toBe("5111101000006");
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/4/num");
    expect(url.searchParams.get("number")).toBe("5111101000006");
  });

  it("refuses multiple distinct corporate numbers before any request", async () => {
    await expect(execute({ task: "5111101000006 and 2040001999902" })).rejects.toMatchObject({ error_code: "invalid_request", message: expect.stringMatching(/^Ambiguous /) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NFKC-normalises input and registered names for exact matching", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name_ver4_x4").replace("株式会社国税商事あ", "株式会社カタカナＡ")));
    const { output } = await execute({ company_name: "株式会社ｶﾀｶﾅA" });
    expect(output.registration_number).toBe("2040001999902");
    expect((fetchMock.mock.calls[0][0] as URL).searchParams.get("name")).toBe("株式会社カタカナＡ");
  });

  it.each([
    ["historical", '<latest>1</latest>', '<latest>0</latest>'],
    ["missing latest flag", '<latest>1</latest>', '<latest />'],
    ["closed", '<process>01</process>', '<process>21</process>'],
    ["deleted", '<process>01</process>', '<process>99</process>'],
    ["unknown status", '<process>01</process>', '<process>88</process>'],
  ])("refuses a single exact %s name record", async (_label, from, to) => {
    fetchMock.mockResolvedValue(new Response(fixture("name-single").replace(from, to)));
    await expect(execute({ company_name: "株式会社国税商事あ" })).rejects.toMatchObject({ error_code: "invalid_request", message: expect.stringMatching(/^Ambiguous /) });
  });

  it("resolves the open exact match alongside a closed record with the same name", async () => {
    const single = fixture("name-single");
    const closed = single.match(/<corporation>.*<\/corporation>/s)![0]
      .replace("2040001999902", "1040001999903").replace('<process>01</process>', '<process>21</process>');
    fetchMock.mockResolvedValue(new Response(single.replace('<count>1</count>', '<count>2</count>').replace('</corporations>', `${closed}</corporations>`)));
    expect((await execute({ company_name: "株式会社国税商事あ" })).output.registration_number).toBe("2040001999902");
  });

  it("refuses a seemingly unique exact match when count exceeds the received records", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name-single").replace('<count>1</count>', '<count>2</count>')));
    await expect(execute({ company_name: "株式会社国税商事あ" })).rejects.toMatchObject({ error_code: "invalid_request", message: expect.stringContaining("2040001999902") });
  });

  it.each(["<corporations><count>51</count><broken", "<corporations>" + "<corporation>".repeat(51)])("refuses more than 50 results before parsing malformed XML", async body => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(execute({ company_name: "国税商事" })).rejects.toMatchObject({ error_code: "invalid_request", message: "Ambiguous Japanese company name: too many companies match; provide the 13-digit corporate number." });
  });

  it.each([false, true])("caps raw XML at 1 MiB before DOM parsing (declared: %s)", async declared => {
    const body = fixture("num_0_ver4_x4") + " ".repeat(1024 * 1024);
    fetchMock.mockResolvedValue(new Response(body, declared ? { headers: { "Content-Length": String(new TextEncoder().encode(body).byteLength) } } : {}));
    await expect(execute({ corporate_number: "5111101000006" })).rejects.toMatchObject({ error_code: "execution_failed" });
  });

  it("allows the 50-record boundary through the transport", async () => {
    const single = fixture("name-single");
    const record = single.match(/<corporation>.*<\/corporation>/s)![0];
    fetchMock.mockResolvedValue(new Response(single.replace('<count>1</count>', '<count>50</count>').replace(record, record.repeat(50))));
    expect((await fetchNtaCorporations("国税商事", false)).records).toHaveLength(50);
  });

  it.each([["103", "more than the legal form"], ["180", "too many companies match"], ["102", "Check the input"]])("maps NTA 400 code %s to an actionable refusal", async (code, advice) => {
    fetchMock.mockResolvedValue(new Response(`${code},synthetic-test-id`, { status: 400 }));
    const error = await execute({ company_name: "株式会社" }).catch(e => e);
    expect(error).toMatchObject({ error_code: "invalid_request", isCapabilityRefusal: true });
    expect(error.message).toContain(advice);
    expect(error.message).not.toContain("synthetic-test-id");
    expect(isCapabilityRefusal(error.message)).toBe(true);
  });

  it.each([403, 429])("counts a shared-ID %s block and its cool-down as capability faults", async status => {
    fetchMock.mockResolvedValueOnce(new Response("restricted", { status }));
    const error = await execute({ corporate_number: "5111101000006" }).catch(e => e);
    expect(error).toBeInstanceOf(SourceBlockedError);
    for (const value of [error, error.message]) expect(isCapabilityRefusal(value)).toBe(false);
    expect(isUserInputError(error.message)).toBe(false);
    expect(classifyTransactionFailure(error.message)).toBe("upstream");
    expect(countsAgainstCapability(classifyTransactionFailure(error.message))).toBe(true);
    clock += 59_999;
    const cooling = await execute({ corporate_number: "5111101000006" }).catch(e => e);
    expect(cooling.error_code).toBe("capability_unavailable");
    expect(isUserInputError(cooling.message)).toBe(false);
    expect(countsAgainstCapability(classifyTransactionFailure(cooling.message))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock++;
    expect((await execute({ corporate_number: "5111101000006" })).output.registration_number).toBe("5111101000006");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([403, 429])("suppresses requests for 60 seconds after a shared-ID %s block", async status => {
    fetchMock.mockResolvedValueOnce(new Response("restricted", { status }));
    await execute({ corporate_number: "5111101000006" }).catch(() => undefined);
    await expect(execute({ corporate_number: "5111101000006" })).rejects.toMatchObject({ error_code: "capability_unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += 60_000;
    expect((await execute({ corporate_number: "5111101000006" })).output.status).toBe("active");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caps concurrent upstream requests at four until bodies finish, then releases capacity", async () => {
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    for (let i = 0; i < 4; i++) {
      fetchMock.mockImplementationOnce(async () => new Response(new ReadableStream<Uint8Array>({ start(controller) { controllers.push(controller); } })));
    }
    const pending = Array.from({ length: 4 }, () => execute({ corporate_number: "5111101000006" }));
    try {
      // A fifth call waits briefly for a slot, then is refused as a caller-
      // neutral rate limit: self-protection must not count as a source fault.
      await expect(execute({ corporate_number: "5111101000006" })).rejects.toMatchObject({
        error_code: "rate_limited", isCapabilityRefusal: true });
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      for (const controller of controllers) {
        controller.enqueue(new TextEncoder().encode(fixture("num_0_ver4_x4")));
        controller.close();
      }
      await Promise.all(pending);
    }
    fetchMock.mockResolvedValue(new Response(fixture("num_0_ver4_x4")));
    expect((await execute({ corporate_number: "5111101000006" })).output.status).toBe("active");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("hands a freed slot to a waiting call instead of refusing it", async () => {
    let release!: () => void;
    const controllers: ReadableStreamDefaultController<Uint8Array>[] = [];
    for (let i = 0; i < 4; i++) {
      fetchMock.mockImplementationOnce(async () => new Response(new ReadableStream<Uint8Array>({ start(c) { controllers.push(c); } })));
    }
    const pending = Array.from({ length: 4 }, () => execute({ corporate_number: "5111101000006" }));
    fetchMock.mockResolvedValue(new Response(fixture("num_0_ver4_x4")));
    const waiting = execute({ corporate_number: "5111101000006" });
    release = () => { for (const c of controllers) { c.enqueue(new TextEncoder().encode(fixture("num_0_ver4_x4"))); c.close(); } };
    setTimeout(release, 200);
    await Promise.all(pending);
    expect((await waiting).output.status).toBe("active");
  });

  it("refuses an over-size name search as ambiguous, and keeps NTA parameter errors counted", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x".repeat(1024 * 1024 + 1)));
    await expect(execute({ company_name: "ヤマダ" })).rejects.toMatchObject({ error_code: "invalid_request", isCapabilityRefusal: true, message: expect.stringMatching(/^Ambiguous /) });
    fetchMock.mockResolvedValueOnce(new Response('"180","too many"', { status: 400 }));
    await expect(execute({ company_name: "ヤマダ" })).rejects.toMatchObject({ message: expect.stringMatching(/^Ambiguous /) });
    fetchMock.mockResolvedValueOnce(new Response("071,応答形式", { status: 400 }));
    await expect(execute({ company_name: "ヤマダ" })).rejects.toMatchObject({ error_code: "execution_failed" });
  });

  it("recognises a hyphenated T-number", async () => {
    await execute({ corporate_number: "T5111-1010-00006" });
    expect((fetchMock.mock.calls[0][0] as URL).pathname).toBe("/4/num");
  });

  it("releases concurrency slots after transport and parse failures", async () => {
    for (let i = 0; i < 5; i++) {
      fetchMock.mockRejectedValueOnce(new Error("synthetic-test-id"));
      await expect(execute({ corporate_number: "5111101000006" })).rejects.toMatchObject({ error_code: "execution_failed" });
      fetchMock.mockResolvedValueOnce(new Response("<broken"));
      await expect(execute({ corporate_number: "5111101000006" })).rejects.toMatchObject({ error_code: "execution_failed" });
    }
    expect((await execute({ corporate_number: "5111101000006" })).output.status).toBe("active");
  });

  it("process 22 restores active status despite stale closure fields and permits an exact name match", async () => {
    const xml = fixture("name-single").replace('<process>01</process>', '<process>22</process>')
      .replace('<closeDate />', '<closeDate>2018-05-09</closeDate>').replace('<closeCause />', '<closeCause>01</closeCause>');
    fetchMock.mockResolvedValue(new Response(xml));
    const { output } = await execute({ company_name: "株式会社国税商事あ" });
    expect(output).toMatchObject({ status: "active", process_code: "22", close_date: "2018-05-09", close_reason_code: "01" });
    expect(normaliseRegistryOutput("japanese-company-data", output).status).toBe("active");
    const narrative = await getDirectExecutor("risk-narrative-generate")!({ check_results: { "japanese-company-data": output }, context: "kyb" });
    expect(narrative.output.flags).toEqual([]);
  });

  it("validates the official number checksum", () => {
    expect(validCorporateNumber("1180301018771")).toBe(true);
    expect(validCorporateNumber("2310001010007")).toBe(true);
    expect(validCorporateNumber("1180301018772")).toBe(false);
  });

  it("returns capability-unavailable with no request or fallback when the ID is unset", async () => {
    vi.stubEnv("NTA_HOUJIN_APP_ID", "");
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "capability_unavailable" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses a real fetch timeout signal and sanitises a timeout", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("request URL containing synthetic-test-id", "TimeoutError")), ms);
      return controller.signal;
    });
    fetchMock.mockImplementation((_url: URL, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
    }));
    try {
      const pending = expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "timeout_exceeded", message: "NTA request timed out. Retry later." });
      await vi.advanceTimersByTimeAsync(15_000);
      await pending;
      expect(timeout).toHaveBeenCalledWith(15_000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it.each([403, 429, 502, 503, 504])("does not retry NTA restrictions or failures (status %s) on customer rails", async status => {
    fetchMock.mockImplementation(async () => new Response("upstream error", { status }));
    await expect(executeWithTransientRetry(execute, { corporate_number: "1180301018771" }, { slug: "japanese-company-data", capabilityType: "stable_api" })).rejects.toBeInstanceOf(Error);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 429, 404, 500])("stops on HTTP %s and never leaks upstream HTML or the ID", async status => {
    fetchMock.mockResolvedValue(new Response("<html>synthetic-test-id</html>", { status }));
    const err = await execute({ corporate_number: "1180301018771" }).catch(e => e);
    expect(err.error_code).toBe(status === 404 ? "capability_unavailable" : status === 403 || status === 429 ? "rate_limited" : "execution_failed");
    expect(err.message).not.toMatch(/html|synthetic-test-id/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a body-cancellation failure without exposing its exception", async () => {
    const warning = vi.spyOn(log, "logWarn").mockImplementation(() => {});
    const body = new ReadableStream({ cancel: () => Promise.reject(new Error("synthetic-test-id")) });
    fetchMock.mockResolvedValue(new Response(body, { status: 429 }));
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "rate_limited" });
    expect(warning).toHaveBeenCalledWith("nta-response-cancel-failed", "NTA response cancellation failed.");
    expect(JSON.stringify(warning.mock.calls)).not.toContain("synthetic-test-id");
  });

  it.each([false, true])("bounds XML bytes and sanitises cancellation errors (declared limit: %s)", async declared => {
    const warning = vi.spyOn(log, "logError").mockImplementation(() => {});
    const body = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); },
      cancel: () => Promise.reject(new Error("synthetic-test-id")),
    });
    fetchMock.mockResolvedValue(new Response(body, declared ? { headers: { "Content-Length": String(1024 * 1024 + 1) } } : {}));
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "execution_failed" });
    expect(warning).toHaveBeenCalledWith(declared ? "image-limit-declared-cancel" : "image-limit-reader-cancel", expect.objectContaining({ message: "Response body cancellation failed." }), expect.objectContaining({ maxBytes: 1024 * 1024 }));
    expect(JSON.stringify(warning.mock.calls)).not.toContain("synthetic-test-id");
  });

  it.each(["<html><body>synthetic-test-id</body></html>", "<corporations>", '<!DOCTYPE corporations [<!ENTITY secret SYSTEM "file:///etc/passwd">]><corporations/>'])("rejects non-register or unsafe XML without echoing it", async body => {
    fetchMock.mockResolvedValue(new Response(body));
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "execution_failed", message: expect.not.stringContaining("synthetic-test-id") });
  });

  it("rejects a mismatching corporate number", async () => {
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "execution_failed" });
  });

  it.each(["01", "11", "12", "13", "22", "71", "72"])("maps non-closure process %s as active", process => {
    expect(mapNtaCorporation({ process }).status).toBe("active");
  });
  it.each(["01", "11", "31"])("maps closure reason %s as dissolved even after a name correction", closeCause => {
    const output = mapNtaCorporation({ process: "11", closeCause, closeDate: "2020-01-02" });
    expect(output.status).toBe("dissolved");
    expect(normaliseRegistryOutput("japanese-company-data", output).status).toBe("dissolved");
  });
  it.each(["21", "", "88"])("maps registrar/unspecified closure %s conservatively", closeCause => {
    const output = mapNtaCorporation({ process: "21", closeCause });
    expect(output.status).toBe("closed");
    expect(normaliseRegistryOutput("japanese-company-data", output).status).toBe("inactive");
  });
  it.each(["81", "99"])("maps deletion process %s as inactive without claiming dissolution", process => {
    expect(mapNtaCorporation({ process }).status).toBe("inactive");
  });
  it("preserves unknown process status and image-only missing fields", () => {
    expect(mapNtaCorporation({ process: "88", kind: "999" })).toMatchObject({ status: "unknown", company_name: null, business_type: null });
  });
  it("keeps input refusals out of capability health failures", async () => {
    const err = await execute({ company_name: "日" }).catch(e => e);
    expect(isCapabilityRefusal(err)).toBe(true);
  });
  it("gates only declared mandatory credentials and uses stable-API error metadata", () => {
    vi.stubEnv("NTA_HOUJIN_APP_ID", "");
    expect(hasMissingRequiredCredential("japanese-company-data")).toBe(true);
    expect(getUnconfiguredCapabilities().has("japanese-company-data")).toBe(true);
    expect(hasMissingRequiredCredential("dns-lookup")).toBe(false);
    expect(hasMissingRequiredCredential("sanctions-check")).toBe(false);
    vi.stubEnv("NTA_HOUJIN_APP_ID", "synthetic-test-id");
    expect(hasMissingRequiredCredential("japanese-company-data")).toBe(false);
    expect(getErrorCodes("japanese-company-data").distinguishableErrors).not.toContain("scraping_blocked");
  });

  it("registers a static unauthenticated health probe and removes old dependencies", () => {
    const provider = PROVIDERS.find(p => p.name === "nta-houjin")!;
    expect(provider).toMatchObject({ envVar: "NTA_HOUJIN_APP_ID", tier: "free", capabilities: ["japanese-company-data"], healthProbe: { path: "/", method: "GET", skipAuth: true } });
    for (const name of ["browserless", "anthropic"]) {
      const old = PROVIDERS.find(p => p.name === name)!;
      expect([...(old.capabilities ?? []), ...(old.fallbackCapabilities ?? [])]).not.toContain("japanese-company-data");
    }
  });
});
