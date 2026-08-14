/**
 * Regression tests for the 2026-08-14 fence-parse class, applied across the
 * capabilities that shared company-enrich's fragile parser.
 *
 * The bug: `.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "")`
 * strips the closing fence only when it is last in the string. A model that
 * appends a note after the fence — which is what it does when it extracted
 * nothing — leaves both fence and prose in the text handed to JSON.parse, and
 * the call 500s. company-enrich hit this in production on openai.com; six
 * siblings carried the identical code.
 *
 * Two layers are pinned here:
 *
 * 1. A source guard over the whole capabilities directory, so the pattern
 *    cannot reappear in a new executor. It fails against the un-applied fix
 *    for all five swapped files at once.
 * 2. Behavioural tests through the real executors, for the three capabilities
 *    that reach the parse step without any network call. web-extract and
 *    annual-report-extract both fetch through Browserless before parsing, so
 *    they are covered by the source guard plus lib/llm-json.test.ts rather
 *    than by a mocked round trip.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./pii-redact.js";
import "./pdf-extract.js";
import "./invoice-extract.js";

/** The exact strip the incident traced to. */
const ANCHORED_FENCE_STRIP = /replace\(\/\\?\^```/;

describe("source guard — the anchored fence strip is gone", () => {
  const dir = join(import.meta.dirname, ".");
  const files = readdirSync(dir).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );

  // llm-output-validate is the one legitimate holdout: its strip is step one
  // of a six-step *string* repair chain (trailing commas, unquoted keys,
  // Python literals), not an extract-and-parse. It never throws on failure —
  // reporting invalid JSON is its product — and it now falls back to the
  // balanced scanner when the whole chain fails.
  const ALLOWED = new Set(["llm-output-validate.ts"]);

  it("finds no capability still stripping fences with an anchored regex", () => {
    const offenders = files.filter(
      (f) =>
        !ALLOWED.has(f) && ANCHORED_FENCE_STRIP.test(readFileSync(join(dir, f), "utf8")),
    );

    expect(offenders).toEqual([]);
  });

  it("covers a directory large enough to be the real one", () => {
    // Guards against the glob silently matching nothing and the test above
    // passing vacuously.
    expect(files.length).toBeGreaterThan(100);
  });

  it("confirms the five swapped executors call the shared extractor", () => {
    const swapped = [
      "web-extract.ts",
      "pii-redact.ts",
      "pdf-extract.ts",
      "invoice-extract.ts",
      "annual-report-extract.ts",
    ];

    for (const f of swapped) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, `${f} should import the shared extractor`).toContain(
        'from "./lib/llm-json.js"',
      );
      expect(src, `${f} should call extractJsonObject`).toContain("extractJsonObject(");
      expect(src, `${f} should guard empty extractions`).toContain("isEmptyExtraction(");
    }
  });
});

/** Build an Anthropic response whose text is `text`. */
function reply(text: string) {
  return { content: [{ type: "text", text }] };
}

/** The production shape: valid fenced JSON followed by an explanatory note. */
function withTrailingNote(body: string): string {
  return ["```json", body, "```", "", "Note: some fields were not present."].join("\n");
}

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk";

describe("executors tolerate a note after the closing fence", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => vi.clearAllMocks());

  it("pii-redact returns the redaction instead of throwing", async () => {
    messagesCreate.mockResolvedValue(
      reply(
        withTrailingNote(
          '{"redacted_text":"Call [REDACTED_PHONE]","entities":[{"type":"PHONE"}],"entity_counts":{"PHONE":1}}',
        ),
      ),
    );

    const result = await getDirectExecutor("pii-redact")!({ text: "Call 555-0100" });
    expect((result.output as Record<string, unknown>).redacted_text).toBe(
      "Call [REDACTED_PHONE]",
    );
  });

  it("pdf-extract returns the extraction instead of throwing", async () => {
    messagesCreate.mockResolvedValue(reply(withTrailingNote('{"title":"Q3 Report"}')));

    const result = await getDirectExecutor("pdf-extract")!({ base64: PNG_B64 });
    expect((result.output as { data: Record<string, unknown> }).data.title).toBe(
      "Q3 Report",
    );
  });

  it("invoice-extract returns the extraction instead of throwing", async () => {
    messagesCreate.mockResolvedValue(
      reply(withTrailingNote('{"vendor":"Acme AB","total":1250,"currency":"SEK"}')),
    );

    const result = await getDirectExecutor("invoice-extract")!({ base64: PNG_B64 });
    expect((result.output as Record<string, unknown>).vendor).toBe("Acme AB");
  });
});

describe("executors refuse to bill for an empty extraction", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => vi.clearAllMocks());

  it("pii-redact throws rather than returning blank redacted text", async () => {
    messagesCreate.mockResolvedValue(
      reply('{"redacted_text":null,"entities":[],"entity_counts":{}}'),
    );

    await expect(
      getDirectExecutor("pii-redact")!({ text: "Call 555-0100" }),
    ).rejects.toThrow(/not redacted|empty result/i);
  });

  it("pdf-extract throws rather than returning an empty data object", async () => {
    messagesCreate.mockResolvedValue(reply('{"title":null,"body":""}'));

    await expect(
      getDirectExecutor("pdf-extract")!({ base64: PNG_B64 }),
    ).rejects.toThrow(/No data could be extracted/i);
  });

  it("invoice-extract throws rather than returning an all-null invoice", async () => {
    messagesCreate.mockResolvedValue(
      reply('{"vendor":null,"total":null,"currency":null,"line_items":[]}'),
    );

    await expect(
      getDirectExecutor("invoice-extract")!({ base64: PNG_B64 }),
    ).rejects.toThrow(/No invoice data could be extracted/i);
  });

  it("still returns a zero total, which is data rather than absence", async () => {
    messagesCreate.mockResolvedValue(
      reply('{"vendor":null,"total":0,"currency":null}'),
    );

    const result = await getDirectExecutor("invoice-extract")!({ base64: PNG_B64 });
    expect((result.output as Record<string, unknown>).total).toBe(0);
  });
});
