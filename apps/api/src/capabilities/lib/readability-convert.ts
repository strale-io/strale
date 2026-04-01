/**
 * High-quality HTML → Markdown conversion using Readability.js + Turndown.
 *
 * Readability extracts the main article content (strips nav, footer, ads, sidebars).
 * Turndown converts the cleaned HTML to well-formatted markdown.
 * Produces output quality comparable to Jina Reader and Firecrawl, at zero API cost.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import TurndownService from "turndown";

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
 * @param html - Raw HTML string
 * @param url  - Source URL (used by Readability for resolving relative links)
 */
export function htmlToCleanMarkdown(html: string, url: string): ReadabilityResult {
  const dom = new JSDOM(html, { url });

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
