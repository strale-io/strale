/**
 * The signature engine behind tech-stack-detect and company-tech-stack.
 *
 * Fixtures are small synthetic pages, headers and DNS answers. Every test
 * asserts a detection or a version that exists only because of the signature
 * table or the engine, so removing either makes it fail.
 */
import { describe, expect, it } from "vitest";
import {
  cleanVersion,
  detectTechnologies,
  extractCookieNames,
  groupByCategory,
  parseGenericGenerator,
  parseMetaTags,
  scanWindow,
  type DetectInput,
} from "./tech-detect.js";
import { TECH_CATEGORIES, TECH_SIGNATURES, normalizeTechName } from "./tech-signatures.js";

const NO_DNS = { mx: [], txt: [], ns: [], cname: [] };

function detect(partial: Partial<DetectInput>) {
  return detectTechnologies({ headers: {}, html: "", dns: NO_DNS, ...partial });
}

function byName(partial: Partial<DetectInput>) {
  return Object.fromEntries(detect(partial).map((t) => [t.name, t]));
}

describe("detection from HTML", () => {
  it("recognises analytics, tag manager, chat, CRM, consent and payment tools by their install snippets", () => {
    const html = `<html><head>
      <script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>
      <script src="https://static.hotjar.com/c/hotjar-123.js"></script>
      <script src="https://cdn.posthog.com/static/array.js"></script>
      <script src="https://js.hs-scripts.com/12345.js"></script>
      <script src="https://consent.cookiebot.com/uc.js"></script>
      <script src="https://js.stripe.com/v3/"></script>
      <script src="https://embed.tawk.to/abc/default"></script>
      <script src="https://snap.licdn.com/li.lms-analytics/insight.min.js"></script>
    </head><body></body></html>`;
    const found = byName({ html });
    for (const name of ["Google Tag Manager", "Hotjar", "PostHog", "HubSpot", "Cookiebot", "Stripe", "Tawk.to", "LinkedIn Insight Tag"]) {
      expect(found[name], name).toBeDefined();
    }
    expect(found["Google Tag Manager"].category).toBe("tag-manager");
    expect(found.Cookiebot.category).toBe("consent");
    expect(found["Tawk.to"].category).toBe("chat");
    expect(found.Stripe.category).toBe("payment");
  });

  it("recognises site builders and frameworks from their markers", () => {
    const framer = byName({ html: `<div data-framer-name="Hero"></div><img src="https://framerusercontent.com/images/a.png">` });
    expect(framer.Framer?.category).toBe("site-builder");

    const nuxt = byName({ html: `<div id="__nuxt"></div><script src="/_nuxt/entry.js"></script>` });
    expect(nuxt["Nuxt.js"]).toBeDefined();

    const astro = byName({ html: `<astro-island uid="1"></astro-island><script src="/_astro/client.abc.js"></script>` });
    expect(astro.Astro).toBeDefined();

    const webflow = byName({ html: `<html data-wf-domain="x.test" data-wf-page="1"><script src="https://cdn.prod.website-files.com/a/js/webflow.js"></script>` });
    expect(webflow.Webflow).toBeDefined();
  });

  it("recognises a tool loaded from a vendor host that the old table did not know", () => {
    const found = byName({
      html: `<script src="https://cdn.weglot.com/weglot.min.js"></script><script src="https://script.tapfiliate.com/tapfiliate.js"></script><link rel="preconnect" href="https://my.hellobar.com">`,
    });
    expect(found.Weglot?.category).toBe("localization");
    expect(found.Tapfiliate).toBeDefined();
    expect(found.Hellobar).toBeDefined();
  });

  it("does not report a tool a page only mentions or links to", () => {
    const html = `<html><body>
      <p>Works with Zendesk, HubSpot, Marketo and Tailwind-style utilities. Built on Webflow? See https://www.hubspot.com/pricing
      and <a href="https://www.wix.com/">Wix</a>, <a href="https://webflow.com/">Webflow</a>, <a href="https://www.g2.com/products/x/reviews">our G2 page</a>.</p>
      <img src="/img/integrations/hubspot.webp" alt="HubSpot"><img src="/img/marketo.webp" alt="Marketo">
    </body></html>`;
    const names = detect({ html }).map((t) => t.name);
    for (const falsePositive of ["Zendesk", "HubSpot", "Marketo", "Wix", "Webflow", "G2", "Tailwind CSS"]) {
      expect(names, falsePositive).not.toContain(falsePositive);
    }
  });

  it("reports Google Analytics at medium confidence when only the tag manager is present", () => {
    const viaManagerOnly = byName({ html: `<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>` });
    expect(viaManagerOnly["Google Analytics"]?.confidence).toBe("medium");
    const direct = byName({ html: `<script>gtag('config', 'G-ABC123');</script>` });
    expect(direct["Google Analytics"]?.confidence).toBe("high");
  });

  it("reads a late tag in a large page", () => {
    const filler = "<p>x</p>".repeat(200_000); // ~1.6 MB
    const html = `<html><head></head><body>${filler}<script src="https://js.stripe.com/v3/"></script></body></html>`;
    expect(byName({ html }).Stripe).toBeDefined();
  });

  it("adds technologies that a detected one implies, at medium confidence", () => {
    const found = byName({ html: `<script id="__NEXT_DATA__" type="application/json">{}</script><script src="/_next/static/chunks/main.js"></script>` });
    expect(found["Next.js"].confidence).toBe("high");
    expect(found.React.confidence).toBe("medium");
    expect(found.React.evidence).toBe("implied by Next.js");
  });
});

