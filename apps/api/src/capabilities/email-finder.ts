import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { checkMx, ROLE_PREFIXES } from "./email-validate.js";

/**
 * Email Finder — infer a person's most likely work email address from
 * their name and a company domain, ranked by confidence.
 *
 * THIS IS AN INFERENCE TOOL, NOT A VERIFIER.
 *   - No SMTP callback / VRFY / RCPT-TO probing is ever performed. The
 *     only mail-server signal used is domain-level MX record existence
 *     (via email-validate's checkMx — DNS only, no connection to the
 *     target mail server).
 *   - No field in this output is ever named or worded as "verified" /
 *     "confirmed" / "valid". Every candidate is a *guess*, ranked by
 *     how much public evidence backs it.
 *   - Confidence is evidence-linked: it is only "high" or "medium" when
 *     we found actual published addresses on the company's own site that
 *     corroborate the pattern (or the exact candidate address is itself
 *     published). Otherwise confidence is always "low" and the basis
 *     text says so explicitly. There is prior art in this repo for the
 *     opposite mistake — email-pattern-discover.ts used to have a
 *     `likely_exists` field that was a hardcoded prefix-membership check
 *     masquerading as deliverability evidence (see the comment at ~line
 *     104 of that file); it was removed for exactly that reason. Do not
 *     reintroduce that class of bug here.
 *   - Sources are limited to DNS MX records and the company's own public
 *     homepage/contact page fetched over plain HTTP via safeFetch
 *     (F-0-006 SSRF guard). No social network, people-directory, or
 *     aggregator scraping — Strale doctrine DEC-20260428-A Tier 1 is
 *     absolute: Strale never operates scrapers against third-party
 *     platforms.
 *
 * Zero external API cost — DNS + plain HTTP only. No vendor, no LLM.
 */

const USER_AGENT =
  "StraleBot/1.0 (+https://strale.dev/capabilities/email-finder; work-email pattern inference)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 300_000; // cap parsed HTML per request to 300KB
const MAX_FETCHES = 2; // homepage + at most one contact page

// ReDoS-safe — see the long rationale on the identical constant in
// domain-contact-extract.ts. The previous form's domain class contained the
// `.` that the following `\.` also matched, giving quadratic backtracking
// (7.9s on 32KB of crafted input, and this file parses up to ~600KB).
// This capability is currently DEACTIVATED, so the bug was not live here —
// fixed anyway so a future reactivation does not inherit it.
//
// NOTE: this constant is duplicated verbatim across two files, which is why
// one security fix had to be applied twice. That duplication is tracked as a
// follow-up to extract a shared capabilities/lib module.
const EMAIL_RE = /[a-zA-Z0-9._%+-]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.){1,8}[a-zA-Z]{2,24}/g;
const CONTACT_LINK_RE = /contact-us|get-in-touch|contact|kontakt/i;
// firstname.lastname / firstname_lastname style local part — used only to
// pick out address structures that look like a person's name, never to
// generate or expand candidates on their own.
const PERSONAL_NAME_LOCAL_PART_RE = /^[a-z]{2,}([._])[a-z]{2,}$/i;

// Unicode combining diacritical marks block, decimal 768–879 (hex 0300–036F).
// Used after String.normalize("NFD") to strip accents to ASCII (José →
// jose). Implemented as a code-point filter rather than a regex literal
// containing a combining character, since the latter is invisible/
// ambiguous in source, diffs, and editors.
const DIACRITIC_RANGE_START = 768;
const DIACRITIC_RANGE_END = 879;

function stripDiacriticMarks(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= DIACRITIC_RANGE_START && code <= DIACRITIC_RANGE_END) continue;
    out += ch;
  }
  return out;
}

type Confidence = "high" | "medium" | "low";

interface PatternTemplate {
  pattern: string;
  build: (first: string, last: string) => string;
}

// The standard pattern set every candidate is generated across. Order here
// is generation-preference order for the (common) case where no domain
// evidence disambiguates ties — NOT a claim about real-world popularity;
// every entry that isn't backed by evidence is ranked "low" regardless of
// its position in this list.
const PATTERN_TEMPLATES: PatternTemplate[] = [
  { pattern: "{first}.{last}", build: (f, l) => `${f}.${l}` },
  { pattern: "{first}{last}", build: (f, l) => `${f}${l}` },
  { pattern: "{f}{last}", build: (f, l) => `${f[0]}${l}` },
  { pattern: "{first}_{last}", build: (f, l) => `${f}_${l}` },
  { pattern: "{f}.{last}", build: (f, l) => `${f[0]}.${l}` },
  { pattern: "{first}", build: (f) => f },
  { pattern: "{last}.{first}", build: (f, l) => `${l}.${f}` },
];

