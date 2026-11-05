// Guides (SITE-STRUCTURE.md page 11): step-by-step pages for building an agent that uses Strale tools.
//
// The text is data: one Markdown file per guide in src/data/guides/. This module reads them
// (front matter plus a small Markdown subset: paragraphs, lists, tables, ### questions and fenced
// code), and resolves {{tokens}} against the catalogue when a page is built, so a price, a name,
// a retention period or the free allowance is never typed into a guide.
//
//   {{price:slug}}   the tool's price per call, in euro ("€0.05"); refuses a free tool
//   {{cost:slug}}    "free", or the price
//   {{name:slug}}    the tool's name
//   {{fact:free_limit|retention_days|pii_days|free_tools}}   platform facts (free_tools: linked names)
//
// A token for a tool the catalogue does not list fails the build, naming the guide.
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { REPO_ROOT, tools as allTools } from "./site-data.ts";
import { FREE_TIER_MONTHLY_LIMIT } from "./code-facts.ts";
import { formatEur } from "./format.ts";
import { escapeHtml } from "./highlight.ts";
import type { SiteData } from "./types.ts";

export const GUIDES_DIR = resolve(REPO_ROOT, "apps/web/src/data/guides");

export const GROUPS = [
  { id: "payments", label: "Payment details", blurb: "Check IBANs, SWIFT codes, EORI and VAT numbers before an agent moves money." },
  { id: "companies", label: "Company checks", blurb: "Look up and verify companies from official records." },
  { id: "screening", label: "Screening and compliance", blurb: "Sanctions, politically exposed persons, adverse media and regulation checks." },
  { id: "web", label: "Web, domains and data", blurb: "Read pages, check domains and clean up what an agent gets back." },
  { id: "agents", label: "Build and connect agents", blurb: "Patterns for calling Strale reliably from an agent." },
] as const;
export type GroupId = (typeof GROUPS)[number]["id"];

export type Block =
  | { kind: "p"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "h3"; text: string }
  | { kind: "code"; panels: { label: string; lang: "json" | "shell" | "plain"; source: string; code: string }[] }
  | { kind: "table"; head: string[]; rows: string[][] };

export interface Section {
  id: string;
  heading: string;
  blocks: Block[];
}

export interface Guide {
  slug: string;
  title: string;
  description: string;
  group: GroupId;
  /** Framework or client the example uses ("LangChain", "MCP"), for the label on cards. */
  framework?: string;
  language?: string;
  /** Tools the guide is about; the first is the primary one. */
  tools: string[];
  /** ISO codes of countries whose /company-data page links to this guide. */
  countries: string[];
  steps: string[];
  /** The short answer, shown under the title. */
  summary: string;
  sections: Section[];
}

