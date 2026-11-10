import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const read = (slug: string) => readFileSync(resolve(dist, `tools/${slug}.html`), "utf8");
const decode = (s: string) => s.replace(/<[^>]*>/g, "").replaceAll("&quot;", '"').replaceAll("&#34;", '"').replaceAll("&gt;", ">").replaceAll("&lt;", "<").replaceAll("&amp;", "&");
function example(html: string, id: string) {
  const code = html.match(new RegExp(`id="${id}-panel-0"[^>]*>\\s*<pre[^>]*><code[^>]*>([\\s\\S]*?)</code>`))?.[1];
  assert.ok(code, `missing ${id} example`);
  return JSON.parse(decode(code));
}

test("DNS and EORI render paired usable examples, crawlable guides and selected-tool signup", () => {
  for (const [slug, field, value, guide] of [
    ["dns-lookup", "domain", "strale.io", "dns-lookup-agent-python"],
    ["eori-validate", "eori", "SE5560125790", "eori-number-validation-agent"],
  ]) {
    const html = read(slug);
    assert.equal(example(html, "ex-in")[field], value);
    assert.equal(example(html, "ex-out")[slug === "dns-lookup" ? "domain" : "eori_number"], value);
    assert.match(html, new RegExp(`href="/signup\\?tool=${slug}"`));
    assert.match(html, /id="call-title"/);
    assert.match(html, new RegExp(`href="/guides/${guide}"`));
    assert.ok(existsSync(resolve(dist, `guides/${guide}.html`)));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://strale.io/tools/${slug}"`));
  }
});

test("DNS trial is discoverable without signup and EORI never presents a free run form", () => {
  const dns = read("dns-lookup"), eori = read("eori-validate");
  assert.match(dns, /href="#try-tool"/);
  assert.equal(dns.match(/data-try\s/g)?.length, 1);
  assert.match(dns, /<form id="try-tool"/);
  assert.ok(Object.keys(example(dns, "ex-out")).length <= 6, "keep the first example short");
  assert.doesNotMatch(eori, /data-try\s/);
  assert.equal(example(eori, "ex-out").valid, true);
  assert.match(eori, /<code>valid<\/code><\/th><td>boolean or null<\/td>/);
  assert.match(eori, /<code>trader_name<\/code><\/th><td>string or null<\/td><td>May be null; omitted when the input format is invalid<\/td>/);
  assert.match(eori, /valid: null/);
  assert.match(eori, /format_valid/);
  assert.doesNotMatch(read("pdf-extract"), /id="uses-title"/);
});