/**
 * Read a fetch Response body capped at `maxBytes`, streaming so an
 * oversized response never gets fully buffered in memory first.
 */
async function readCapped(resp: Response, maxBytes = MAX_BODY_BYTES): Promise<string> {
  if (!resp.body) {
    const text = await resp.text();
    return text.slice(0, maxBytes);
  }
  const reader = resp.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
    }
  }
  try {
    await reader.cancel();
  } catch {
    // Best-effort cancel — response is already consumed enough for our needs.
  }
  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return buffer.subarray(0, maxBytes).toString("utf8");
}

/** Strip accents/diacritics to ASCII, lowercase, drop apostrophes. Hyphens are left intact — callers decide how to branch on them. */
function normalizeToken(raw: string): string {
  const withoutDiacritics = stripDiacriticMarks(raw.trim().toLowerCase().normalize("NFD"));
  return withoutDiacritics.replace(/['‘’]/g, ""); // strip straight/curly apostrophes (O'Brien → obrien)
}

/** First-name normalization: single token, hyphens joined (Jean-Paul → jeanpaul). */
function normalizeFirstName(raw: string): string {
  const t = normalizeToken(raw).replace(/-/g, "");
  return t.replace(/[^a-z0-9]/g, "");
}

/**
 * Surname normalization. Handles two shapes explicitly:
 *   - Multi-part surnames ("van der Berg"): use the last whitespace-
 *     separated token as the surname.
 *   - Hyphenated surnames (Smith-Jones): return BOTH the joined form
 *     (smithjones) and the hyphen-preserved form (smith-jones) as
 *     separate candidate variants, since real-world usage splits
 *     roughly evenly between the two.
 */
function surnameVariants(raw: string): string[] {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  const lastToken = tokens[tokens.length - 1] ?? "";
  const normalized = normalizeToken(lastToken);
  const variants = new Set<string>();
  if (normalized.includes("-")) {
    variants.add(normalized.replace(/-/g, "").replace(/[^a-z0-9]/g, ""));
    variants.add(normalized.replace(/[^a-z0-9-]/g, ""));
  } else {
    variants.add(normalized.replace(/[^a-z0-9]/g, ""));
  }
  return Array.from(variants).filter((v) => v.length > 0);
}

function detectEmailProvider(mxRecords: string[]): string | null {
  const mxJoined = mxRecords.join(" ").toLowerCase();
  if (mxJoined.includes("google") || mxJoined.includes("gmail")) return "Google Workspace";
  if (mxJoined.includes("outlook") || mxJoined.includes("microsoft")) return "Microsoft 365";
  if (mxJoined.includes("protonmail") || mxJoined.includes("proton")) return "ProtonMail";
  if (mxJoined.includes("zoho")) return "Zoho Mail";
  if (mxJoined.includes("mimecast")) return "Mimecast";
  if (mxJoined.includes("barracuda")) return "Barracuda";
  if (mxJoined.includes("pphosted") || mxJoined.includes("proofpoint")) return "Proofpoint";
  return null;
}

interface Candidate {
  email: string;
  pattern: string;
  confidence: Confidence;
  basis: string;
}

const CONFIDENCE_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };

