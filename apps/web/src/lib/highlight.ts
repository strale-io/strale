// Minimal, escape-first highlighting for the JSON and shell snippets the site shows.
// Output is HTML; every input character is escaped before any span is added.

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** JSON produced by JSON.stringify(…, null, 2): keys, strings, numbers and literals. */
export function highlightJson(text: string): string {
  return text.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)|([^"\w-]+|[\w-]+)/gi, (m, str, colon, lit, num) => {
    if (str) return colon ? `<span class="tk-p">${escapeHtml(str)}</span>${escapeHtml(colon)}` : `<span class="tk-s">${escapeHtml(str)}</span>`;
    if (lit) return `<span class="tk-k">${lit}</span>`;
    if (num) return `<span class="tk-n">${num}</span>`;
    return escapeHtml(m);
  });
}

/** Shell: comments, quoted strings and flags. */
export function highlightShell(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*#/.test(line)) return `<span class="tk-c">${escapeHtml(line)}</span>`;
      return line.replace(/('(?:[^'])*'|"(?:\\.|[^"\\])*")|(\s--?[a-zA-Z][\w-]*)|([^'"\s]+|\s+)/g, (m, str, flag) => {
        if (str) return `<span class="tk-s">${escapeHtml(str)}</span>`;
        if (flag) return `<span class="tk-k">${escapeHtml(flag)}</span>`;
        return escapeHtml(m);
      });
    })
    .join("\n");
}

export function highlight(text: string, lang: "json" | "shell" | "plain"): string {
  if (lang === "json") return highlightJson(text);
  if (lang === "shell") return highlightShell(text);
  return escapeHtml(text);
}
