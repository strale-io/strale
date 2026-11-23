/**
 * url-to-text and bodies that are not text.
 *
 * On 2026-11-19 a paying account sent three PDF URLs. The tool decoded each
 * PDF as text, the NUL characters in it could not be stored, and the calls
 * failed on the database write ("Failed query: update transactions ...")
 * instead of being refused with a way forward. Nothing was charged.
 *
 * Every assertion here fails against the source before that fix: the PDF and
 * binary cases returned output, and the NUL case returned text containing
 * U+0000.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));

vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/url-validator.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/url-validator.js")>()),
  validateUrl: vi.fn().mockResolvedValue(undefined),
}));

import { getDirectExecutor } from "./index.js";
import { CapabilityRefusalError, isRefusalMessage } from "../lib/capability-refusal.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { classifyTransactionFailure } from "../lib/transaction-failure-taxonomy.js";
import "./url-to-text.js";

const run = (url = "https://example.test/doc") => getDirectExecutor("url-to-text")!({ url });

function respond(body: string | Uint8Array, contentType?: string): Response {
  return new Response(body, { status: 200, headers: contentType ? { "content-type": contentType } : {} });
}

/** The head of a real PDF: the magic, a binary comment, and a stream with NULs. */
const PDF_BYTES = new Uint8Array([
  ...new TextEncoder().encode("%PDF-1.7\n%"),
  0xe2, 0xe3, 0xcf, 0xd3, 0x0a,
  ...new TextEncoder().encode("1 0 obj\nstream\n"),
  ...new Array(64).fill(0),
  ...new TextEncoder().encode("\nendstream\n"),
]);

async function refusal(promise: Promise<unknown>): Promise<CapabilityRefusalError> {
  const error = await promise.then(
    () => { throw new Error("expected a refusal, got output"); },
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(CapabilityRefusalError);
  return error as CapabilityRefusalError;
}

describe("url-to-text: a body that is not text is refused, not stored", () => {
  beforeEach(() => safeFetchMock.mockReset());

  it("refuses a PDF by its content type and points at pdf-extract", async () => {
    safeFetchMock.mockResolvedValueOnce(respond(PDF_BYTES, "application/pdf"));
    const error = await refusal(run("https://example.test/paper.pdf"));
    expect(error.message).toBe(
      "'url' must be a web page or text document, not a PDF file. Use 'pdf-extract' to read a PDF.",
    );
    expect(error.details).toMatchObject({ field: "url" });
  });

  it.each([
    ["text/plain"],
    ["application/octet-stream"],
    [undefined],
  ])("refuses a PDF served as %s by its first bytes", async (contentType) => {
    safeFetchMock.mockResolvedValueOnce(respond(PDF_BYTES, contentType));
    const error = await refusal(run());
    expect(error.message).toContain("not a PDF file");
  });

  it.each([["image/png"], ["application/zip"], ["video/mp4"], ["application/vnd.ms-excel"]])(
    "refuses %s by its content type",
    async (contentType) => {
      safeFetchMock.mockResolvedValueOnce(respond(new Uint8Array(32), contentType));
      const error = await refusal(run());
      expect(error.message).toBe(`'url' must be a web page or text document; this URL returns ${contentType}.`);
    },
  );

  it("refuses a binary body that carries no telling content type", async () => {
    safeFetchMock.mockResolvedValueOnce(respond(new Uint8Array(4096), "application/octet-stream"));
    const error = await refusal(run());
    expect(error.message).toBe("'url' must be a web page or text document; this URL returns binary data.");
  });

  it("the refusals are recognised as the caller's, so they cannot open the breaker", async () => {
    for (const body of [respond(PDF_BYTES, "application/pdf"), respond(new Uint8Array(4096)), respond(new Uint8Array(8), "image/png")]) {
      safeFetchMock.mockResolvedValueOnce(body);
      const error = await refusal(run());
      expect(isRefusalMessage(error.message)).toBe(true);
      expect(isUserInputError(error.message)).toBe(true);
      expect(classifyTransactionFailure(error.message)).toBe("caller_input");
    }
  });

  it("removes a stray NUL from a real page instead of returning text the database cannot store", async () => {
    safeFetchMock.mockResolvedValueOnce(
      respond("<html><title>T\u0000itle</title><body><p>Hello\u0000 world</p></body></html>", "text/html"),
    );
    const { output } = (await run()) as { output: { text: string; title: string } };
    expect(JSON.stringify(output)).not.toContain("\\u0000");
    expect(output.text).toContain("Hello world");
    expect(output.title).toBe("Title");
  });

  it("removes a NUL or lone surrogate written as an HTML entity, which is decoded after the body check", async () => {
    safeFetchMock.mockResolvedValueOnce(
      respond('<html><title>a&#0;b</title><meta name="description" content="c&#0;d"><body><p>x&#0;y &#55357; z</p></body></html>', "text/html"),
    );
    const { output } = (await run()) as { output: { text: string; title: string; meta_description: string } };
    expect(JSON.stringify(output)).not.toMatch(/\u0000|\ud83d/i);
    expect(output.title).toBe("ab");
    expect(output.meta_description).toBe("cd");
    expect(output.text).toContain("xy");
  });

  it("keeps a real emoji written as a surrogate pair", async () => {
    safeFetchMock.mockResolvedValueOnce(respond("<html><body><p>ok \u{1F600}</p></body></html>", "text/html"));
    expect(((await run()) as { output: { text: string } }).output.text).toContain("\u{1F600}");
  });

  it.each([
    ["application/vnd.api+json"],
    ["application/vnd.github+json"],
    ["application/vnd.atom+xml"],
    ["image/svg+xml"],
  ])("still reads %s, which is text", async (contentType) => {
    safeFetchMock.mockResolvedValueOnce(respond('{"data":"readable"}', contentType));
    expect(((await run()) as { output: { text: string } }).output.text).toContain("readable");
  });

  it("still reads plain text and JSON served as octet-stream or without a type", async () => {
    safeFetchMock.mockResolvedValueOnce(respond("line one\nline two", "application/octet-stream"));
    expect(((await run()) as { output: { text: string } }).output.text).toContain("line one");
    safeFetchMock.mockResolvedValueOnce(respond('{"temperature": 4}', "application/json"));
    expect(((await run()) as { output: { text: string } }).output.text).toContain('"temperature"');
    safeFetchMock.mockResolvedValueOnce(respond("no type at all"));
    expect(((await run()) as { output: { text: string } }).output.text).toBe("no type at all");
  });
});