describe("detection from headers and cookies", () => {
  it("recognises servers, platforms and security tooling from response headers", () => {
    const found = byName({
      headers: {
        server: "LiteSpeed",
        "x-powered-by": "PHP/8.2.10",
        "x-vercel-id": "iad1::abc",
        "strict-transport-security": "max-age=31536000",
        via: "1.1 abcdef.cloudfront.net (CloudFront)",
      },
    });
    expect(found.LiteSpeed.category).toBe("web-server");
    expect(found.PHP).toBeDefined();
    expect(found.Vercel).toBeDefined();
    expect(found.HSTS).toBeDefined();
    expect(found["Amazon CloudFront"]).toBeDefined();
  });

  it("recognises technologies from Set-Cookie names without reading values", () => {
    const cookieNames = extractCookieNames([
      "PHPSESSID=secret-value; path=/; HttpOnly",
      "laravel_session=another-secret; path=/",
      "__cf_bm=zzz; Secure",
    ]);
    expect(cookieNames).toEqual(["PHPSESSID", "laravel_session", "__cf_bm"]);
    const found = byName({ cookieNames });
    expect(found.PHP.evidence).toBe("cookie PHPSESSID");
    expect(found.Laravel).toBeDefined();
    expect(found.Cloudflare).toBeDefined();
    expect(JSON.stringify(found)).not.toContain("secret-value");
  });
});

describe("detection from public DNS", () => {
  it("names the email provider from MX and SPF includes", () => {
    const found = byName({
      dns: {
        mx: [{ exchange: "aspmx.l.google.com", priority: 1 }, { exchange: "alt1.aspmx.l.google.com", priority: 5 }],
        txt: ["v=spf1 include:_spf.google.com include:sendgrid.net include:servers.mcsv.net ~all"],
        ns: [],
        cname: [],
      },
    });
    expect(found["Google Workspace"]).toMatchObject({ category: "email", evidence: "DNS MX record aspmx.l.google.com" });
    expect(found.SendGrid).toMatchObject({ category: "email-delivery", evidence: "DNS TXT record" });
    expect(found.Mailchimp).toBeDefined();
  });

  it("recognises Microsoft 365 from its MX host and a domain-verification TXT", () => {
    const viaMx = byName({ dns: { ...NO_DNS, mx: [{ exchange: "example-test.mail.protection.outlook.com", priority: 0 }] } });
    expect(viaMx["Microsoft 365"]).toBeDefined();
    const viaTxt = byName({ dns: { ...NO_DNS, txt: ["MS=ms12345678"] } });
    expect(viaTxt["Microsoft 365"]).toBeDefined();
  });

  it("names the DNS host from NS and the hosting platform from a CNAME", () => {
    const found = byName({
      dns: {
        mx: [],
        txt: [],
        ns: ["ada.ns.cloudflare.com", "bob.ns.cloudflare.com"],
        cname: ["cname.vercel-dns.com", "shops.myshopify.com"],
      },
    });
    expect(found["Cloudflare DNS"].category).toBe("dns");
    expect(found.Shopify?.evidence).toBe("DNS CNAME record shops.myshopify.com");
  });

  it("reads nothing from DNS when no DNS records are passed", () => {
    expect(detect({ dns: null }).map((t) => t.name)).toEqual([]);
  });
});

