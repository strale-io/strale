import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("markdown-to-html", async (input: CapabilityInput) => {
  const markdown = ((input.markdown as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (!markdown) throw new Error("'markdown' is required.");

  const theme = ((input.theme as string) ?? "light").toLowerCase(); // light, dark, plain

  const bodyHtml = convertMarkdown(markdown);
  const css = getThemeCSS(theme);
  const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>${css}</style></head>
<body>${bodyHtml}</body>
</html>`;

  return {
    output: { html: fullHtml, body_html: bodyHtml, theme },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function convertMarkdown(md: string): string {
  let html = md;

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code class="language-${lang || "text"}">${escapeHtml(code.trim())}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Horizontal rules
  html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "<hr>");

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

  // Images (before links to avoid collision)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Blockquotes
  html = html.replace(/^>\s+(.+)$/gm, "<blockquote>$1</blockquote>");
  // Merge adjacent blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, "\n");

  // Unordered lists
  html = html.replace(/^[-*+]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, "<oli>$1</oli>");
  html = html.replace(/(<oli>[\s\S]*?<\/oli>)/g, (match) =>
    "<ol>" + match.replace(/<\/?oli>/g, (t) => t.replace("oli", "li")) + "</ol>");
  html = html.replace(/<\/ol>\s*<ol>/g, "");

  // Paragraphs — wrap standalone lines
  const lines = html.split("\n");
  const result: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      result.push("");
    } else if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr|div|table)/.test(trimmed)) {
      result.push(trimmed);
    } else {
      result.push(`<p>${trimmed}</p>`);
    }
  }

  html = result.join("\n");
  // Remove empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, "");

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getThemeCSS(theme: string): string {
  const base = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.6;max-width:800px;margin:0 auto;padding:2rem}
code{font-family:"SF Mono",Monaco,Consolas,monospace;font-size:0.9em;padding:0.2em 0.4em;border-radius:3px}
pre{padding:1rem;border-radius:6px;overflow-x:auto}pre code{padding:0}
blockquote{border-left:4px solid;padding-left:1rem;margin-left:0}
img{max-width:100%;height:auto}
table{border-collapse:collapse;width:100%}th,td{border:1px solid;padding:0.5rem;text-align:left}
hr{border:none;border-top:1px solid}`;

  if (theme === "dark") {
    return `${base}\nbody{background:#1a1a2e;color:#e0e0e0}a{color:#64b5f6}code{background:#2d2d44}pre{background:#2d2d44}blockquote{border-color:#555;color:#aaa}th,td{border-color:#444}hr{border-color:#444}`;
  }
  if (theme === "plain") {
    return `${base}`;
  }
  // light (default)
  return `${base}\nbody{background:#fff;color:#333}a{color:#0366d6}code{background:#f6f8fa}pre{background:#f6f8fa}blockquote{border-color:#dfe2e5;color:#6a737d}th,td{border-color:#ddd}hr{border-color:#eee}`;
}
