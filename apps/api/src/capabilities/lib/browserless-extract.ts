import { createAnthropicClient } from "../../lib/anthropic-client.js";
import { MODELS } from "../../lib/models.js";
import type Anthropic from "@anthropic-ai/sdk";
import { CapabilityRefusalError } from "../../lib/capability-refusal.js";
import { messageText } from "../../lib/llm-response.js";

/**
 * Shared Browserless scraping + Claude extraction utility for company registries.
 * Used by country-specific executors that don't have free JSON APIs.
 *
 * fetchRenderedHtml and getBrowserlessConfig are re-exported from web-provider.ts
 * which adds retry, caching, and resilience. All 47+ consumers get the upgrade
 * without changing their imports.
 *
 * F-0-006: web-provider.ts validates the URL at the top of fetchPage (and
 * runs plain fetches through safeFetch), so every caller of this file
 * inherits SSRF protection automatically. No call site here needs to
 * call validateUrl explicitly.
 */

export {
  fetchRenderedHtml,
  fetchRenderedHtmlFresh,
  fetchCompanyPage,
  fetchPage,
  getBrowserlessConfig,
} from "./web-provider.js";
export type { WebProviderOptions, WebProviderResult } from "./web-provider.js";

/** Most markup worth inspecting before the LLM context is already full. */
export const HTML_TO_TEXT_INPUT_LIMIT = 2 * 1024 * 1024;
export const HTML_TO_TEXT_OUTPUT_LIMIT = 15_000;
const HTML_TO_TEXT_OUTPUT_MARGIN = 32;

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "tr",
  "td",
  "th",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "dt",
  "dd",
  "section",
  "br",
]);

/** Return the first `>` outside an attribute quote, visiting each code unit once. */
function findTagEnd(html: string, start: number): number {
  let quote = "";
  for (let i = start; i < html.length; i += 1) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i;
    }
  }
  return -1;
}

function tagName(tag: string): string {
  let start = 1;
  if (tag[start] === "/") start += 1;
  while (
    tag[start] === " " ||
    tag[start] === "\t" ||
    tag[start] === "\n" ||
    tag[start] === "\r"
  ) {
    start += 1;
  }

  let end = start;
  while (end < tag.length) {
    const code = tag.charCodeAt(end);
    const isNameCharacter =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);
    if (!isNameCharacter) break;
    end += 1;
  }
  return tag.slice(start, end).toLowerCase();
}

function findCloseTagStart(
  html: string,
  name: "script" | "style",
  start: number
): number {
  const closePattern = name === "script" ? /<\/script/gi : /<\/style/gi;
  closePattern.lastIndex = start;
  for (
    let match = closePattern.exec(html);
    match;
    match = closePattern.exec(html)
  ) {
    const boundary = html[match.index + match[0].length];
    if (
      boundary === ">" ||
      boundary === " " ||
      boundary === "\t" ||
      boundary === "\n" ||
      boundary === "\r"
    ) {
      return match.index;
    }
  }
  return -1;
}

function isJavaScriptWhitespace(char: string): boolean {
  const code = char.charCodeAt(0);
  return (
    code === 0x0009 ||
    code === 0x000b ||
    code === 0x000c ||
    code === 0x000d ||
    code === 0x0020 ||
    code === 0x00a0 ||
    code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x202f ||
    code === 0x205f ||
    code === 0x3000 ||
    code === 0xfeff
  );
}