describe("version extraction", () => {
  it("reads versions from meta generator tags", () => {
    const found = byName({
      html: `<meta name="generator" content="WordPress 6.4.2"><meta content="Hugo 0.121.0" name="generator"><meta name="generator" content="Elementor 3.18.1; features: x; settings: y">`,
    });
    expect(found.WordPress.version).toBe("6.4.2");
    expect(found.Hugo.version).toBe("0.121.0");
    expect(found.Elementor.version).toBe("3.18.1");
    expect(found.WordPress.evidence).toBe("meta generator tag");
  });

  it("reads a version from a generator tag no signature claims", () => {
    const found = byName({ html: `<meta name="generator" content="ThinkRank 2.9.0">` });
    expect(found.ThinkRank).toMatchObject({ version: "2.9.0", category: "cms", evidence: "meta generator tag" });
  });

  it("reads versions from script and stylesheet URLs", () => {
    const found = byName({
      html: `
        <script src="/wp-includes/js/wp-embed.min.js?ver=6.3.1"></script>
        <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
        <script src="https://unpkg.com/react@18.2.0/umd/react.production.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></script>
        <link rel="stylesheet" href="https://use.fontawesome.com/releases/v6.4.0/css/all.css">
        <script src="https://browser.sentry-cdn.com/7.64.0/bundle.min.js"></script>`,
    });
    expect(found.WordPress.version).toBe("6.3.1");
    expect(found.jQuery.version).toBe("3.6.0");
    expect(found.Bootstrap.version).toBe("5.3.2");
    expect(found.React.version).toBe("18.2.0");
    expect(found.GSAP.version).toBe("3.12.2");
    expect(found["Font Awesome"].version).toBe("6.4.0");
    expect(found.Sentry.version).toBe("7.64.0");
  });

  it("reads the Angular version and a Tailwind version stated in the page", () => {
    const found = byName({ html: `<app-root ng-version="17.0.5"></app-root><style>/*! tailwindcss v3.4.1 | MIT License */</style>` });
    expect(found.Angular.version).toBe("17.0.5");
    expect(found["Tailwind CSS"].version).toBe("3.4.1");
  });

  it("reads versions from server and framework headers", () => {
    const found = byName({
      headers: { server: "nginx/1.24.0 (Ubuntu)", "x-powered-by": "PHP/8.2.10", "x-aspnet-version": "4.0.30319", "x-generator": "Drupal 10 (https://www.drupal.org)" },
    });
    expect(found.Nginx.version).toBe("1.24.0");
    expect(found.Ubuntu.category).toBe("operating-system");
    expect(found.PHP.version).toBe("8.2.10");
    expect(found["ASP.NET"].version).toBe("4.0.30319");
    expect(found.Drupal.version).toBe("10");
  });

  it("leaves version null when none is stated", () => {
    const found = byName({ html: `<script src="https://js.stripe.com/v3/"></script>`, headers: { server: "nginx" } });
    expect(found.Stripe.version).toBeNull();
    expect(found.Nginx.version).toBeNull();
  });

  it("prefers the tool's own generator tag over a ?ver= on a file path", () => {
    const found = byName({
      html: `<link rel="stylesheet" href="/wp-content/plugins/elementor/assets/css/frontend.min.css?ver=3.1.0">
             <meta name="generator" content="Elementor 3.18.1; features: x">`,
    });
    expect(found.Elementor.version).toBe("3.18.1");
  });

  it("fills a version a later source states for a tool an earlier source found without one", () => {
    const found = byName({
      html: `<link rel="stylesheet" href="/wp-content/themes/x/style.css"><meta name="generator" content="WordPress 6.5">`,
    });
    expect(found.WordPress.version).toBe("6.5");
  });

  it("drops a captured value that is not a version", () => {
    expect(cleanVersion("v1.2.3")).toBe("1.2.3");
    expect(cleanVersion("c439c68")).toBeNull();
    expect(cleanVersion("latest")).toBeNull();
    expect(cleanVersion("1 2 3")).toBeNull();
    expect(cleanVersion(undefined)).toBeNull();
    expect(byName({ html: `<meta name="generator" content="Framer c439c68">` }).Framer.version).toBeNull();
  });
});