const TOKEN = /\{\{(\w+):([\w.-]+)\}\}/g;
const fenceLang = (l: string): "json" | "shell" | "plain" => (l === "json" ? "json" : l === "bash" || l === "shell" || l === "sh" ? "shell" : "plain");
export const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Splits `---` front matter from the body. */
function frontMatter(source: string, file: string): { meta: Record<string, any>; body: string } {
  const m = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${file}: a guide starts with --- front matter`);
  return { meta: parse(m[1]) as Record<string, any>, body: m[2] };
}

/** The Markdown subset guides use, to blocks. A new Block kind needs a renderer in pages/guides/[slug].astro. */
export function parseBlocks(body: string, file = "guide"): { summary: string; sections: Section[] } {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [];
  let summary: Block[] = [];
  let cur: Block[] = summary;
  let i = 0;
  let fenceEnd = -1; // line index just after the last closing fence
  const paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) cur.push({ kind: "p", text: paragraph.join(" ") });
    paragraph.length = 0;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const start = i;
      const info = line.slice(3).trim().split(/\s+/);
      const lang = info[0] || "text";
      const label = info.slice(1).join(" ") || (lang === "bash" || lang === "shell" ? "Shell" : lang === "json" ? "JSON" : lang.charAt(0).toUpperCase() + lang.slice(1));
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) code.push(lines[i++]);
      if (i >= lines.length) throw new Error(`${file}: a code block is never closed`);
      i++;
      const panel = { label, lang: fenceLang(lang), source: lang, code: code.join("\n") };
      const last = cur[cur.length - 1];
      // Fences with nothing between them become the tabs of one block.
      if (last?.kind === "code" && start === fenceEnd) last.panels.push(panel);
      else cur.push({ kind: "code", panels: [panel] });
      fenceEnd = i;
      continue;
    }
    if (/^## /.test(line)) {
      flush();
      const heading = line.slice(3).trim();
      cur = [];
      sections.push({ id: slugify(heading), heading, blocks: cur });
      i++;
      continue;
    }
    if (/^### /.test(line)) {
      flush();
      cur.push({ kind: "h3", text: line.slice(4).trim() });
      i++;
      continue;
    }
    if (/^\|/.test(line)) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      if (rows.length < 2 || !rows[1].every((c) => /^:?-{3,}:?$/.test(c))) throw new Error(`${file}: a table needs a header row and a --- separator row`);
      cur.push({ kind: "table", head: rows[0], rows: rows.slice(2) });
      continue;
    }
    if (/^(- |\d+\. )/.test(line)) {
      flush();
      const ordered = /^\d+\. /.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? /^\d+\. /.test(lines[i]) : /^- /.test(lines[i]))) {
        items.push(lines[i].replace(ordered ? /^\d+\. / : /^- /, ""));
        i++;
        while (i < lines.length && /^ {2,}\S/.test(lines[i])) items[items.length - 1] += " " + lines[i++].trim();
      }
      cur.push({ kind: ordered ? "ol" : "ul", items });
      continue;
    }
    if (line.trim() === "") {
      flush();
      i++;
      continue;
    }
    paragraph.push(line.trim());
    i++;
  }
  flush();
  const summaryText = summary.map((b) => (b.kind === "p" ? b.text : "")).filter(Boolean).join(" ");
  return { summary: summaryText, sections };
}

export function parseGuide(source: string, file: string): Guide {
  const { meta, body } = frontMatter(source, file);
  for (const k of ["slug", "title", "description", "group"]) if (!meta[k]) throw new Error(`${file}: front matter needs ${k}`);
  if (!GROUPS.some((g) => g.id === meta.group)) throw new Error(`${file}: unknown group "${meta.group}"`);
  const { summary, sections } = parseBlocks(body, file);
  return {
    slug: String(meta.slug),
    title: String(meta.title),
    description: String(meta.description),
    group: meta.group,
    framework: meta.framework,
    language: meta.language,
    tools: meta.tools ?? [],
    countries: meta.countries ?? [],
    steps: meta.steps ?? [],
    summary,
    sections,
  };
}

let cache: Guide[] | null = null;

/** Every guide in src/data/guides/, ordered by group, then title. */
export function loadGuides(dir = GUIDES_DIR): Guide[] {
  if (dir === GUIDES_DIR && cache) return cache;
  const guides = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => {
      const g = parseGuide(readFileSync(resolve(dir, f), "utf8"), f);
      if (`${g.slug}.md` !== f) throw new Error(`${f}: the file name must be the slug (${g.slug}.md)`);
      return g;
    });
  const order = new Map(GROUPS.map((g, n) => [g.id as string, n]));
  guides.sort((a, b) => order.get(a.group)! - order.get(b.group)! || a.title.localeCompare(b.title));
  if (dir === GUIDES_DIR) cache = guides;
  return guides;
}

export function guideBySlug(slug: string): Guide | undefined {
  return loadGuides().find((g) => g.slug === slug);
}

/** The guides that appear under /guides: every guide, once, in the group it belongs to. */
export function indexGroups(guides: Guide[] = loadGuides()) {
  return GROUPS.map((g) => ({ ...g, guides: guides.filter((x) => x.group === g.id) })).filter((g) => g.guides.length > 0);
}

export function guidesForCountry(iso: string, guides: Guide[] = loadGuides()): Guide[] {
  return guides.filter((g) => g.countries.includes(iso));
}

// ---------- resolving tokens against the catalogue ----------

export interface ToolRow {
  slug: string;
  name: string;
  free: boolean;
  priceCents: number;
}

/** Replaces every {{token}} in a string. `where` names the guide in the error. */
export function resolveTokens(text: string, d: SiteData, where: string): string {
  const bySlug = new Map(allTools(d).map((t) => [t.slug, t]));
  const tool = (slug: string, token: string) => {
    const t = bySlug.get(slug);
    if (!t) throw new Error(`${where}: {{${token}}} names "${slug}", which is not a visible tool in the catalogue`);
    return t;
  };
  return text.replace(TOKEN, (_all, kind: string, arg: string) => {
    const token = `${kind}:${arg}`;
    switch (kind) {
      case "price": {
        const t = tool(arg, token);
        if (t.free) throw new Error(`${where}: {{${token}}}: "${arg}" is a free tool; use {{cost:${arg}}}`);
        return formatEur(t.price_cents);
      }
      case "cost": {
        const t = tool(arg, token);
        return t.free ? "free" : formatEur(t.price_cents);
      }
      case "name":
        return tool(arg, token).name;
      case "fact": {
        if (arg === "free_limit") return String(FREE_TIER_MONTHLY_LIMIT);
        if (arg === "retention_days") return String(d.facts.static.retention_days_default);
        if (arg === "pii_days") return String(d.facts.static.pii_retention_days);
        if (arg === "free_tools") {
          const names = allTools(d).filter((t) => t.free).map((t) => `[${t.name}](/tools/${t.slug})`);
          return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names.join("");
        }
        throw new Error(`${where}: unknown fact "${arg}"`);
      }
      default:
        throw new Error(`${where}: unknown token {{${token}}}`);
    }
  });
}

export interface ResolvedGuide extends Omit<Guide, "sections" | "steps" | "summary"> {
  summary: string;
  steps: string[];
  sections: Section[];
  toolRows: ToolRow[];
}

function mapBlock(b: Block, f: (s: string) => string): Block {
  switch (b.kind) {
    case "p":
    case "h3":
      return { ...b, text: f(b.text) };
    case "ul":
    case "ol":
      return { ...b, items: b.items.map(f) };
    case "table":
      return { ...b, head: b.head.map(f), rows: b.rows.map((r) => r.map(f)) };
    case "code":
      return { ...b, panels: b.panels.map((p) => ({ ...p, code: f(p.code) })) };
  }
}

/** The guide with every token replaced, and the rows of the "Tools in this guide" table. */
export function resolveGuide(g: Guide, d: SiteData): ResolvedGuide {
  const where = `guide "${g.slug}"`;
  const f = (s: string) => resolveTokens(s, d, where);
  const bySlug = new Map(allTools(d).map((t) => [t.slug, t]));
  const toolRows = g.tools.map((slug) => {
    const t = bySlug.get(slug);
    if (!t) throw new Error(`${where}: tool "${slug}" is not a visible tool in the catalogue`);
    return { slug, name: t.name, free: t.free, priceCents: t.price_cents };
  });
  return {
    ...g,
    summary: f(g.summary),
    steps: g.steps.map(f),
    sections: g.sections.map((s) => ({ ...s, blocks: s.blocks.map((b) => mapBlock(b, f)) })),
    toolRows,
  };
}

// ---------- inline text ----------

/** Plain text of an inline Markdown string (for page descriptions and the lead line). */
export function plainText(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/[`*]/g, "");
}

