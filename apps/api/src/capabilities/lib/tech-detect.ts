/**
 * Technology detection engine (shared by tech-stack-detect and company-tech-stack).
 *
 * Pure: takes what one public fetch of a homepage produced (response headers,
 * Set-Cookie names, HTML) and public DNS records, and returns the technologies
 * they show, each with a version when the page or header states one. It makes
 * no request of its own. The signatures live in tech-signatures.ts.
 */

import {
  TECH_SIGNATURES,
  VERSION_SHAPE,
  normalizeTechName,
  type Confidence,
  type TechSignature,
} from "./tech-signatures.js";
import type { TechDns } from "./tech-dns.js";

export interface TechMatch {
  name: string;
  category: string;
  confidence: Confidence;
  evidence: string;
  /** Version the page, a header or a script path states; null when none is stated. */
  version: string | null;
}

export interface DetectInput {
  /** Response headers, lower-case names. */
  headers: Record<string, string>;
  /** Names of cookies the response sets (Set-Cookie), without values. */
  cookieNames?: string[];
  html: string;
  dns?: Pick<TechDns, "mx" | "txt" | "ns" | "cname"> | null;
}

/** Scan at most this much HTML: the first 700 KB plus the last 300 KB. */
const MAX_SCAN_CHARS = 1_000_000;
const SCAN_HEAD_CHARS = 700_000;
const MAX_META_TAGS = 400;

export function scanWindow(html: string): string {
  if (html.length <= MAX_SCAN_CHARS) return html;
  return `${html.slice(0, SCAN_HEAD_CHARS)}\n${html.slice(-(MAX_SCAN_CHARS - SCAN_HEAD_CHARS))}`;
}

/**
 * Tracking pixels are `<img>` tags whose source is a tracker host. Every other
 * image, and every `<source>`, `<video>` and `<audio>`, is content, not an
 * install signal.
 */
const PIXEL_SRC =
  /facebook\.com\/tr[/?]|px\.ads\.linkedin\.com|ct\.pinterest\.com|analytics\.twitter\.com\/i\/adsct|t\.co\/i\/adsct|bat\.bing\.com|googleads\.g\.doubleclick\.net|googleadservices\.com|stats\.wp\.com|alb\.reddit\.com|analytics\.tiktok\.com/i;

