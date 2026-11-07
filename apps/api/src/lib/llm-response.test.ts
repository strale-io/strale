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
      messageText({ content: [], stop_reason: "refusal" as never, stop_details: { type: "refusal", category: "cyber" } });
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
    expect(() => messageText({ content: [], stop_reason: "refusal" as never, stop_details: null })).toThrow(
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

  it("every file that calls messages.create( reads text by block type", () => {
    const files = [...sourceFiles(join(apiRoot, "src")), ...sourceFiles(join(apiRoot, "scripts"))]
      .filter((path) => readFileSync(path, "utf8").includes("messages.create("));
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((path) => /\.content\[0\]/.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(apiRoot, path))).toEqual([]);
  });
});
