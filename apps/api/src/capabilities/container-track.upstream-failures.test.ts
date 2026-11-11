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

describe("container-track: a failed tracking leg throws (row 34)", () => {
  it.each([
    ["HTTP 503", () => new Error("URL returned HTTP 503. The site is temporarily unavailable."), true],
    ["HTTP 429", () => new Error("URL returned HTTP 429. The site is rate limiting requests."), true],
    ["network error", () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }), true],
    ["timeout", () => new DOMException("The operation was aborted due to timeout", "TimeoutError"), true],
    ["HTTP 404 (the page is gone)", () => new Error("URL returned HTTP 404. Page not found."), false],
  ])("throws, unbilled, when the carrier page read fails with %s", async (_label, makeError, retryable) => {
    fetchRenderedHtml.mockRejectedValue(makeError());
    const err = await expectUnbilledUpstreamFailure(exec()(MSC));
    expect(err.message).toContain("carrier tracking page www.msc.com");
    expect(err.retryable).toBe(retryable);
    expect(extractJsonWithLlm).not.toHaveBeenCalled();
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
