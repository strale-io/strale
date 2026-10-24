// Copyable calls for a tool or bundled check, one per route. Each snippet uses
// the client's real interface as the code defines it (packages/sdk-typescript
// src/types.ts DoRequest, packages/sdk-python straleio/types.py DoRequest,
// packages/mcp-server src/tools.ts strale_execute), not the READMEs.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { REPO_ROOT, API_BASE } from "./site-data.ts";
import type { X402Item } from "./types.ts";

function packageName(dir: string): string {
  return (JSON.parse(readFileSync(resolve(REPO_ROOT, dir, "package.json"), "utf8")) as { name: string }).name;
}
function pyPackageName(dir: string): string {
  const m = readFileSync(resolve(REPO_ROOT, dir, "pyproject.toml"), "utf8").match(/^name\s*=\s*"([^"]+)"/m);
  if (!m) throw new Error(`No package name in ${dir}/pyproject.toml`);
  return m[1];
}

export const PACKAGES = {
  mcp: packageName("packages/mcp-server"),
  typescript: packageName("packages/sdk-typescript"),
  python: pyPackageName("packages/sdk-python"),
};

export interface Snippet { label: string; lang: "shell" | "json" | "plain"; code: string }

const indent = (text: string, by: string) => text.replace(/\n/g, `\n${by}`);
/** A Python literal for JSON-shaped data (strings keep their JSON escaping, which Python accepts). */
export function pyValue(v: unknown, depth = 0): string {
  const pad = "    ".repeat(depth + 1), end = "    ".repeat(depth);
  if (v === null || v === undefined) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + pyValue(x, depth + 1)).join(",\n")},\n${end}]` : "[]";
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    return entries.length ? `{\n${entries.map(([k, x]) => `${pad}${JSON.stringify(k)}: ${pyValue(x, depth + 1)}`).join(",\n")},\n${end}}` : "{}";
  }
  return JSON.stringify(v);
}

/** The price cap the examples send: exactly the listed price, so the cap is visible and never generous. */
const cap = (priceCents: number) => Math.max(priceCents, 1);

export function toolSnippets(opts: { slug: string; inputs: Record<string, unknown>; priceCents: number; free: boolean; x402: X402Item | null }): Snippet[] {
  const { slug, inputs, priceCents, free, x402 } = opts;
  const max = cap(priceCents);
  const body = JSON.stringify({ capability_slug: slug, inputs, max_price_cents: max }, null, 2);
  const out: Snippet[] = [
    {
      label: "API",
      lang: "shell",
      code: [
        free ? "# Free tool: works without a key, a few times a day. Add your key for more." : "# Needs an API key. max_price_cents caps what this call may cost.",
        `curl -X POST ${API_BASE}/v1/do \\`,
        ...(free ? [] : [`  -H "Authorization: Bearer $STRALE_API_KEY" \\`]),
        `  -H 'Content-Type: application/json' \\`,
        `  -d '${indent(body, "  ")}'`,
      ].join("\n"),
    },
    {
      label: "MCP",
      lang: "json",
      code: `${JSON.stringify({ tool: "strale_execute", arguments: { slug, inputs, max_price_cents: max } }, null, 2)}`,
    },
    {
      label: "TypeScript",
      lang: "plain",
      code: `import { Strale } from "${PACKAGES.typescript}";\n\nconst strale = new Strale({ apiKey: process.env.STRALE_API_KEY! });\nconst result = await strale.do({\n  capability_slug: "${slug}",\n  inputs: ${indent(JSON.stringify(inputs, null, 2), "  ")},\n  max_price_cents: ${max},\n});`,
    },
    {
      label: "Python",
      lang: "plain",
      code: `import os\nfrom ${PACKAGES.python} import Strale, DoRequest\n\nstrale = Strale(api_key=os.environ["STRALE_API_KEY"])\nresult = strale.do(DoRequest(\n    capability_slug="${slug}",\n    inputs=${indent(pyValue(inputs), "    ")},\n    max_price_cents=${max},\n))`,
    },
  ];
  if (x402) out.push(x402Snippet(x402, inputs));
  return out;
}

export function solutionSnippets(opts: { slug: string; inputs: Record<string, unknown>; priceCents: number; x402: X402Item | null }): Snippet[] {
  const { slug, inputs, priceCents, x402 } = opts;
  const out: Snippet[] = [
    {
      label: "API",
      lang: "shell",
      code: [
        "# Needs an API key. The whole check is charged once, at the listed price.",
        `curl -X POST ${API_BASE}/v1/solutions/${slug}/execute \\`,
        `  -H "Authorization: Bearer $STRALE_API_KEY" \\`,
        `  -H 'Content-Type: application/json' \\`,
        `  -d '${indent(JSON.stringify({ inputs, max_price_cents: priceCents }, null, 2), "  ")}'`,
      ].join("\n"),
    },
  ];
  if (x402) out.push(x402Snippet(x402, inputs));
  return out;
}

function x402Snippet(x: X402Item, inputs: Record<string, unknown>): Snippet {
  // GET carries inputs in the query string, which only holds scalars; anything else goes as a JSON POST.
  const get = x.method.toUpperCase() === "GET" && Object.values(inputs).every((v) => v === null || typeof v !== "object");
  const url = get ? `${x.endpoint}?${new URLSearchParams(Object.entries(inputs).map(([k, v]) => [k, String(v)])).toString()}` : x.endpoint;
  return {
    label: "x402",
    lang: "shell",
    code: [
      "# No account. The first request answers 402 with the price in USDC;",
      "# an x402 client pays it from your wallet and repeats the request.",
      get ? `curl -i '${url}'` : `curl -i -X POST ${url} \\\n  -H 'Content-Type: application/json' \\\n  -d '${indent(JSON.stringify(inputs, null, 2), "  ")}'`,
    ].join("\n"),
  };
}
