import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
test("built free and paid tool pages carry their selection in desktop and mobile signup links", () => {
  for (const slug of ["pdf-extract", "iban-validate"]) {
    const html = readFileSync(resolve(dist, `tools/${slug}.html`), "utf8");
    assert.equal(html.match(new RegExp(`href="/signup\\?tool=${slug}"`, "g"))?.length, 2);
    assert.match(html, /id="call-title"/);
  }
  const home = readFileSync(resolve(dist, "index.html"), "utf8");
  assert.doesNotMatch(home, /href="\/signup\?tool=/);
});

test("built signup ships the actual catalogue allowlist and an initially hidden continuation", () => {
  const html = readFileSync(resolve(dist, "signup.html"), "utf8");
  const encoded = html.match(/data-signup-tools="([^"]+)"/)?.[1];
  assert.ok(encoded);
  const tools = JSON.parse(encoded.replaceAll("&#34;", '"').replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  assert.ok(tools.some((t: { slug: string; name: string }) => t.slug === "pdf-extract" && t.name === "PDF Data Extraction"));
  assert.match(html, /data-signup-continuation hidden/);
  assert.match(html, /data-signup-general-steps/);
});

test("built signup states the Terms and Privacy notice inside the form, before the submit button", () => {
  const html = readFileSync(resolve(dist, "signup.html"), "utf8");
  const form = html.match(/<form[^>]*data-signup-form[^>]*>([\s\S]*?)<\/form>/)?.[1];
  assert.ok(form, "the signup form is in the page");
  const notice = form.indexOf("data-signup-terms");
  const submit = form.indexOf('type="submit"');
  assert.ok(notice !== -1 && submit !== -1 && notice < submit, "the notice comes before the button that creates the account");
  const p = form.slice(notice, form.indexOf("</p>", notice));
  assert.match(p, /By creating an account, you agree to the/);
  assert.match(p, /href="\/terms"[^>]*>Terms of Service<\/a>/);
  assert.match(p, /href="\/privacy"[^>]*>Privacy Policy<\/a>/);
});
