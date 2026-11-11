/**
 * Swallowed-upstream-failure fix, wave 2a: container-track (audit row 34;
 * archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md).
 *
 * When the carrier's tracking page could not be read, the tool fell back to
 * the check-digit fields with `status: "tracking_unavailable"`, billed as a
 * tracking answer. A failed tracking leg now throws, unbilled. The two answers
 * that are not failures keep their output: a carrier Strale does not read live
 * (no leg attempted, and the note says so) and a page that says the container
 * is unknown (`status: "not_found"`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchRenderedHtml, extractJsonWithLlm } = vi.hoisted(() => ({
  fetchRenderedHtml: vi.fn(),
  extractJsonWithLlm: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchRenderedHtml,
}));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm }));

import { getDirectExecutor } from "./index.js";
import { outcomeFromError, assertBillableOutput } from "../lib/execution-outcome.js";
import { SourceBlockedError } from "../lib/site-access.js";
import { inputRefusal } from "../lib/capability-refusal.js";
import "./container-track.js";

const exec = () => getDirectExecutor("container-track")!;
const MSC = { container_number: "MSCU1234565", carrier: "MSC" };
const PAGE = `<html><body><p>${"Container status Loaded on vessel. ".repeat(20)}</p></body></html>`;

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean }> {
  const err = await promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e,
  );
  expect((err as Error).name).toBe("UpstreamUnavailableError");
  expect((err as Error).message).not.toMatch(/not found|invalid|missing|required/i);
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err as Error & { retryable?: boolean };
}

beforeEach(() => {
  fetchRenderedHtml.mockReset();
  extractJsonWithLlm.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key-not-real");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

// The error shapes `fetchRenderedHtml` (lib/web-provider.ts) actually throws.
// Every transport failure of the plain request falls through to Browserless,
// so a bare "fetch failed" or timeout is the request to Browserless.
const CARRIER_FAILURES: Array<[string, () => Error, boolean, string | null]> = [
  ["a plain-request 400", () => new Error("URL returned HTTP 400. The web page (www.msc.com) could not be loaded (HTTP 400)."), true, "HTTP 400"],
  ["a plain-request 404 (the page is gone)", () => new Error("URL returned HTTP 404. This page does not exist (HTTP 404) (www.msc.com). The server is reachable, but this specific URL returned 'not found'."), false, "HTTP 404"],
  ["a 404 relayed through Browserless (the page is gone)", () => new Error("This page does not exist (HTTP 404) (www.msc.com). The server is reachable, but this specific URL returned 'not found'. Check the path, or try the site's homepage."), false, "HTTP 404"],
  ["a 410 relayed through Browserless (the page is gone)", () => new Error("This page has been permanently removed (HTTP 410) (www.msc.com). The URL is gone and will not return."), false, "HTTP 410"],
  ["a refused connection", () => new Error("Could not reach www.msc.com (or a site it redirects to): the connection was refused. Check the URL and try again."), true, "unreachable"],
  ["a page that took too long to load (Browserless 408)", () => new Error("The web page (www.msc.com) took too long to load. The target site is slow or heavy; try again, or try a simpler page on the same site."), true, "HTTP 408"],
  ["a permanent navigation failure", () => new Error("The target site (www.msc.com)'s TLS certificate is invalid. This is a permanent failure — retrying will not help."), false, "navigation"],
];

const RENDERING_FAILURES: Array<[string, () => Error, boolean, string | null]> = [
  ["a network error reaching Browserless", () => Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }) }), true, "ECONNRESET"],
  ["a timeout on the Browserless request", () => new DOMException("The operation was aborted due to timeout", "TimeoutError"), true, "timeout"],
  ["Browserless's own 5xx", () => new Error("The target site (www.msc.com) returned a server error (HTTP 503). This is usually transient — try again in a few minutes."), true, "HTTP 503"],
  ["Browserless's rate limit", () => new Error("The web scraping service is temporarily rate-limited. Please try again in a few minutes."), true, "HTTP 429"],
  ["an empty render", () => new Error("Browserless returned empty or too-short HTML response."), true, "empty"],
  ["an exhausted Browserless account", () => Object.assign(new Error("Vendor 'browserless' is exhausted; the request was refused before spending or charging."), { name: "VendorUnavailableError", providerName: "browserless", vendorStatus: "exhausted" }), false, "vendor exhausted"],
];

describe("container-track: a failed tracking leg throws (row 34)", () => {
  it.each(CARRIER_FAILURES)("throws, unbilled, naming the carrier, on %s", async (_label, makeError, retryable, code) => {
    fetchRenderedHtml.mockRejectedValue(makeError());
    const err = await expectUnbilledUpstreamFailure(exec()(MSC));
    expect(err.message).toContain("carrier tracking page www.msc.com");
    expect(err.retryable).toBe(retryable);
    expect((err as { code?: unknown }).code).toBe(code);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it.each(RENDERING_FAILURES)("throws, unbilled, naming the rendering service and not the carrier, on %s", async (_label, makeError, retryable, code) => {
    fetchRenderedHtml.mockRejectedValue(makeError());
    const err = await expectUnbilledUpstreamFailure(exec()(MSC));
    expect(err.message).toContain("rendering service (Browserless)");
    expect(err.message).not.toContain("carrier tracking page");
    expect(err.retryable).toBe(retryable);
    expect((err as { code?: unknown }).code).toBe(code);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("returns Strale's own missing Browserless configuration unchanged, never filed as an outage", async () => {
    const config = new Error("BROWSERLESS_URL and BROWSERLESS_API_KEY are required.");
    fetchRenderedHtml.mockRejectedValue(config);
    const err = await exec()(MSC).catch((e: unknown) => e);
    expect(err).toBe(config);
    expect((err as Error).name).not.toBe("UpstreamUnavailableError");
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  });

  it("passes a refusal through unchanged (unbilled, not counted against the capability)", async () => {
    const refusal = inputRefusal("'url' must be a page whose HTML is 16.0MB or less.", "url", "Choose a smaller page.");
    fetchRenderedHtml.mockRejectedValue(refusal);
    const err = await exec()(MSC).catch((e: unknown) => e);
    expect(err).toBe(refusal);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, counts_against_capability: false });
  });

  it("returns an unrecognised error unchanged rather than blaming the carrier", async () => {
    const defect = new RangeError("Maximum call stack size exceeded");
    fetchRenderedHtml.mockRejectedValue(defect);
    const err = await exec()(MSC).catch((e: unknown) => e);
    expect(err).toBe(defect);
  });

  it("throws, unbilled, when the carrier page is an error, maintenance or consent page (page_error)", async () => {
    fetchRenderedHtml.mockResolvedValue(PAGE);
    extractJsonWithLlm.mockResolvedValue({
      status: "page_error", vessel_name: null, voyage_number: null, origin_port: null, destination_port: null,
      eta: null, last_location: null, events: [], note: "The tracking service is under maintenance",
    });
    const err = await expectUnbilledUpstreamFailure(exec()(MSC));
    expect(err.message).toContain("carrier tracking page www.msc.com");
    expect(err.retryable).toBe(true);
    expect((err as { code?: unknown }).code).toBe("page_error");
  });

  it("tells the model to separate a page with no tracking result from a carrier with no record", async () => {
    fetchRenderedHtml.mockResolvedValue(PAGE);
    extractJsonWithLlm.mockResolvedValue({ status: "In Transit", events: [] });
    await exec()(MSC);
    const prompt = String((extractJsonWithLlm.mock.calls[0][0] as { prompt: string }).prompt);
    expect(prompt).toContain('"status": "page_error"');
    expect(prompt).toMatch(/error page, a maintenance page, a cookie or consent wall, a login wall/);
    expect(prompt).toMatch(/says it has no record of this container[\s\S]*"status": "not_found"/);
  });

  it("throws, unbilled, when the page renders without readable tracking content", async () => {
    fetchRenderedHtml.mockResolvedValue("<html><body>Loading…</body></html>");
    const err = await expectUnbilledUpstreamFailure(exec()(MSC));
    expect(err.message).toContain("without readable tracking content");
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
  });

  it("passes a carrier's refusal through as the source block it is (unbilled)", async () => {
    fetchRenderedHtml.mockRejectedValue(
      new SourceBlockedError("Source unavailable to Strale: carrier refuses automated access (HTTP 403).", { kind: "http", status: 403 }),
    );
    const err = await exec()(MSC).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SourceBlockedError);
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  });

  it("fails the call, unbilled, when the extraction step fails instead of answering without tracking", async () => {
    fetchRenderedHtml.mockResolvedValue(PAGE);
    extractJsonWithLlm.mockRejectedValue(new Error("Failed to parse container tracking data."));
    const err = await exec()(MSC).catch((e: unknown) => e);
    expect((err as Error).message).toBe("Failed to parse container tracking data.");
    expect(outcomeFromError(err)).toMatchObject({ billable: false });
  });
});

describe("container-track: answers that are not failures keep their output (row 34)", () => {
  it("keeps the not-found answer read from the carrier page", async () => {
    fetchRenderedHtml.mockResolvedValue(PAGE);
    const notFound = {
      status: "not_found", vessel_name: null, voyage_number: null, origin_port: null, destination_port: null,
      eta: null, last_location: null, events: [], note: "No results for this container",
    };
    extractJsonWithLlm.mockResolvedValue(notFound);
    const r = await exec()(MSC);
    expect(r.output).toMatchObject({ container_number: "MSCU1234565", valid_format: true, ...notFound });
    expect(r.provenance.source).toBe("carrier-website");
    expect(() => assertBillableOutput("container-track", r.output)).not.toThrow();
  });

  it("keeps the check-digit answer for a carrier Strale does not read live, with its note", async () => {
    const r = await exec()({ container_number: "MAEU1234565", carrier: "Maersk" });
    expect(fetchRenderedHtml).not.toHaveBeenCalled();
    expect(r.output.status).toBe("tracking_unavailable");
    expect(String(r.output.note)).toMatch(/^Strale reads live tracking only for /);
    expect(r.provenance.source).toBe("algorithmic");
  });
});
