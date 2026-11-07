/**
 * Length of a page's text once scripts, styles, navigation, footers,
 * headers and tags are removed; url-to-markdown uses it to decide whether a
 * plain fetch returned a real page or a JavaScript shell.
 *
 * It returns exactly what this chain of regexes returns:
 *
 *   html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
 *       .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
 *       .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
 *       .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
 *       .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
 *       .replace(/<[^>]+>/g, " ")
 *       .replace(/\s+/g, " ").trim().length
 *
 * but in linear time. The regexes retry from every "<script" (or every "<")
 * that has no closing match, scanning to the end of the page each time:
 * 256 KB of "<a" took 13 s, so a 16 MB page could block the process for
 * hours before jsdom was ever reached (robustness track R1).
 */

/** `html.replace(/<TAG[^>]*>[\s\S]*?<\/TAG>/gi, "")`, in one forward pass. */
function removeSpans(html: string, tag: string): string {
  const open = new RegExp(`<${tag}`, "gi");
  const close = new RegExp(`</${tag}>`, "gi");
  const parts: string[] = [];
  let copied = 0;
  for (;;) {
    open.lastIndex = copied;
    const start = open.exec(html);
    if (!start) break;
    // [^>]* then ">" can only end at the first ">" after the tag name.
    const gt = html.indexOf(">", start.index + 1 + tag.length);
    if (gt < 0) break;
    // [\s\S]*? then </TAG> is the first closing tag after it. If there is
    // none, no later opening tag can match either, so the scan is over.
    close.lastIndex = gt + 1;
    const end = close.exec(html);
    if (!end) break;
    parts.push(html.slice(copied, start.index));
    copied = end.index + end[0].length;
  }
  if (parts.length === 0) return html;
  parts.push(html.slice(copied));
  return parts.join("");
}

/** `html.replace(/<[^>]+>/g, with)`, in one forward pass. */
function replaceTags(html: string, withText = " "): string {
  const parts: string[] = [];
  let copied = 0;
  let from = 0;
  for (;;) {
    const lt = html.indexOf("<", from);
    if (lt < 0 || lt + 1 >= html.length) break;
    if (html.charCodeAt(lt + 1) === 62 /* > */) {
      from = lt + 1; // "<>" has no [^>]+
      continue;
    }
    const gt = html.indexOf(">", lt + 2);
    if (gt < 0) break; // no ">" left: no later "<" can match either
    parts.push(html.slice(copied, lt), withText);
    copied = from = gt + 1;
  }
  if (parts.length === 0) return html;
  parts.push(html.slice(copied));
  return parts.join("");
}

export function strippedTextLength(html: string): number {
  let text = html;
  for (const tag of ["script", "style", "nav", "footer", "header"]) text = removeSpans(text, tag);
  return replaceTags(text).replace(/\s+/g, " ").trim().length;
}

/**
 * How much of a page the "is there real text here?" checks read. Both callers
 * only compare the text length with a small threshold (500 and 200
 * characters), so the first 512 KiB decides it. Reading all of a 16 MiB page
 * cost up to 2.2 s of main-thread time even though the scans are linear
 * (third R1 review of #964).
 */
export const TEXT_CHECK_WINDOW = 512 * 1024;

/**
 * End of the text-check window over html[start, limit). A window that ends
 * inside a <script> or <style> would count the code as visible text, so a
 * client-rendered page with a large inline state script would pass as a real
 * page and never reach the renderer (fourth R1 review of #964, F2). When the
 * window ends inside one, it is moved past that element's closing tag and
 * extended by another window, at most a few times. Each step is one forward
 * regex search, so the cost stays linear.
 */
function windowEnd(html: string, start: number, limit: number): number {
  let end = Math.min(limit, start + TEXT_CHECK_WINDOW);
  for (let step = 0; step < 4 && end < limit; step++) {
    let moved = false;
    for (const tag of ["script", "style"]) {
      // The last opening tag inside the window...
      const open = new RegExp(`<${tag}`, "gi");
      open.lastIndex = start;
      let lastOpen = -1;
      for (let m = open.exec(html); m && m.index < end; m = open.exec(html)) lastOpen = m.index;
      if (lastOpen < 0) continue;
      // ...is it still open at the window's end?
      const close = new RegExp(`</${tag}>`, "gi");
      close.lastIndex = lastOpen;
      const c = close.exec(html);
      if (!c || c.index + c[0].length <= end) continue;
      end = Math.min(limit, c.index + c[0].length + TEXT_CHECK_WINDOW);
      moved = true;
    }
    if (!moved) break;
  }
  return end;
}

/** strippedTextLength over the text-check window, compared with `n`. */
export function hasMoreTextThan(html: string, n: number): boolean {
  const end = windowEnd(html, 0, html.length);
  return strippedTextLength(end < html.length ? html.slice(0, end) : html) > n;
}

const isAsciiCI = (html: string, at: number, word: string): boolean => {
  for (let k = 0; k < word.length; k++) {
    if ((html.charCodeAt(at + k) | 0x20) !== word.charCodeAt(k)) return false;
  }
  return true;
};

/** Index of the last "</body>" (any case) starting at or after `from`, or -1. No copies. */
function lastCloseBody(html: string, from: number): number {
  for (let i = html.lastIndexOf("</"); i >= from; i = i > 0 ? html.lastIndexOf("</", i - 1) : -1) {
    if (i + 7 <= html.length && isAsciiCI(html, i + 2, "body") && html.charCodeAt(i + 6) === 62 /* > */) return i;
  }
  return -1;
}

/** The span the body regex below captures, or null: [start, end). */
function bodySpan(html: string): [number, number] | null {
  // The match starts at the first "<body" whose "[^>]*>" can complete, which
  // is the first one: a later "<body" has no ">" after it if this one does not.
  // (Searched case-insensitively in place: lowercasing a copy can change its
  // length for some Unicode characters and shift every index.)
  const openMatch = /<body/i.exec(html);
  if (!openMatch) return null;
  const gt = html.indexOf(">", openMatch.index + 5);
  if (gt < 0) return null;
  // Greedy [\s\S]* ends at the last "</body>" after the ">".
  const close = lastCloseBody(html, gt + 1);
  return close < 0 ? null : [gt + 1, close];
}

function stripBody(body: string): string {
  return replaceTags(removeSpans(removeSpans(body, "script"), "style"), "").trim();
}

/**
 * What web-provider's plain-fetch tier calls the page's visible text. It
 * returns exactly what this returns:
 *
 *   const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
 *   m ? m[1].replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
 *           .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
 *           .replace(/<[^>]+>/g, "").trim()
 *     : ""
 *
 * but in linear time. The body regex rescans to the end of the page from
 * every "<body", so 256 KB of "<body>" blocked the process for over 4 s and
 * 1 MB would take about a minute (the second R1 review of #964).
 */
export function bodyVisibleText(html: string): string {
  const span = bodySpan(html);
  return span ? stripBody(html.slice(span[0], span[1])) : "";
}

/** bodyVisibleText(html).length > n, reading the body's text-check window. */
export function bodyHasMoreTextThan(html: string, n: number): boolean {
  const span = bodySpan(html);
  if (!span) return false;
  const end = windowEnd(html, span[0], span[1]);
  return stripBody(html.slice(span[0], end)).length > n;
}
