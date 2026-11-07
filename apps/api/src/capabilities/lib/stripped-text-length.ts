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
  // The match starts at the first "<body" whose "[^>]*>" can complete, which
  // is the first one: a later "<body" has no ">" after it if this one does not.
  // (Searched case-insensitively in place: lowercasing a copy can change its
  // length for some Unicode characters and shift every index.)
  const openMatch = /<body/i.exec(html);
  if (!openMatch) return "";
  const gt = html.indexOf(">", openMatch.index + 5);
  if (gt < 0) return "";
  // Greedy [\s\S]* ends at the last "</body>" after the ">": one forward pass.
  const closeRe = /<\/body>/gi;
  closeRe.lastIndex = gt + 1;
  let close = -1;
  for (let m = closeRe.exec(html); m; m = closeRe.exec(html)) close = m.index;
  if (close < 0) return "";
  let body = html.slice(gt + 1, close);
  body = removeSpans(body, "script");
  body = removeSpans(body, "style");
  return replaceTags(body, "").trim();
}