/** Strip HTML to bounded plain text for LLM extraction in O(n) time. */
export function htmlToText(html: string): string {
  const input = html.slice(0, HTML_TO_TEXT_INPUT_LIMIT);
  const output: string[] = [];
  let outputLength = 0;
  let position = 0;
  let pendingSpaceBeforeNewline = false;
  let pendingAfterNewline: string[] = [];
  let pendingAfterNewlineLength = 0;
  let pendingNewlines = 0;

  const flushWhitespace = () => {
    if (pendingNewlines > 0) {
      if (pendingNewlines === 1 && pendingSpaceBeforeNewline) {
        output.push(" ");
        outputLength += 1;
      }
      output.push("\n");
      outputLength += 1;
      if (pendingAfterNewlineLength > 0) {
        output.push(...pendingAfterNewline);
        outputLength += pendingAfterNewlineLength;
      }
    } else if (pendingSpaceBeforeNewline) {
      output.push(" ");
      outputLength += 1;
    }
    pendingSpaceBeforeNewline = false;
    pendingAfterNewline = [];
    pendingAfterNewlineLength = 0;
    pendingNewlines = 0;
  };

  const emit = (value: string) => {
    if (value === "\n") {
      pendingNewlines += 1;
      pendingAfterNewline = [];
      pendingAfterNewlineLength = 0;
      return;
    }
    if (value === " " || value === "\t" || value === "\u00a0") {
      if (pendingNewlines > 0) {
        if (pendingAfterNewline.at(-1) !== " ") {
          pendingAfterNewline.push(" ");
          pendingAfterNewlineLength += 1;
        }
      } else {
        pendingSpaceBeforeNewline = true;
      }
      return;
    }
    if (pendingNewlines > 0 && isJavaScriptWhitespace(value)) {
      if (
        pendingAfterNewlineLength <
        HTML_TO_TEXT_OUTPUT_LIMIT + HTML_TO_TEXT_OUTPUT_MARGIN
      ) {
        pendingAfterNewline.push(value);
        pendingAfterNewlineLength += value.length;
      }
      return;
    }
    flushWhitespace();
    output.push(value);
    outputLength += value.length;
  };

  while (
    position < input.length &&
    outputLength < HTML_TO_TEXT_OUTPUT_LIMIT + HTML_TO_TEXT_OUTPUT_MARGIN
  ) {
    if (input[position] === "<") {
      const end = findTagEnd(input, position + 1);
      if (end === -1) break;

      const name = tagName(input.slice(position, end + 1));
      if (name === "script" || name === "style") {
        const closePrefix = `</${name}`;
        const closeStart = findCloseTagStart(input, name, end + 1);
        if (closeStart === -1) break;
        const closeEnd = findTagEnd(input, closeStart + closePrefix.length);
        if (closeEnd === -1) break;
        position = closeEnd + 1;
        continue;
      }

      emit(BLOCK_TAGS.has(name) ? "\n" : " ");
      position = end + 1;
      continue;
    }

    if (input.startsWith("&amp;", position)) {
      emit("&");
      position += 5;
    } else if (input.startsWith("&lt;", position)) {
      emit("<");
      position += 4;
    } else if (input.startsWith("&gt;", position)) {
      emit(">");
      position += 4;
    } else if (input.startsWith("&nbsp;", position)) {
      emit(" ");
      position += 6;
    } else {
      emit(input[position]);
      position += 1;
    }
  }

  flushWhitespace();
  return output.join("").trim().slice(0, HTML_TO_TEXT_OUTPUT_LIMIT);
}

/** Use Claude Haiku to extract structured company data from registry page text. */
export async function extractCompanyFromText(
  text: string,
  country: string,
  searchTerm: string
): Promise<Record<string, unknown>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });
  const response = await client.messages.create({
    model: MODELS.capability_default.id,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `Extract structured company data from this ${country} company registry page. The search was for: "${searchTerm}".

Return ONLY valid JSON with these fields (use null for missing data):
{
  "company_name": "string",
  "registration_number": "string",
  "business_type": "string (e.g. Ltd, GmbH, SA, BV)",
  "address": "string",
  "registration_date": "string or null",
  "status": "active|inactive|dissolved|unknown",
  "industry": "string or null",
  "directors": "string or null"
}

Registry page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const content = messageText(response);
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(
      `Could not extract company data for "${searchTerm}" from ${country} registry.`
    );
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    throw new Error(
      `Failed to parse extracted company data for "${searchTerm}".`
    );
  }
}

/** Extract company name from natural language using Claude Haiku. */
export async function extractCompanyName(
  naturalLanguage: string,
  country: string
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });
  const response = await client.messages.create({
    model: MODELS.capability_default.id,
    max_tokens: 100,
    messages: [
      {
        role: "user",
        content:
          `Extract the ${country} company name from this request. ` +
          `Return ONLY the company name, nothing else. ` +
          `If the request does not name a specific company, return exactly ${NO_NAME_SENTINEL}.` +
          `\n\nRequest: "${naturalLanguage}"`,
      },
    ],
  });

  const name = messageText(response)
    .trim()
    .replace(/^["']|["']$/g, "");

  if (!name || name === NO_NAME_SENTINEL || looksLikeRefusal(name)) {
    throw new CapabilityRefusalError(
      `Could not identify a specific ${country} company name in the request. ` +
        `Provide the company's registration number, or a more specific company name.`
    );
  }
  return name;
}

/** Sentinel the model is asked to return when the request names no company. */
const NO_NAME_SENTINEL = "NONE";

/**
 * Does this look like prose rather than a company name?
 *
 * The prompt asks for a bare name, but the model sometimes declines in a
 * sentence instead — "I cannot extract a Canadian company name from this
 * request. 'Bank' is too generic…". Nothing used to catch that, so the refusal
 * became the search query and surfaced to the caller quoted inside another
 * error: `No Canadian company found matching "I cannot extract a…"`. That reads
 * as a malfunction, leaks that an LLM is in the path, and tells the caller
 * nothing about what to send instead.
 *
 * The sentinel handles the cooperative case; this is the backstop for when the
 * model ignores it. Deliberately conservative — real names are short and rarely
 * open with these phrases, and a false positive only costs a clear error where
 * the lookup would have failed anyway.
 */
function looksLikeRefusal(text: string): boolean {
  if (text.length > 120) return true;
  return /^(i cannot|i can't|i am unable|i'm unable|sorry|unfortunately|there is no|no specific|the request)/i.test(
    text
  );
}