const SKIPPED_TAGS: ReadonlySet<string> = new Set(["a", "meta"]);
const CONTENT_MEDIA_TAGS: ReadonlySet<string> = new Set(["img", "source", "video", "audio", "picture", "track"]);
/** Script bodies that are data, not code: page content can sit inside them. */
const DATA_SCRIPT_TYPE = /\btype\s*=\s*["']?(?:application\/(?:ld\+)?json|importmap|speculationrules|text\/(?:template|html|x-template))/i;
/**
 * Data scripts whose body is configuration the platform itself prints, not
 * page content: WordPress lists its emoji script (and so its core version)
 * as JSON under this id.
 */
const DATA_SCRIPT_KEEP = /\bid\s*=\s*["']wp-emoji-settings["']/i;
const MAX_TAG_CHARS = 4000;
const MAX_COMMENT_CHARS = 2000;

export interface ActiveMarkup {
  /** Start tags and executable script and style bodies, joined. No visible text, no links. */
  markup: string;
  /** HTML comments, joined. Only comment signatures read these. */
  comments: string;
}

/**
 * Keep what a page loads or runs, and drop what a reader sees.
 *
 * A page that talks about a product ("we compared Hotjar and Plausible", a
 * link to a vendor's site, a customer-logo `<img alt="HubSpot">`) does not use
 * it. So HTML signatures are matched only against: start tags (script, link,
 * iframe, form, and the id, class and data- attributes of any element), the
 * bodies of executable inline scripts and styles, and tracking-pixel images.
 * Visible text, `<a>` links, `<meta>` content (read separately), content
 * images and data scripts (JSON) are dropped.
 *
 * Linear in the input: one forward pass with `indexOf`, no backtracking
 * across tags, so a page built from unterminated tags cannot make it quadratic.
 */
export function extractActiveMarkup(html: string): ActiveMarkup {
  const lower = html.toLowerCase();
  const out: string[] = [];
  const comments: string[] = [];
  let i = 0;
  let cachedGt = -2;
  let noMoreGt = false;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt === -1) break;

    if (html.startsWith("<!--", lt)) {
      const end = html.indexOf("-->", lt + 4);
      comments.push(html.slice(lt + 4, end === -1 ? undefined : Math.min(end, lt + 4 + MAX_COMMENT_CHARS)));
      i = end === -1 ? html.length : end + 3;
      continue;
    }

    const nameMatch = /^<([a-zA-Z][\w:-]*)/.exec(html.slice(lt, lt + 40));
    if (!nameMatch) { i = lt + 1; continue; }
    const tag = nameMatch[1].toLowerCase();

    // First ">" after lt. The first ">" after an earlier "<" is also the first
    // one after this "<" when it lies beyond it, so each ">" is found once.
    if (!noMoreGt && cachedGt < lt) {
      cachedGt = html.indexOf(">", lt);
      if (cachedGt === -1) noMoreGt = true;
    }
    if (noMoreGt) break;
    const gt = cachedGt;
    const tagText = html.slice(lt, Math.min(gt + 1, lt + MAX_TAG_CHARS));
    i = gt + 1;

    if (tag === "script" || tag === "style") {
      const close = lower.indexOf(`</${tag}`, gt + 1);
      const body = html.slice(gt + 1, close === -1 ? undefined : close);
      i = close === -1 ? html.length : close;
      out.push(tagText);
      const isData =
        tag === "script" &&
        !DATA_SCRIPT_KEEP.test(tagText) &&
        (DATA_SCRIPT_TYPE.test(tagText) || /^\s*self\.__next_f\b/.test(body.slice(0, 40)));
      if (!isData) out.push(body);
      continue;
    }
    if (SKIPPED_TAGS.has(tag)) continue;
    if (CONTENT_MEDIA_TAGS.has(tag)) {
      // Only the source decides: an alt text that names a tracker is a mention.
      const src = /\bsrc\s*=\s*["']?([^"'\s>]+)/i.exec(tagText)?.[1] ?? "";
      if (!PIXEL_SRC.test(src)) continue;
    }
    out.push(tagText);
  }

  return { markup: out.join("\n"), comments: comments.join("\n") };
}

export function cleanVersion(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const v = raw.trim().replace(/^v(?=\d)/i, "");
  return VERSION_SHAPE.test(v) ? v : null;
}

/** Cookie names from Set-Cookie header values (never the cookie values). */
export function extractCookieNames(setCookies: readonly string[]): string[] {
  const names: string[] = [];
  for (const raw of setCookies) {
    const eq = raw.indexOf("=");
    if (eq > 0) names.push(raw.slice(0, eq).trim());
  }
  return names;
}

interface MetaTag { name: string; content: string }

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag)) !== null) {
    const key = m[1].toLowerCase();
    if (!(key in attrs)) attrs[key] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

export function parseMetaTags(html: string): MetaTag[] {
  const metas: MetaTag[] = [];
  const re = /<meta\b[^>]{0,2000}>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && metas.length < MAX_META_TAGS) {
    const attrs = parseAttrs(m[0]);
    const name = (attrs.name ?? attrs.property ?? "").toLowerCase();
    if (name && attrs.content !== undefined) metas.push({ name, content: attrs.content.trim() });
  }
  return metas;
}