const SAFE_HREF = /^(\/[\w\-./#?=&%]*|https:\/\/[\w\-./#?=&%:+~@]+)$/;

/** Inline Markdown (`code`, **bold**, [text](url)) to HTML. Everything is escaped first; only safe links become anchors. */
export function renderInline(s: string): string {
  const parts: string[] = [];
  let html = escapeHtml(s);
  html = html.replace(/`([^`]+)`/g, (_m, c: string) => `\u0000${parts.push(`<code>${c}</code>`) - 1}\u0000`);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, href: string) => {
    const raw = href.replace(/&amp;/g, "&");
    if (!SAFE_HREF.test(raw)) return m;
    return `<a class="link" href="${href}">${text}</a>`;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\u0000(\d+)\u0000/g, (_m, n: string) => parts[Number(n)]);
}

/** Everything FAQPage markup needs: the ### questions under a "Questions" section, with their answers. */
export function faqPairs(sections: Section[]): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (const s of sections.filter((x) => x.id === "questions")) {
    let q: string | null = null;
    for (const b of s.blocks) {
      if (b.kind === "h3") q = plainText(b.text);
      else if (b.kind === "p" && q) {
        out.push({ question: q, answer: plainText(b.text) });
        q = null;
      }
    }
  }
  return out;
}
