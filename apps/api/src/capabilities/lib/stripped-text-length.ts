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

/** `html.replace(/<[^>]+>/g, " ")`, in one forward pass. */
function replaceTags(html: string): string {
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
    parts.push(html.slice(copied, lt), " ");
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
