import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { MODEL_DECLINED_PREFIX, messageText } from "./llm-response.js";
import { isCapabilityRefusal, isRefusalMessage } from "./capability-refusal.js";
import { CALLER_ATTRIBUTABLE, classifyTransactionFailure } from "./transaction-failure-taxonomy.js";
import { isUserInputError } from "./circuit-breaker.js";

type Content = Parameters<typeof messageText>[0]["content"];
const text = (t: string) => ({ type: "text", text: t, citations: null }) as Content[number];
const thinking = { type: "thinking", thinking: "", signature: "sig" } as Content[number];

describe("messageText", () => {
  it("returns the answer of a one-block response unchanged (today's models)", () => {
    expect(messageText({ content: [text('{"a":1}')], stop_reason: "end_turn" })).toBe('{"a":1}');
  });

  it("skips thinking blocks that open the response (newer models think by default)", () => {
    // Read positionally, this response yields "" and every JSON parse after it fails.
    expect(messageText({ content: [thinking, text('{"a":1}')], stop_reason: "end_turn" })).toBe('{"a":1}');
  });

  it("joins split text blocks and returns empty when there is no text", () => {
    expect(messageText({ content: [text("a"), thinking, text("b")], stop_reason: "end_turn" })).toBe("ab");
    expect(messageText({ content: [], stop_reason: "max_tokens" })).toBe("");
  });

  it("raises a safety decline as a refusal the platform does not count as its own defect", () => {
    let caught: unknown;
    try {
      messageText({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber" } });
    } catch (e) {
      caught = e;
    }
    expect(isCapabilityRefusal(caught)).toBe(true);
    const message = (caught as Error).message;
    expect(message.startsWith(`${MODEL_DECLINED_PREFIX} (cyber).`)).toBe(true);
    // Only the message survives on the async and x402 paths, so the text alone
    // must be recognised by all three consumers.
    expect(isRefusalMessage(message)).toBe(true);
    expect(CALLER_ATTRIBUTABLE.has(classifyTransactionFailure(message))).toBe(true);
    expect(isUserInputError(message)).toBe(true);
  });

  it("omits the category when the API gives none", () => {
    expect(() => messageText({ content: [], stop_reason: "refusal", stop_details: null })).toThrow(
      `${MODEL_DECLINED_PREFIX}. Rephrase`,
    );
  });
});

describe("no Claude caller reads the answer by position", () => {
  const apiRoot = resolve(import.meta.dirname, "../..");
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sourceFiles(path);
      return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
    });
  }

  // Any file that calls the Messages API or holds the SDK client. Positional
  // reads in any spelling: content[0], content.at(0), const [b] = x.content.
  const positional = /\.content(\[\s*0\s*\]|\.at\(\s*0\s*\))|\[\s*\w+\s*(,[^\]]*)?\]\s*=\s*\w+\.content\b/;

  it("the pattern catches every positional spelling", () => {
    for (const read of ["r.content[0].text", "r.content.at(0)", "const [first] = r.content;", "const [a, b] = res.content"]) {
      expect(positional.test(read), read).toBe(true);
    }
    expect(positional.test("messageText(r)")).toBe(false);
  });

  it("every file that uses the Anthropic SDK reads text by block type", () => {
    const files = [...sourceFiles(join(apiRoot, "src")), ...sourceFiles(join(apiRoot, "scripts"))].filter((path) => {
      const src = readFileSync(path, "utf8");
      return src.includes("messages.create(") || src.includes("createAnthropicClient") || src.includes("@anthropic-ai/sdk");
    });
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((path) => positional.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(apiRoot, path))).toEqual([]);
  });
});
