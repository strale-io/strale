import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";

registerCapability("url-to-markdown", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.link as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const includeLinks = input.include_links !== false;
  const includeImages = input.include_images !== false;

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : "";

  // Convert HTML to markdown
  const markdown = htmlToMarkdown(html, includeLinks, includeImages);
  const wordCount = markdown.split(/\s+/).filter(Boolean).length;

  return {
    output: { markdown, title, word_count: wordCount, url: fullUrl },
    provenance: { source: "browserless", fetched_at: new Date().toISOString() },
  };
});

function htmlToMarkdown(html: string, includeLinks: boolean, includeImages: boolean): string {
  // Remove unwanted elements
  let s = html;
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "");
  s = s.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "");
  s = s.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");

  // Headings
  s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  s = s.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  s = s.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  s = s.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n#### $1\n");
  s = s.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, "\n##### $1\n");
  s = s.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, "\n###### $1\n");

  // Bold / italic
  s = s.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/(strong|b)>/gi, "**$2**");
  s = s.replace(/<(em|i)[^>]*>([\s\S]*?)<\/(em|i)>/gi, "*$2*");
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");

  // Links
  if (includeLinks) {
    s = s.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  } else {
    s = s.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  }

  // Images
  if (includeImages) {
    s = s.replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*\/?>/gi, "![$1]($2)");
    s = s.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, "![$2]($1)");
    s = s.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, "![]($1)");
  } else {
    s = s.replace(/<img[^>]*\/?>/gi, "");
  }

  // Lists
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  s = s.replace(/<\/?(ul|ol)[^>]*>/gi, "\n");

  // Block elements
  s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, content: string) =>
    content.split("\n").map((l: string) => `> ${l}`).join("\n"));
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<\/?(p|div|tr|section|article|main)[^>]*>/gi, "\n");
  s = s.replace(/<hr[^>]*\/?>/gi, "\n---\n");

  // Tables
  s = s.replace(/<td[^>]*>([\s\S]*?)<\/td>/gi, "| $1 ");
  s = s.replace(/<th[^>]*>([\s\S]*?)<\/th>/gi, "| **$1** ");
  s = s.replace(/<\/tr>/gi, "|\n");

  // Strip remaining tags
  s = s.replace(/<[^>]+>/g, "");

  // Decode entities
  s = s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\u00a0/g, " ");

  // Clean whitespace
  s = s.replace(/[ \t]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.split("\n").map((l) => l.trim()).join("\n");

  return s.trim().slice(0, 50000);
}