/** A generator string no signature claims: "ThinkRank 2.9.0" becomes name and version. */
export function parseGenericGenerator(content: string): { name: string; version: string | null } | null {
  const raw = content.trim();
  if (!raw || raw.length > 160) return null;
  const head = raw.split(/;|\s-\s|\(/)[0].trim();
  if (!head) return null;
  const m = /^(.{1,60}?)\s+v?(\d[\w.+-]{0,30})$/i.exec(head);
  if (m) return { name: m[1].trim(), version: cleanVersion(m[2]) };
  return { name: head.slice(0, 80), version: null };
}

const CATEGORY_OF: Map<string, string> = new Map();
const SIGNATURE_OF_NAME: Map<string, TechSignature> = new Map();
for (const sig of TECH_SIGNATURES) {
  const key = normalizeTechName(sig.name);
  if (!CATEGORY_OF.has(key)) CATEGORY_OF.set(key, sig.category);
  if (!SIGNATURE_OF_NAME.has(key)) SIGNATURE_OF_NAME.set(key, sig);
}

export function detectTechnologies(input: DetectInput): TechMatch[] {
  const found = new Map<string, TechMatch>();
  const ordered: TechMatch[] = [];

  // Where a version came from decides which one wins when two sources state
  // different ones: a header or the tool's own generator tag (rank 2) beats a
  // `?ver=` on a file that may belong to a bundled library (rank 1).
  const versionRank = new Map<TechMatch, number>();

  function add(
    sig: Pick<TechSignature, "name" | "category" | "confidence">,
    evidence: string,
    version: string | null,
    options: { confidence?: Confidence; rank?: number } = {},
  ): void {
    const key = normalizeTechName(sig.name);
    const rank = options.rank ?? 1;
    const existing = found.get(key);
    if (existing) {
      if (version && (!existing.version || rank > (versionRank.get(existing) ?? 0))) {
        existing.version = version;
        versionRank.set(existing, rank);
      }
      return;
    }
    const match: TechMatch = {
      name: sig.name,
      category: sig.category,
      confidence: options.confidence ?? sig.confidence ?? "high",
      evidence,
      version,
    };
    found.set(key, match);
    versionRank.set(match, version ? rank : 0);
    ordered.push(match);
  }

  // 1. Response headers.
  for (const sig of TECH_SIGNATURES) {
    if (!sig.headers) continue;
    let evidence: string | null = null;
    let version: string | null = null;
    for (const [header, pattern] of Object.entries(sig.headers)) {
      const value = input.headers[header];
      if (value === undefined) continue;
      const m = pattern.exec(value);
      if (!m) continue;
      evidence ??= `HTTP header ${header}`;
      version ??= cleanVersion(m[1]);
    }
    if (evidence) add(sig, evidence, version, { rank: 2 });
  }

  // 2. HTML.
  // Matched against what the page loads or runs, never its visible text or links.
  const html = scanWindow(input.html);
  const { markup, comments } = extractActiveMarkup(html);
  for (const sig of TECH_SIGNATURES) {
    if (!sig.html && !sig.comment) continue;
    let matched = false;
    let version: string | null = null;
    for (const pattern of sig.html ?? []) {
      const m = pattern.exec(markup);
      if (!m) continue;
      matched = true;
      version ??= cleanVersion(m[1]);
    }
    for (const pattern of sig.comment ?? []) {
      const m = pattern.exec(comments);
      if (!m) continue;
      matched = true;
      version ??= cleanVersion(m[1]);
    }
    if (matched) add(sig, "HTML content pattern", version);
  }

  // 3. Meta tags, with the generator tag as the catch-all for unknown tools.
  const metas = parseMetaTags(html);
  const claimedGenerators = new Set<string>();
  for (const sig of TECH_SIGNATURES) {
    if (!sig.meta) continue;
    for (const [metaName, pattern] of Object.entries(sig.meta)) {
      for (const meta of metas) {
        if (meta.name !== metaName) continue;
        const m = pattern.exec(meta.content);
        if (!m) continue;
        if (metaName === "generator") claimedGenerators.add(meta.content);
        add(sig, `meta ${metaName} tag`, cleanVersion(m[1]), { rank: 2 });
      }
    }
  }
  for (const meta of metas) {
    if (meta.name !== "generator" || claimedGenerators.has(meta.content)) continue;
    const generic = parseGenericGenerator(meta.content);
    if (generic) add({ name: generic.name, category: "cms" }, "meta generator tag", generic.version, { confidence: "high", rank: 2 });
  }

  // 4. Cookie names.
  const cookieNames = input.cookieNames ?? [];
  if (cookieNames.length > 0) {
    for (const sig of TECH_SIGNATURES) {
      if (!sig.cookies) continue;
      const hit = cookieNames.find((name) => sig.cookies!.some((pattern) => pattern.test(name)));
      if (hit) add(sig, `cookie ${hit}`, null);
    }
  }

  // 5. Public DNS.
  const dns = input.dns;
  if (dns) {
    for (const sig of TECH_SIGNATURES) {
      const mxHit = sig.mx && dns.mx.find((r) => sig.mx!.some((p) => p.test(r.exchange.toLowerCase())));
      if (mxHit) { add(sig, `DNS MX record ${mxHit.exchange.toLowerCase()}`, null); continue; }
      const txtHit = sig.txt && dns.txt.some((r) => sig.txt!.some((p) => p.test(r)));
      if (txtHit) { add(sig, "DNS TXT record", null); continue; }
      const nsHit = sig.ns && dns.ns.find((r) => sig.ns!.some((p) => p.test(r.toLowerCase())));
      if (nsHit) { add(sig, `DNS NS record ${nsHit.toLowerCase()}`, null); continue; }
      const cnameHit = sig.cname && dns.cname.find((r) => sig.cname!.some((p) => p.test(r.toLowerCase())));
      if (cnameHit) add(sig, `DNS CNAME record ${cnameHit.toLowerCase()}`, null);
    }
  }

  // 6. Consequences: a detected tool that cannot exist without another one.
  for (const tech of [...ordered]) {
    const sig = SIGNATURE_OF_NAME.get(normalizeTechName(tech.name));
    for (const impliedName of sig?.implies ?? []) {
      const category = CATEGORY_OF.get(normalizeTechName(impliedName));
      if (!category) continue;
      add({ name: impliedName, category }, `implied by ${tech.name}`, null, { confidence: "medium" });
    }
  }

  return ordered;
}

export function groupByCategory(technologies: ReadonlyArray<Pick<TechMatch, "name" | "category">>): Record<string, string[]> {
  const byCategory: Record<string, string[]> = {};
  for (const tech of technologies) {
    (byCategory[tech.category] ??= []).push(tech.name);
  }
  return byCategory;
}
