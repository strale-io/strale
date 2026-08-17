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
 *    annual-report-extract both render through Browserless first, so they are
 *    covered by the source guard plus lib/llm-json.test.ts rather than by a
 *    mocked round trip.
 *
 * The guards are not uniform, and that is the point: pii-redact checks its own
 * redacted_text, web-extract has no guard at all, and the rest use the generic
 * emptiness check. Each asymmetry is asserted below so it cannot be quietly
 * "corrected" into consistency.
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

// Matches any regex literal anchored to a leading fence — `/^```…` with or
// without leading whitespace tolerance. Deliberately broader than the exact
// text the incident traced to, so a reintroduction spelled slightly
// differently (prettier line break before the arg, `/^\s*```/`) still trips.
const ANCHORED_FENCE_STRIP = /\/\^(\\s\*)?```/;

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
    // web-extract and pii-redact were migrated again on 2026-08-17 (the
    // llm-extract.ts helper, see that module's docstring) onto
    // extractJsonWithLlm from "./lib/llm-extract.js" — which itself calls
    // extractJsonObject from lib/llm-json.js internally, so the balanced-
    // brace protection this test guards is still in force, just one level
    // of indirection further from these two files. pdf-extract,
    // invoice-extract, and annual-report-extract carry document/image
    // content blocks the helper's string-prompt signature doesn't fit, so
    // they still call extractJsonObject directly.
    const directCallers = ["pdf-extract.ts", "invoice-extract.ts", "annual-report-extract.ts"];
    for (const f of directCallers) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, `${f} should import the shared extractor`).toContain(
        'from "./lib/llm-json.js"',
      );
      expect(src, `${f} should call extractJsonObject`).toContain("extractJsonObject(");
    }

    const viaHelper = ["web-extract.ts", "pii-redact.ts"];
    for (const f of viaHelper) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, `${f} should import the shared LLM-extract helper`).toContain(
        'from "./lib/llm-extract.js"',
      );
      expect(src, `${f} should call extractJsonWithLlm`).toContain("extractJsonWithLlm(");
    }

    // The helper itself must still be the one calling the balanced-brace
    // scanner — this is what keeps the indirection honest.
    const helperSrc = readFileSync(join(dir, "lib", "llm-extract.ts"), "utf8");
    expect(helperSrc).toContain('from "./llm-json.js"');
    expect(helperSrc).toContain("extractJsonObject(");
  });

  it("guards empty extractions everywhere a bare shell would be billed", () => {
    // web-extract is intentionally absent: `extract` is a free-text ask, so
    // "not on this page" is an answer, and page_title still populates. It
    // carries a comment saying so — assert that, or the omission reads as an
    // oversight and someone will "fix" it.
    const guarded = ["pdf-extract.ts", "invoice-extract.ts", "annual-report-extract.ts"];
    for (const f of guarded) {
      expect(readFileSync(join(dir, f), "utf8"), f).toContain("isEmptyExtraction(");
    }

    // pii-redact guards its own field instead — the generic check cannot see
    // a blank redaction behind the prompt's zeroed entity_counts.
    const pii = readFileSync(join(dir, "pii-redact.ts"), "utf8");
    expect(pii).toContain("redacted_text");
    expect(pii).not.toContain("isEmptyExtraction(");

    expect(readFileSync(join(dir, "web-extract.ts"), "utf8")).toContain(
      "Deliberately no empty-extraction guard",
    );
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

  it("pii-redact throws on blank redacted text behind zeroed counts", async () => {
    // The realistic shape: REDACTION_PROMPT asks for all nine entity_counts
    // keys, so they are present and zero even when nothing was found. Zero is
    // information, so a generic emptiness check passes this — only a
    // redacted_text-specific guard catches it.
    messagesCreate.mockResolvedValue(
      reply(
        '{"redacted_text":null,"entities":[],"entity_counts":' +
          '{"PERSON_NAME":0,"EMAIL":0,"PHONE":0,"SSN":0,"ADDRESS":0,' +
          '"IBAN":0,"CREDIT_CARD":0,"PASSPORT":0,"ID_NUMBER":0}}',
      ),
    );

    await expect(
      getDirectExecutor("pii-redact")!({ text: "Call 555-0100" }),
    ).rejects.toThrow(/Redaction returned no text/i);
  });

  it("pii-redact still returns text that legitimately contained no PII", async () => {
    // The no-PII case must stay a success: redacted_text echoes the input.
    messagesCreate.mockResolvedValue(
      reply(
        '{"redacted_text":"The weather is fine.","entities":[],"entity_counts":' +
          '{"PERSON_NAME":0,"EMAIL":0,"PHONE":0,"SSN":0,"ADDRESS":0,' +
          '"IBAN":0,"CREDIT_CARD":0,"PASSPORT":0,"ID_NUMBER":0}}',
      ),
    );

    const result = await getDirectExecutor("pii-redact")!({
      text: "The weather is fine.",
    });
    expect((result.output as Record<string, unknown>).redacted_text).toBe(
      "The weather is fine.",
    );
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
