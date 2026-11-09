import { test } from "node:test";
import assert from "node:assert/strict";
import { analyticsUrl, campaignFromUrl, campaignLink } from "../src/lib/campaign.ts";
const landing = "https://strale.io/tools/iban-validate?utm_source=x&utm_medium=organic_social&utm_campaign=tools_2026_11&utm_content=x-123-p1&token=private-test-token#private-test-fragment";
test("only bounded campaign labels survive; arbitrary queries and sources do not", () => {
  assert.deepEqual(campaignFromUrl(landing), {utm_source:"x",utm_medium:"organic_social",utm_campaign:"tools_2026_11",utm_content:"x-123-p1"});
  assert.deepEqual(campaignFromUrl("https://strale.io/?utm_source=private-test-token"), {});
  assert.deepEqual(campaignFromUrl("https://strale.io/?utm_source=linkedin&utm_campaign=example%40example.invalid&utm_content="+"a".repeat(65)), {utm_source:"linkedin"});
});
test("analytics strips secret queries and fragments from both landing and referrer URLs", () => {
  const clean = analyticsUrl(landing, "https://strale.io", campaignFromUrl(landing));
  assert.match(clean,/utm_source=x/); assert.doesNotMatch(clean,/private|token|#/);
  assert.equal(analyticsUrl("https://strale.io/audit/fixture?token=private#secret","https://strale.io",campaignFromUrl(landing)),"https://strale.io/audit/fixture");
  assert.equal(analyticsUrl("https://example.invalid/?token=private#secret","https://strale.io"),"https://example.invalid/");
  assert.equal(analyticsUrl("","https://strale.io"),"");
});
test("public navigation keeps attribution while external, private and fragment links are untouched", () => {
  const c=campaignFromUrl(landing);
  assert.match(campaignLink("/signup",landing,c),/utm_source=x/);
  for(const href of ["#example","mailto:test@example.invalid","https://example.invalid/","/audit/fixture?token=private","/topup"])
    assert.equal(campaignLink(href,landing,c),href);
  assert.equal(campaignLink("/signup?utm_source=linkedin",landing,c),"/signup?utm_source=linkedin");
});
