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

test("Singapore, page speed and HTTP conversion use consistent examples and complete call instructions", () => {
  for (const [slug, guide] of [
    ["singapore-company-data", "singapore-company-lookup-api"],
    ["page-speed-test", "page-speed-test-api"],
    ["http-to-curl", "http-to-curl-api"],
  ]) {
    const html = read(slug), input = example(html, "ex-in"), output = example(html, "ex-out");
    const panel = html.match(/id="calls-panel-0"[^>]*>\s*<pre[^>]*><code[^>]*>([\s\S]*?)<\/code>/)?.[1];
    assert.ok(panel);
    const payload = decode(panel).match(/-d '([\s\S]*?)'/)?.[1];
    assert.ok(payload);
    assert.deepEqual(JSON.parse(payload).inputs, input, `${slug}: displayed example and REST request agree`);
    assert.equal(JSON.parse(payload).capability_slug, slug);
    assert.match(html, new RegExp(`href="/signup\\?tool=${slug}"`));
    assert.match(html, new RegExp(`href="/guides/${guide}"`));
    assert.ok(existsSync(resolve(dist, `guides/${guide}.html`)));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://strale.io/tools/${slug}"`));
    assert.doesNotMatch(html, /<form id="try-tool"/);
    const text = decode(html);
    if (slug === "singapore-company-data") {
      assert.equal(output.uen, input.uen);
      assert.match(text, /monthly snapshot/);
      assert.match(text, /Not returned by this tool; use entity_name/);
      assert.match(text, /not a full mailing address/);
    } else if (slug === "page-speed-test") {
      assert.equal(output.url, input.url); assert.equal(output.strategy, input.strategy);
      assert.match(text, /not a measured score for web.dev/);
      assert.match(text, /does not return CrUX field data, INP/);
      assert.match(text, /speed_index is also in milliseconds/);
    } else {
      assert.equal(input.method, "GET"); assert.equal("body" in input, false);
      assert.equal(output.url, input.url); assert.equal(output.method, input.method);
      assert.match(output.curl_command, /Accept: application\/json/);
      assert.doesNotMatch(text, /This is a test input for automated capability testing/);
      assert.match(text, /does not send the request/);
    }
  }
});

test("Belgian, SEC and VAT pages pair examples with the same API call and useful next steps", () => {
  for (const [slug, guide] of [
    ["belgian-company-data", "belgian-company-lookup-api"],
    ["sec-edgar-filings", "sec-edgar-filings-api"],
    ["vat-validate", "vat-number-validation-api"],
  ]) {
    const html = read(slug), input = example(html, "ex-in"), output = example(html, "ex-out");
    const decoded = decode(html);
    const calls = html.match(/id="calls-panel-0"[^>]*>\s*<pre[^>]*><code[^>]*>([\s\S]*?)<\/code>/)?.[1];
    assert.ok(calls, `${slug}: missing REST request`);
    for (const value of Object.values(input)) assert.ok(decode(calls).includes(JSON.stringify(value)), `${slug}: call lacks ${value}`);
    assert.match(html, new RegExp(`href="/signup\\?tool=${slug}"`));
    assert.match(html, new RegExp(`href="/guides/${guide}"`));
    assert.ok(existsSync(resolve(dist, `guides/${guide}.html`)));
    assert.match(html, new RegExp(`<link rel="canonical" href="https://strale.io/tools/${slug}"`));
    assert.match(html, /id="uses-title"/);
    assert.doesNotMatch(html, /<form id="try-tool"/);
    if (slug === "belgian-company-data") {
      assert.equal(String(output.registration_number).replaceAll(".", ""), input.enterprise_number);
      assert.equal(output.vat_number, `BE${input.enterprise_number}`);
      assert.match(decoded, /first provider match/);
      assert.match(decoded, /does not confirm VAT registration/);
    } else if (slug === "sec-edgar-filings") {
      assert.equal(output.ticker, input.ticker);
      assert.equal(output.returned, output.filings.length);
      assert.ok(output.returned <= input.limit);
      assert.equal(output.filings[0].form, input.form_type);
      assert.match(decoded, /not a live latest-filing result/);
      assert.match(decoded, /does not contain extracted financial figures/);
    } else {
      assert.equal(output.vat_number, input.vat_number);
      assert.doesNotMatch(decode(calls), /DE811128135/);
      assert.match(decoded, /may be empty even for a valid number/);
      assert.match(decoded, /stale: true/);
      assert.match(decoded, /credentials-pending/);
    }
  }
});

test("AML, Markdown and sanctions examples agree with their call inputs and lead to usable next steps", () => {
  for (const slug of ["aml-risk-score", "url-to-markdown", "sanctions-check"]) {
    const html = read(slug);
    const input = example(html, "ex-in"), output = example(html, "ex-out");
    const expected = slug === "aml-risk-score" ? input.entity_name : slug === "sanctions-check" ? input.name : input.url;
    assert.equal(output[slug === "aml-risk-score" ? "entity_name" : slug === "sanctions-check" ? "query" : "url"], expected);
    assert.match(decode(html), new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(html, new RegExp(`href="/signup\\?tool=${slug}"`));
    assert.match(html, /id="uses-title"/);
    assert.match(html, /id="results-title"/);
    assert.doesNotMatch(html, /example EORI number/);
    for (const [, href] of html.matchAll(/href="(\/(?:tools|guides)\/[^"?#]+)"/g)) assert.ok(existsSync(resolve(dist, `${href.slice(1)}.html`)), href);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://strale.io/tools/${slug}"`));
  }
  const markdown = read("url-to-markdown"), aml = read("aml-risk-score"), sanctions = read("sanctions-check");
  assert.match(markdown, /<form id="try-tool"/);
  assert.match(markdown, /opening excerpt/);
  assert.doesNotMatch(markdown, /Example Domain/);
  assert.equal(example(aml, "ex-in").entity_type, "company");
  assert.equal(example(aml, "ex-in").adverse_media_match, true);
  assert.equal(example(aml, "ex-out").risk_score, 20);
  assert.match(aml, /does not look up a person or company/);
  assert.match(sanctions, /not a live screening result/);
  assert.doesNotMatch(sanctions, /Vladimir|Spotify/);
  assert.match(sanctions, /ISO country code echoed in the response; does not filter the sanctions search/);
  assert.doesNotMatch(sanctions, /ISO country code filter/);
  assert.match(markdown, /Keep link destinations in the Markdown/);
  assert.doesNotMatch(aml + sanctions, /<form id="try-tool"/);
});

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
  assert.match(eori, /<code[^>]*>valid<\/code><\/th><td[^>]*>boolean or null<\/td>/);
  assert.match(eori, /<code[^>]*>trader_name<\/code><\/th><td[^>]*>string or null<\/td><td[^>]*>May be null; omitted when the input format is invalid<\/td>/);
  assert.match(eori, /valid: null/);
  assert.match(eori, /format_valid/);
  assert.doesNotMatch(read("pdf-extract"), /id="uses-title"/);
});
