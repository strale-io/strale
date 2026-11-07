/**
 * High-quality HTML → Markdown conversion using Readability.js + Turndown.
 * Synchronous and CPU-bound: production code runs it only inside the worker
 * (readability-worker.ts), through htmlToCleanMarkdown in readability-convert.ts.
 *
 * Readability extracts the main article content (strips nav, footer, ads, sidebars).
 * Turndown converts the cleaned HTML to well-formatted markdown.
 * Produces output quality comparable to Jina Reader and Firecrawl, at zero API cost.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";
import { prepareHtmlForParse } from "./html-parse-bound.js";

export interface MarkdownOptions {
  /** Keep [text](url) links; false keeps only their text. Default true. */
  includeLinks?: boolean;
  /** Keep ![alt](src) images; false drops them. Default true. */
  includeImages?: boolean;
}

/**
 * Strips links and images from the Markdown if asked. These regexes rescan
 * from every "[" to the end of the text, so 50,000 "[" cost about 1 s; they
 * run here, in the worker, under its time limit (second R1 review of #964).
 */
export function postProcessMarkdown(md: string, { includeLinks = true, includeImages = true }: MarkdownOptions = {}): string {
  let result = md;
  if (!includeLinks) result = result.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  if (!includeImages) result = result.replace(/!\[[^\]]*\]\([^)]+\)/g, "");
  return result;
}

export interface ReadabilityResult {
  markdown: string;
  title: string;
  usedReadability: boolean;
}

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
});

turndown.addRule("removeEmptyLinks", {
  filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
  replacement: () => "",
});

turndown.addRule("preserveCodeBlocks", {
  filter: (node) => node.nodeName === "PRE",
  replacement: (_content, node) => {
    const el = node as unknown as Element;
    const code = el.querySelector("code");
    const lang = code?.className?.match(/language-(\w+)/)?.[1] ?? "";
    const text = code?.textContent ?? el.textContent ?? "";
    return `\n\`\`\`${lang}\n${text.trim()}\n\`\`\`\n`;
  },
});

/**
 * Convert HTML to clean markdown using Readability + Turndown.
 *
 * The page is shaped before jsdom sees it (html-parse-bound.ts): depth,
 * attribute and element limits, so the recursive tree walks cannot overflow
 * the stack and the plainest bombs are refused cheaply. Those limits do not
 * bound the time; the worker's wall-clock limit does. A page over a limit
 * throws HtmlTooComplexError rather than returning partial or empty Markdown.
 *
 * @param html - Raw HTML string
 * @param url  - Source URL (used by Readability for resolving relative links)
 */
export function convertHtmlToMarkdownSync(html: string, url: string): ReadabilityResult {
  const dom = new JSDOM(prepareHtmlForParse(html), { url });

  // Try Readability first — extracts main article content
  const clonedDoc = dom.window.document.cloneNode(true) as typeof dom.window.document;
  const reader = new Readability(clonedDoc);
  const article = reader.parse();

  let htmlToConvert: string;
  let title: string;
  let usedReadability: boolean;

  if (article?.content && (article.textContent?.length ?? 0) > 100) {
    htmlToConvert = article.content;
    title = article.title ?? "";
    usedReadability = true;
  } else {
    // Readability failed (common for non-article pages like homepages)
    const body = dom.window.document.body;
    for (const tag of ["script", "style", "nav", "footer", "header", "aside", "noscript"]) {
      body.querySelectorAll(tag).forEach((el) => el.remove());
    }
    htmlToConvert = body.innerHTML;
    title = dom.window.document.title ?? "";
    usedReadability = false;
  }

  let markdown = turndown.turndown(htmlToConvert);
  markdown = markdown.replace(/\n{3,}/g, "\n\n").trim().slice(0, 50000);

  return { markdown, title, usedReadability };
}