describe("helpers", () => {
  it("parses meta tags with the attributes in either order", () => {
    const metas = parseMetaTags(`<meta content="A 1.0" name="generator"><META NAME='author' CONTENT='Someone'><meta property="og:title" content="T">`);
    expect(metas).toEqual([
      { name: "generator", content: "A 1.0" },
      { name: "author", content: "Someone" },
      { name: "og:title", content: "T" },
    ]);
  });

  it("splits a generator string into name and version, and keeps a bare name", () => {
    expect(parseGenericGenerator("Foo Builder 4.2.1")).toEqual({ name: "Foo Builder", version: "4.2.1" });
    expect(parseGenericGenerator("Foo Builder v4.2; extra settings")).toEqual({ name: "Foo Builder", version: "4.2" });
    expect(parseGenericGenerator("Bar")).toEqual({ name: "Bar", version: null });
    expect(parseGenericGenerator("")).toBeNull();
  });

  it("groups names by category", () => {
    expect(groupByCategory([{ name: "A", category: "x" }, { name: "B", category: "x" }, { name: "C", category: "y" }])).toEqual({ x: ["A", "B"], y: ["C"] });
  });

  it("scans the start and end of a very large page", () => {
    const big = "a".repeat(5_000_000);
    const win = scanWindow(`${big}MARK`);
    expect(win.length).toBeLessThan(1_000_100);
    expect(win.endsWith("MARK")).toBe(true);
  });
});

describe("the signature table", () => {
  it("uses only declared categories and one category per technology name", () => {
    const categoryOf = new Map<string, string>();
    for (const sig of TECH_SIGNATURES) {
      expect(TECH_CATEGORIES as readonly string[], sig.name).toContain(sig.category);
      const key = normalizeTechName(sig.name);
      if (categoryOf.has(key)) expect(sig.category, `${sig.name} has two categories`).toBe(categoryOf.get(key));
      categoryOf.set(key, sig.category);
    }
  });

  it("gives every signature a way to be detected, or makes it the target of an implication", () => {
    const implied = new Set(TECH_SIGNATURES.flatMap((s) => (s.implies ?? []).map(normalizeTechName)));
    for (const sig of TECH_SIGNATURES) {
      const sources = [sig.html, sig.headers && Object.keys(sig.headers), sig.cookies, sig.meta && Object.keys(sig.meta), sig.mx, sig.txt, sig.ns, sig.cname];
      const hasSource = sources.some((s) => Array.isArray(s) && s.length > 0);
      expect(hasSource || implied.has(normalizeTechName(sig.name)), sig.name).toBe(true);
    }
  });

  it("names every implied technology that exists in the table", () => {
    const names = new Set(TECH_SIGNATURES.map((s) => normalizeTechName(s.name)));
    for (const sig of TECH_SIGNATURES) for (const implied of sig.implies ?? []) expect(names.has(normalizeTechName(implied)), `${sig.name} implies ${implied}`).toBe(true);
  });

  it("stays fast on a large page built to trip backtracking", () => {
    const hostile = [
      "wp-content/plugins/".repeat(20_000),
      "<script src=\"" + "a".repeat(200_000) + "\"></script>",
      "<meta name=\"generator\" content=\"" + "1.".repeat(50_000) + "\">",
      "bootstrap-".repeat(30_000),
    ].join("\n");
    const start = Date.now();
    detectTechnologies({ headers: { server: "nginx/".repeat(10_000) }, html: hostile, dns: NO_DNS });
    expect(Date.now() - start).toBeLessThan(4000);
  });
});
