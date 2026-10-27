import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeWithTransientRetry } from "../lib/retry.js";
import * as log from "../lib/log.js";
import { getDirectExecutor } from "./index.js";
import { mapNtaCorporation, validCorporateNumber } from "../lib/nta-corporate.js";
import { normaliseRegistryOutput } from "../lib/company-status/normalise.js";
import { getErrorCodes } from "../data/error-codes.js";
import { getUnconfiguredCapabilities } from "../lib/credential-health.js";
import { PROVIDERS, hasMissingRequiredCredential } from "../lib/dependency-manifest.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import "./risk-narrative-generate.js";
import "./japanese-company-data.js";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/nta-corporate/${name}.xml`, import.meta.url), "utf8");
const execute = (input: Record<string, unknown>) => getDirectExecutor("japanese-company-data")!(input);
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
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
    expect(options.headers).toMatchObject({ "User-Agent": "Strale/1.0 (+https://strale.dev)" });
    expect(options.redirect).toBe("error");
    expect(JSON.stringify({ output, provenance })).not.toContain("synthetic-test-id");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["company_name", "corporate_number", "task"])("accepts literal Japanese name input in %s and requests closed records too", async field => {
    fetchMock.mockResolvedValue(new Response(fixture("name-single")));
    const { output } = await execute({ [field]: "国税商事" });
    expect(output.company_name).toBe("株式会社国税商事あ");
    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.pathname).toBe("/4/name");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ name: "国税商事", type: "12", target: "2", mode: "2", change: "0", close: "1" });
  });

  it("uses the registered English-name target without full-width conversion", async () => {
    fetchMock.mockResolvedValue(new Response(fixture("name-single")));
    await execute({ company_name: "TOYOTA MOTOR CORPORATION" });
    expect(Object.fromEntries((fetchMock.mock.calls[0][0] as URL).searchParams)).toMatchObject({ target: "3", name: "TOYOTA MOTOR CORPORATION" });
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
    fetchMock.mockResolvedValue(new Response(body, declared ? { headers: { "Content-Length": String(8 * 1024 * 1024 + 1) } } : {}));
    await expect(execute({ corporate_number: "1180301018771" })).rejects.toMatchObject({ error_code: "execution_failed" });
    expect(warning).toHaveBeenCalledWith(declared ? "image-limit-declared-cancel" : "image-limit-reader-cancel", expect.objectContaining({ message: "Response body cancellation failed." }), expect.objectContaining({ maxBytes: 8 * 1024 * 1024 }));
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
