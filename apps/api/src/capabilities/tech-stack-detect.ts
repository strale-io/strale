import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readPageHtml } from "../lib/resource-limits.js";
import { assertTargetAllowed } from "./lib/tos-blocklist.js";
import { assertRedirectAllowed, assertRobotsAllowed } from "../lib/robots-txt.js";
import { STRALE_USER_AGENT, assertNotBlockStatus, siteAccessRefusal } from "../lib/site-access.js";
import { inputRefusal } from "../lib/capability-refusal.js";
import { looksLikeJsChallenge } from "./lib/web-provider.js";
import { detectTechnologies, extractCookieNames, groupByCategory } from "./lib/tech-detect.js";
import { hostnameOf, lookupTechDns, registrableGuess, type TechDns } from "./lib/tech-dns.js";

/**
 * Tech Stack Detection — identify technologies used by a website.
 *
 * Reads ONE public fetch of the homepage (response headers, Set-Cookie names,
 * HTML: meta tags, script and link URLs, inline markers) and the domain's
 * public DNS records (MX, TXT, NS, CNAME), and matches them against the
 * hand-written signature table in lib/tech-signatures.ts. A version is
 * reported when the page or a header states one.
 *
 * No external API, no LLM, no Browserless, no second page: direct HTTP fetch,
 * public DNS and pattern matching. Zero external cost.
 */

/** What this capability can and cannot see, repeated in every result. */
export const TECH_STACK_COVERAGE_NOTE =
  "Detected from one fetch of the homepage, its response headers and public DNS records (MX, TXT, NS, CNAME). " +
  "It lists what those show, not every technology the company uses: tools loaded only after JavaScript runs, " +
  "on other pages or on the server are not visible.";

const NON_HTML_CONTENT_TYPE = /^(?:image|audio|video)\/|^application\/(?:pdf|zip|octet-stream|gzip)/i;

// Names reported before the signature table existed; kept in the two signals
// below so a tool that was a chat widget or marketing automation stays one.
const LEGACY_CHAT_WIDGETS = ["Intercom", "Drift", "Crisp", "Zendesk"];
const LEGACY_MARKETING_AUTOMATION = ["HubSpot", "Marketo", "Pardot", "Mailchimp", "Optimizely"];

function dnsSummary(dns: TechDns) {
  return {
    status: dns.overall,
    records_found: { mx: dns.mx.length, txt: dns.txt.length, ns: dns.ns.length, cname: dns.cname.length },
    failed_lookups: dns.failures.map((f) => f.type),
  };
}

registerCapability("tech-stack-detect", async (input: CapabilityInput) => {
  const url = (input.url as string)?.trim() ?? "";
  const domain = (input.domain as string)?.trim() ?? "";
  const task = (input.task as string)?.trim() ?? "";

  const rawTarget = url || domain || task;
  if (!rawTarget || rawTarget.length < 3) {
    throw new Error("Provide 'url' (e.g. https://stripe.com) or 'domain' (e.g. stripe.com) to detect the technology stack.");
  }
  const target = rawTarget.startsWith("http") ? rawTarget : `https://${rawTarget}`;

  // Per-source ToS policy (P1 review H1, 2026-08-12): the tos-blocklist
  // header documents this exact capability serving 19 linkedin.com fetches
  // while linkedin-url-validate sat deactivated for that access. Every
  // arbitrary-URL fetch path carries the same blocklist.
  assertTargetAllowed(target);
  // DEC-20261023-A: robots.txt first, and an honest user agent. This
  // capability used to send a spoofed desktop-Chrome user agent, which the
  // data-access rule puts in the never lane (spoofing browser fingerprints).
  await assertRobotsAllowed(target);

  // F-0-006: safeFetch validates + re-validates redirects.
  const resp = await safeFetch(target, {
    headers: {
      "User-Agent": STRALE_USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(resp, "tech-stack-detect: non-2xx");
    assertNotBlockStatus(target, resp.status);
    throw new Error(`Could not fetch ${target} (HTTP ${resp.status}). Check the URL is correct and publicly accessible.`);
  }

  try {
    await assertRedirectAllowed(target, resp.url);
  } catch (err) {
    await discardBody(resp, "tech-stack-detect: redirect target disallowed by robots.txt");
    throw err;
  }

  const contentType = resp.headers.get("content-type") ?? "";
  if (NON_HTML_CONTENT_TYPE.test(contentType)) {
    await discardBody(resp, "tech-stack-detect: non-HTML content type");
    throw inputRefusal(
      `${target} returned ${contentType.split(";")[0]}, not a web page.`,
      "url",
      "Send 'url' (or 'domain') as the address of an HTML page, such as the site's homepage.",
    );
  }

  // Public DNS runs alongside the body read. The domain's MX, TXT and NS
  // describe the organisation, so they are read from the registrable domain;
  // CNAMEs from the host asked for and the host the fetch ended on.
  const inputHost = hostnameOf(target);
  const finalHost = hostnameOf(resp.url || target);
  const dnsPromise = lookupTechDns({
    domain: registrableGuess(inputHost.replace(/^www\./, "")),
    cnameHosts: [inputHost, finalHost],
  });

  const html = await readPageHtml(resp);
  if (looksLikeJsChallenge(html)) throw siteAccessRefusal(target, { kind: "challenge" });
  if (html.trim().length === 0) {
    throw new Error(`${target} returned an empty page (HTTP ${resp.status}), so there is nothing to analyse. Check the URL serves a page to automated requests.`);
  }

  const headers: Record<string, string> = {};
  resp.headers.forEach((value, name) => { headers[name.toLowerCase()] = value; });
  const cookieNames = extractCookieNames(resp.headers.getSetCookie?.() ?? []);
  const dns = await dnsPromise;

  const technologies = detectTechnologies({ headers, cookieNames, html, dns });
  const byCategory = groupByCategory(technologies);

  // A DNS fault is reported, never folded into an empty list: an empty
  // result with failed lookups must not read as "this domain uses nothing".
  const warnings: string[] = [];
  if (dns.overall === "unavailable" || dns.overall === "partial") {
    warnings.push(
      `Public DNS lookups failed (${dns.failures.map((f) => `${f.type}: ${f.code}`).join(", ")}). ` +
      "Technologies that only DNS shows (email provider, DNS host, hosting by CNAME) may be missing from this result.",
    );
  }
  if (technologies.length === 0) {
    warnings.push(
      "No technology was recognised in the homepage, its headers or public DNS. That does not mean none is in use: " +
      "tools loaded after JavaScript runs, on other pages or on the server are not visible to this check.",
    );
  }

  return {
    output: {
      url: resp.url,
      technologies_detected: technologies.length,
      technologies,
      by_category: byCategory,
      signals: {
        has_analytics: (byCategory.analytics || []).length > 0,
        has_chat_widget: technologies.some(t => t.category === "chat" || LEGACY_CHAT_WIDGETS.includes(t.name)),
        has_payment_processing: (byCategory.payment || []).length > 0,
        has_marketing_automation: technologies.some(t => t.category === "marketing-automation" || LEGACY_MARKETING_AUTOMATION.includes(t.name)),
        has_error_monitoring: (byCategory.monitoring || []).length > 0,
        has_tag_manager: (byCategory["tag-manager"] || []).length > 0,
        has_consent_management: (byCategory.consent || []).length > 0,
      },
      dns: dnsSummary(dns),
      warnings,
      coverage_note: TECH_STACK_COVERAGE_NOTE,
    },
    provenance: {
      source: "tech-stack-detect:algorithmic",
      fetched_at: new Date().toISOString(),
    },
  };
});
