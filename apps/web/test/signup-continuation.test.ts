import { test } from "node:test";
import assert from "node:assert/strict";
import { signupContinuation, toolSignupHref } from "../src/lib/signup-continuation.ts";
import { analyticsUrl, campaignFromUrl, campaignLink } from "../src/lib/campaign.ts";

const tools = [{ slug: "pdf-extract", name: "PDF Data Extraction" }, { slug: "iban-validate", name: "IBAN Validation" }];

test("a chosen tool survives signup and returns directly to its call instructions", () => {
  for (const tool of tools) {
    const signup = `https://strale.io${toolSignupHref(tool.slug)}`;
    assert.deepEqual(signupContinuation(signup, tools), { name: tool.name, href: `/tools/${tool.slug}#call-title` });
  }
});

test("social attribution survives both hops but private parameters never do", () => {
  const landing = "https://strale.io/tools/pdf-extract?utm_source=linkedin&utm_medium=organic_social&utm_campaign=tools_nov_2026&utm_content=linkedin-123-p1&token=private";
  const signup = campaignLink(toolSignupHref("pdf-extract"), landing, campaignFromUrl(landing));
  assert.match(signup, /tool=pdf-extract/);
  assert.doesNotMatch(signup, /token|private/);
  const next = signupContinuation(signup + "&api_key=private", tools)!;
  const url = new URL(next.href);
  assert.equal(url.origin, "https://strale.io");
  assert.equal(url.pathname, "/tools/pdf-extract");
  assert.equal(url.hash, "#call-title");
  assert.deepEqual(campaignFromUrl(next.href), campaignFromUrl(landing));
  assert.doesNotMatch(next.href, /api_key|private|tool=/);
  assert.doesNotMatch(analyticsUrl(signup, "https://strale.io", campaignFromUrl(signup)), /tool=|token|private/);
});

test("invalid, unknown, duplicate and URL-valued context falls back safely", () => {
  for (const query of ["", "?tool=unknown", "?tool=pdf-extract&tool=iban-validate", "?tool=../../topup", "?tool=https://example.invalid", "?tool=%2F%2Fevil.invalid", "?tool=%3Cscript%3E", "?tool=" + "a".repeat(81)]) {
    assert.equal(signupContinuation("https://strale.io/signup" + query, tools), null);
  }
  assert.equal(signupContinuation("not a URL", tools), null);
  assert.equal(toolSignupHref("../topup"), "/signup");
  assert.equal(toolSignupHref(), "/signup");
});
