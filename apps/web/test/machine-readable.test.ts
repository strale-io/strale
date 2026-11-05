// /llms.txt, /.well-known/agent.json and /.well-known/mcp.json (SWITCH-OVER-READINESS item 6),
// checked as the strings the endpoints send. The built files are checked again in
// test-built/machine-readable.test.ts. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { API_PATHS, allMachineReadableText, renderAgentCard, renderLlmsTxt, renderMcpCard } from "../src/lib/machine-readable.ts";
import { L1, SENTENCE } from "../src/content/positioning.ts";
import { checkSchema, compileMatcher } from "../../../scripts/claims-lib.mjs";

const repo = resolve(import.meta.dirname, "../../..");
const SITE = "https://example.test";
const files = allMachineReadableText(SITE);

/** The keys of the files these replace (strale-frontend public/.well-known/agent.json and mcp.json). */
const OLD_AGENT_KEYS = ["$schema", "name", "description", "url", "version", "capabilities", "authentication", "links"];
const OLD_AGENT_LINKS = ["canonical_agent_card", "mcp_server", "documentation", "pricing", "signup"];
const OLD_MCP_KEYS = ["name", "description", "url", "transport", "authentication", "documentation", "pricing"];

test("both cards are valid JSON with every key of the old schema", () => {
  const agent = JSON.parse(files[1].text);
  const mcp = JSON.parse(files[2].text);
  for (const k of OLD_AGENT_KEYS) assert.ok(k in agent, `agent.json lacks ${k}`);
  for (const k of OLD_AGENT_LINKS) assert.ok(k in agent.links, `agent.json links lacks ${k}`);
  assert.deepEqual(Object.keys(agent.capabilities).sort(), ["pushNotifications", "streaming"]);
  assert.ok(Array.isArray(agent.authentication.schemes) && typeof agent.authentication.description === "string");
  for (const k of OLD_MCP_KEYS) assert.ok(k in mcp, `mcp.json lacks ${k}`);
  assert.equal(mcp.transport, "streamable-http");
  assert.equal(mcp.authentication.type, "bearer");
  assert.equal(mcp.url, "https://api.strale.io/mcp");
  assert.equal(agent.links.mcp_server, mcp.url);
});

test("each file leads with the L1 line and carries the positioning sentence", () => {
  assert.ok(renderLlmsTxt(SITE).startsWith(`# Strale\n\n> ${L1.headline}\n\n${SENTENCE}\n`));
  for (const card of [renderAgentCard(SITE), renderMcpCard(SITE)]) {
    assert.ok(String(card.description).startsWith(`${L1.headline} ${SENTENCE}`));
  }
});

test("no file contains a forbidden claim from the register, whatever scan_paths says", () => {
  const { register } = checkSchema(repo);
  const forbidden = register.filter((r: { status: string }) => r.status === "forbidden");
  assert.ok(forbidden.length > 10, "the register's forbidden rows were not loaded");
  for (const row of forbidden) {
    const m = compileMatcher(row);
    assert.ok(m, `${row.id} is not a valid pattern`);
    for (const f of files) assert.ok(!m.test(f.text), `${f.file} matches forbidden claim ${row.id}`);
  }
});

test("no retired trust framing, no universal x402 claim, no typed count", () => {
  for (const f of files) {
    assert.doesNotMatch(f.text, /trust layer|independently tested|\bSQS\b|quality[- ]scored|verified (data|capabilities)/i, `${f.file}: retired framing`);
    assert.doesNotMatch(f.text, /\ball\b[^.\n]{0,40}\b(x402|capabilities|tools)\b[^.\n]{0,40}\bx402\b/i, `${f.file}: universal x402 claim`);
    assert.doesNotMatch(f.text, /\b\d{2,}\+?\s/, `${f.file}: a typed number`);
    assert.doesNotMatch(f.text, /[€$]\s?\d/, `${f.file}: a typed price`);
  }
  // x402 is always scoped to eligible tools.
  const llms = files[0].text;
  assert.match(llms, /eligible tools/);
  assert.doesNotMatch(llms, /(?<!not )(every|all) tools?\b/i);
});

test("the host comes from the site config: it changes with it, and no literal site host is in the source", () => {
  const other = allMachineReadableText("https://preview.pages.test/");
  for (const [i, f] of files.entries()) {
    assert.match(f.text, /https:\/\/example\.test\/(docs|tools|signup|pricing)/, f.file);
    assert.doesNotMatch(f.text, /strale\.dev/, f.file);
    assert.doesNotMatch(f.text.replace(/api\.strale\.io/g, ""), /strale\.io/, f.file);
    assert.doesNotMatch(other[i].text, /example\.test/, f.file);
    assert.match(other[i].text, /https:\/\/preview\.pages\.test\/docs/, f.file);
    assert.doesNotMatch(other[i].text, /preview\.pages\.test\/\//, `${f.file}: doubled slash`);
  }
  for (const p of ["src/lib/machine-readable.ts", "src/pages/llms.txt.ts", "src/pages/.well-known/agent.json.ts", "src/pages/.well-known/mcp.json.ts"]) {
    const src = readFileSync(resolve(import.meta.dirname, "..", p), "utf8");
    assert.doesNotMatch(src.replace(/api\.strale\.io/g, ""), /strale\.(dev|io)/, p);
  }
});

// Where each linked API path is served. A path that is not here, or whose route is gone, fails.
const ROUTES: Record<keyof typeof API_PATHS, [file: string, needle: string]> = {
  llms: ["routes/llms-txt.ts", 'llmsTxtRoute.get("/llms.txt"'],
  x402Catalog: ["routes/x402-gateway-v2.ts", 'x402GatewayV2.get("/catalog"'],
  x402Discovery: ["app.ts", 'app.get("/.well-known/x402.json"'],
  facts: ["app.ts", 'app.route("/v1/platform/facts"'],
  openapi: ["app.ts", 'app.get("/openapi.json"'],
  mcp: ["app.ts", 'app.route("/mcp"'],
  agentCard: ["app.ts", 'app.route("/.well-known/agent-card.json"'],
  a2a: ["app.ts", 'app.route("/a2a"'],
  do: ["routes/do.ts", 'doRoute.post(\n  "/do"'],
};

test("every API path the files link to is a route in apps/api", () => {
  assert.deepEqual(Object.keys(ROUTES).sort(), Object.keys(API_PATHS).sort());
  for (const [k, [file, needle]] of Object.entries(ROUTES)) {
    const src = readFileSync(resolve(repo, "apps/api/src", file), "utf8");
    assert.ok(src.includes(needle), `${k} (${API_PATHS[k as keyof typeof API_PATHS]}): ${needle} not found in ${file}`);
  }
  // And the files link only to paths in the table.
  const linked = files.flatMap((f) => [...f.text.matchAll(/https:\/\/api\.strale\.io(\/[^\s"),]*)/g)].map((m) => m[1].replace(/\.$/, "")));
  const known = new Set(Object.values(API_PATHS) as string[]);
  for (const p of linked) assert.ok(known.has(p), `${p} is linked but not in API_PATHS`);
});