registerCapability("email-finder", async (input: CapabilityInput) => {
  // ── Step 0: parse + validate input BEFORE any network call ──────────────
  let firstNameRaw = (input.first_name as string)?.trim() ?? "";
  let lastNameRaw = (input.last_name as string)?.trim() ?? "";

  if (!firstNameRaw || !lastNameRaw) {
    const fullName = ((input.name as string) ?? (input.full_name as string) ?? "").trim();
    if (fullName) {
      const tokens = fullName.split(/\s+/).filter(Boolean);
      if (tokens.length >= 2) {
        firstNameRaw = firstNameRaw || tokens[0];
        lastNameRaw = lastNameRaw || tokens.slice(1).join(" ");
      } else if (tokens.length === 1) {
        firstNameRaw = firstNameRaw || tokens[0];
      }
    }
  }

  if (!firstNameRaw) {
    throw new Error(
      "'first_name' is required (or provide 'name' / 'full_name' as \"First Last\").",
    );
  }
  if (!lastNameRaw) {
    throw new Error(
      "'last_name' is required (or provide 'name' / 'full_name' as \"First Last\").",
    );
  }
  if (firstNameRaw.length < 2) {
    throw new Error(`'first_name' must be at least 2 characters (got "${firstNameRaw}").`);
  }
  if (lastNameRaw.length < 2) {
    throw new Error(`'last_name' must be at least 2 characters (got "${lastNameRaw}").`);
  }

  const domainRaw =
    (input.domain as string) ??
    (input.company_domain as string) ??
    (input.website as string) ??
    (input.url as string) ??
    "";
  const domainTrimmed = typeof domainRaw === "string" ? domainRaw.trim() : "";

  if (!domainTrimmed || domainTrimmed.length < 2) {
    throw new Error(
      "'domain' is required (e.g. stripe.com). Aliases accepted: company_domain, website, url.",
    );
  }

  let hostname: string;
  try {
    hostname = new URL(
      domainTrimmed.startsWith("http") ? domainTrimmed : `https://${domainTrimmed}`,
    ).hostname;
  } catch {
    hostname = domainTrimmed;
  }
  hostname = hostname.replace(/^www\./i, "").toLowerCase();

  if (hostname.length < 3 || !hostname.includes(".")) {
    throw new Error(`'${domainTrimmed}' does not look like a valid domain (e.g. stripe.com).`);
  }

  const disclaimer =
    "All addresses returned are inferred from public domain conventions and/or publicly " +
    "published addresses. None have been verified for mailbox existence or deliverability — " +
    "email-finder never performs SMTP callback/VRFY/RCPT-TO probing. The caller is responsible " +
    "for establishing a lawful basis for processing this personal data under applicable " +
    "data-protection law before using it (e.g. GDPR Art. 6).";

  const first = normalizeFirstName(firstNameRaw);
  const lastVariants = surnameVariants(lastNameRaw);

  // Guard against names that normalize to nothing (e.g. punctuation-only
  // input) — still validated before any network call.
  if (first.length < 1) {
    throw new Error(
      `'first_name' ("${firstNameRaw}") contains no usable characters after normalization.`,
    );
  }
  if (lastVariants.length === 0) {
    throw new Error(
      `'last_name' ("${lastNameRaw}") contains no usable characters after normalization.`,
    );
  }

  // ── Step a: MX-record existence check (DNS only, no mail-server connection) ──
  const { has_mx: acceptsEmail, mx_records: mxRecords } = await checkMx(hostname);

  if (!acceptsEmail) {
    return {
      output: {
        domain: hostname,
        accepts_email: false,
        email_provider: null,
        first_name: firstNameRaw,
        last_name: lastNameRaw,
        best_candidate: null,
        candidates: [],
        evidence: {
          published_addresses_found: [],
          inferred_pattern: null,
          corroborating_count: 0,
        },
        disclaimer,
      },
      provenance: {
        source: "email-finder:dns",
        fetched_at: new Date().toISOString(),
      },
    };
  }

  const emailProvider = detectEmailProvider(mxRecords);

  // ── Step b: fetch homepage + at most one trivially-linked contact page ──
  const homepageUrl = `https://${hostname}/`;
  let homepageHtml = "";
  let fetchCount = 0;

  try {
    // F-0-006: user-supplied domain → safeFetch guards SSRF.
    const resp = await safeFetch(homepageUrl, {
      headers: { "User-Agent": USER_AGENT },
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    fetchCount++;
    if (resp.ok) {
      homepageHtml = await readCapped(resp);
    }
  } catch {
    // Homepage fetch failed — proceed with generic-pattern candidates only.
  }

  let contactHtml = "";
  if (homepageHtml && fetchCount < MAX_FETCHES) {
    let contactPageUrl: string | null = null;
    const linkMatches = homepageHtml.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
    for (const m of linkMatches) {
      const href = m[1];
      const linkText = (m[2] ?? "").replace(/<[^>]+>/g, "");
      if (!CONTACT_LINK_RE.test(href) && !CONTACT_LINK_RE.test(linkText)) continue;
      try {
        const resolved = new URL(href, homepageUrl);
        if (resolved.hostname.replace(/^www\./i, "").toLowerCase() !== hostname) continue; // same-host only
        contactPageUrl = resolved.toString();
        break;
      } catch {
        // Malformed href — skip.
      }
    }
    if (contactPageUrl) {
      try {
        const resp = await safeFetch(contactPageUrl, {
          headers: { "User-Agent": USER_AGENT },
          timeoutMs: FETCH_TIMEOUT_MS,
        });
        fetchCount++;
        if (resp.ok) {
          contactHtml = await readCapped(resp);
        }
      } catch {
        // Contact-page fetch is best-effort.
      }
    }
  }

  const combinedHtml = `${homepageHtml}\n${contactHtml}`;

  // ── Step c: harvest published @domain addresses, infer dominant separator ──
  const foundEmails = Array.from(
    new Set(
      (combinedHtml.match(EMAIL_RE) || [])
        .map((e) => e.toLowerCase())
        .filter((e) => e.split("@")[1] === hostname),
    ),
  );

  // Only addresses that structurally look like a person's name (two
  // alpha segments joined by "." or "_") are used as pattern evidence.
  // Role addresses (info@, sales@, ...) and bare single-token local parts
  // are excluded — we can't tell whether a bare token is a concatenated
  // name or a department alias, so we don't guess.
  const personalLookingEmails = foundEmails.filter((e) => {
    const localPart = e.split("@")[0].split("+")[0];
    return !ROLE_PREFIXES.has(localPart) && PERSONAL_NAME_LOCAL_PART_RE.test(localPart);
  });

  let inferredSeparator: "." | "_" | null = null;
  let dotCount = 0;
  let underscoreCount = 0;
  for (const e of personalLookingEmails) {
    const localPart = e.split("@")[0];
    if (localPart.includes(".")) dotCount++;
    else if (localPart.includes("_")) underscoreCount++;
  }
  let corroboratingCount = 0;
  if (dotCount > 0 || underscoreCount > 0) {
    if (dotCount >= underscoreCount) {
      inferredSeparator = ".";
      corroboratingCount = dotCount;
    } else {
      inferredSeparator = "_";
      corroboratingCount = underscoreCount;
    }
  }
  const inferredPattern =
    inferredSeparator === "." ? "{first}.{last}" : inferredSeparator === "_" ? "{first}_{last}" : null;

  const publishedSet = new Set(foundEmails);

  // ── Steps d+e: generate candidates across the standard pattern set, rank ──
  const byEmail = new Map<string, Candidate>();
  for (const last of lastVariants) {
    for (const template of PATTERN_TEMPLATES) {
      if (template.pattern === "{first}" && last !== lastVariants[0]) continue; // {first} alone doesn't depend on surname — only generate once
      const localPart = template.build(first, last);
      if (!localPart) continue;
      const email = `${localPart}@${hostname}`;
      if (byEmail.has(email)) continue; // dedupe across surname variants

      let confidence: Confidence;
      let basis: string;

      if (publishedSet.has(email)) {
        confidence = "high";
        basis = `This exact address is published on ${hostname}'s homepage or contact page.`;
      } else if (inferredPattern && template.pattern === inferredPattern) {
        confidence = corroboratingCount >= 3 ? "high" : "medium";
        const sepLabel = inferredSeparator === "." ? "dot-separated (first.last)" : "underscore-separated (first_last)";
        basis = `Matches the ${sepLabel} format of ${corroboratingCount} address${corroboratingCount === 1 ? "" : "es"} published on ${hostname}.`;
      } else {
        confidence = "low";
        basis = `Generic "${template.pattern}" convention guess — no domain-specific evidence found on ${hostname} for this pattern.`;
      }

      byEmail.set(email, { email, pattern: template.pattern, confidence, basis });
    }
  }

  const candidates = Array.from(byEmail.values()).sort(
    (a, b) => CONFIDENCE_RANK[b.confidence] - CONFIDENCE_RANK[a.confidence],
  );

  const bestCandidate = candidates.length > 0 ? candidates[0] : null;

  return {
    output: {
      domain: hostname,
      accepts_email: true,
      email_provider: emailProvider,
      first_name: firstNameRaw,
      last_name: lastNameRaw,
      best_candidate: bestCandidate,
      candidates,
      evidence: {
        published_addresses_found: personalLookingEmails.slice(0, 10),
        inferred_pattern: inferredPattern,
        corroborating_count: corroboratingCount,
      },
      disclaimer,
    },
    provenance: {
      source: contactHtml || homepageHtml ? "email-finder:dns+http" : "email-finder:dns",
      fetched_at: new Date().toISOString(),
    },
  };
});
