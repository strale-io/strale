import { describe, expect, it } from "vitest";
import { looksLikeJsChallenge } from "./web-provider.js";

// Table test for the JS-challenge interstitial detector (P2 review M-8: the
// riskiest new pure function shipped without tests). False positives are the
// dangerous direction — at tier 3 a false positive throws away a perfectly
// rendered page and counts as a capability failure toward the breaker.

describe("looksLikeJsChallenge", () => {
  const challenges = [
    // The live EUR-Lex interstitial that motivated the detector.
    `<html><head><style>body { font-family: "Arial"; }</style></head><body>JavaScript is disabled
     In order to continue, we need to verify that you're not a robot. This requires JavaScript.
     Enable JavaScript and then reload the page.</body></html>`,
    `<html><body>Checking your browser before accessing example.com … please wait</body></html>`,
    `<html><script>window.__cf_chl_opt = {}</script></html>`,
    `<html><div id="cf-browser-verification"></div></html>`,
  ];
  for (const [i, html] of challenges.entries()) {
    it(`detects challenge variant ${i + 1}`, () => {
      expect(looksLikeJsChallenge(html)).toBe(true);
    });
  }

  const legitimate = [
    // An article ABOUT bot protection must not trip the detector.
    `<html><body><h1>How CAPTCHA works</h1><p>Sites ask users to verify they are human.
     Some robots defeat simple checks. Cloudflare and Imperva sell bot protection.</p></body></html>`,
    // Imperva-fronted pages inject _Incapsula_Resource script tags into
    // NORMALLY SERVED content — that alone is not a challenge (review M-1).
    `<html><head><script src="/_Incapsula_Resource?SWJIYLWA=abc123"></script></head>
     <body><h1>Quarterly results</h1><p>${"Real content. ".repeat(50)}</p></body></html>`,
    `<html><body><h1>Search results - EUR-Lex</h1><p>Regulation (EU) 2024/1689 …</p></body></html>`,
  ];
  for (const [i, html] of legitimate.entries()) {
    it(`does not flag legitimate page ${i + 1}`, () => {
      expect(looksLikeJsChallenge(html)).toBe(false);
    });
  }
});
