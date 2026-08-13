import { promises as dns } from "node:dns";
import { registerCapability, type CapabilityInput } from "./index.js";

// Email authentication posture for a domain: SPF, DMARC, MX, and optional
// DKIM selector probing — pure DNS, no vendor, no cost. Complements
// email-validate (mailbox syntax/deliverability) with the domain-side
// story: "can this domain's mail be trusted / will mail from it land".
//
// Demand evidence (catalog-buildout-strategy.md, 2026-08-12): email
// verification is one of the four things the top x402 customer buys;
// deliverability tooling (cold-outreach agents) all need exactly this
// check before sending.

// Common DKIM selectors probed when the caller doesn't supply one.
// Not exhaustive by design — a miss is reported as "not found via common
// selectors", never "domain has no DKIM".
const COMMON_DKIM_SELECTORS = ["default", "google", "selector1", "selector2", "k1", "s1", "dkim"];

const DOMAIN_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i;

async function txtRecords(name: string): Promise<string[]> {
  try {
    const records = await dns.resolveTxt(name);
    return records.map((chunks) => chunks.join(""));
  } catch {
    return [];
  }
}

interface DmarcTags {
  policy: string | null;
  subdomain_policy: string | null;
  pct: number | null;
}

function parseDmarcPolicy(record: string): DmarcTags {
  // RFC 7489 ABNF permits *WSP around '=' and tag values are case-
  // insensitive ("p = Reject" is a legal, fully-enforcing record).
  const get = (tag: string) =>
    record.match(new RegExp(`(?:^|;)\\s*${tag}\\s*=\\s*([^;\\s]+)`, "i"))?.[1]?.toLowerCase() ?? null;
  const pctRaw = get("pct");
  return {
    policy: get("p"),
    subdomain_policy: get("sp"),
    pct: pctRaw !== null && /^\d+$/.test(pctRaw) ? Number(pctRaw) : null,
  };
}

/**
 * A DKIM TXT hit requires a NON-EMPTY public key: RFC 6376 §3.6.1 defines
 * an empty p= as a REVOKED key, and a bare v=DKIM1 without material is not
 * a usable record.
 */
function isLiveDkimRecord(record: string): boolean {
  return /(^|;)\s*p\s*=\s*[A-Za-z0-9+/=]+/.test(record);
}

/**
 * DMARC lookup with the RFC 7489 §6.6.3 organizational-domain fallback:
 * a subdomain with no _dmarc record inherits the org domain's policy,
 * modulated by sp=. Without a public-suffix list we walk up at most two
 * labels and never below two labels — crossing a registrable boundary
 * just finds no record, which is the same answer as not walking.
 */
async function resolveDmarc(domain: string): Promise<{
  records: string[];
  tags: DmarcTags | null;
  effective_policy: string | null;
  inherited_from: string | null;
  status: "present" | "missing" | "invalid_multiple";
}> {
  const candidates: string[] = [domain];
  const labels = domain.split(".");
  for (let hop = 1; hop <= 2 && labels.length - hop >= 2; hop++) {
    candidates.push(labels.slice(hop).join("."));
  }

  for (const [i, cand] of candidates.entries()) {
    const txt = await txtRecords(`_dmarc.${cand}`);
    const dmarcRecords = txt.filter((r) => /^v\s*=\s*DMARC1(\s|;|$)/i.test(r));
    if (dmarcRecords.length === 0) continue;
    if (dmarcRecords.length > 1) {
      // RFC 7489 §6.6.3: multiple records at one name = treat as no DMARC.
      // Mirrors the SPF invalid_multiple semantics.
      return { records: dmarcRecords, tags: null, effective_policy: null, inherited_from: null, status: "invalid_multiple" };
    }
    const tags = parseDmarcPolicy(dmarcRecords[0]);
    const inherited = i > 0;
    // On inheritance, sp= governs subdomains; fall back to p= when absent.
    const effective = inherited ? (tags.subdomain_policy ?? tags.policy) : tags.policy;
    return {
      records: dmarcRecords,
      tags,
      effective_policy: effective,
      inherited_from: inherited ? cand : null,
      status: "present",
    };
  }
  return { records: [], tags: null, effective_policy: null, inherited_from: null, status: "missing" };
}

registerCapability("email-auth-check", async (input: CapabilityInput) => {
  for (const k of ["domain", "email", "task", "dkim_selector"] as const) {
    if (input[k] !== undefined && typeof input[k] !== "string") {
      throw new Error(`'${k}' must be a string. Received ${typeof input[k]}.`);
    }
  }
  const raw = ((input.domain as string) ?? (input.email as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!raw) throw new Error("'domain' is required (e.g. example.com). An email address is also accepted.");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) {
    throw new Error("IP addresses have no email-authentication DNS records — provide a domain name.");
  }

  // Accept a full email address and take its domain.
  const domain = raw.includes("@") ? raw.split("@").pop()!.trim() : raw.replace(/^https?:\/\//, "").split("/")[0];
  if (!DOMAIN_RE.test(domain)) {
    throw new Error(`'${domain}' is not a valid domain name.`);
  }

  const dkimSelector = ((input.dkim_selector as string) ?? "").trim();

  const [rootTxt, dmarc, mx] = await Promise.all([
    txtRecords(domain),
    resolveDmarc(domain),
    dns.resolveMx(domain).catch(() => [] as { exchange: string; priority: number }[]),
  ]);

  const spfRecords = rootTxt.filter((r) => /^v=spf1(\s|$)/i.test(r));
  const spfStatus = spfRecords.length === 1 ? "present" : spfRecords.length === 0 ? "missing" : "invalid_multiple";

  // DKIM: explicit selector if given, else probe the common list.
  const selectorsToProbe = dkimSelector ? [dkimSelector] : COMMON_DKIM_SELECTORS;
  const dkimResults = await Promise.all(
    selectorsToProbe.map(async (sel) => {
      const recs = await txtRecords(`${sel}._domainkey.${domain}`);
      return recs.some(isLiveDkimRecord) ? { selector: sel, record_present: true as const } : null;
    }),
  );
  const dkimFound = dkimResults.filter((r): r is { selector: string; record_present: true } => r !== null);

  // Verdict. "enforced" requires an enforcing policy at (effectively) full
  // coverage: pct < 100 means only that fraction of failing mail is
  // actioned (review M-2 — a p=reject; pct=0 domain enforces nothing).
  const enforcing = dmarc.effective_policy === "reject" || dmarc.effective_policy === "quarantine";
  const fullPct = dmarc.tags?.pct == null || dmarc.tags.pct >= 100;
  const authSummary =
    spfStatus === "present" && dmarc.status === "present"
      ? enforcing
        ? fullPct
          ? "enforced"
          : "partially_enforced"
        : "configured_monitor_only"
      : "incomplete";

  return {
    output: {
      domain,
      has_mx: mx.length > 0,
      mx_hosts: mx.sort((a, b) => a.priority - b.priority).slice(0, 5).map((m) => m.exchange),
      spf_status: spfStatus,
      spf_record: spfRecords[0] ?? null,
      dmarc_status: dmarc.status,
      dmarc_present: dmarc.status === "present",
      dmarc_record: dmarc.records[0] ?? null,
      dmarc_policy: dmarc.tags?.policy ?? null,
      dmarc_effective_policy: dmarc.effective_policy,
      dmarc_inherited_from: dmarc.inherited_from,
      dmarc_subdomain_policy: dmarc.tags?.subdomain_policy ?? null,
      dmarc_pct: dmarc.tags?.pct ?? null,
      // Honest DKIM semantics: found-via-probe vs not-found-via-common-
      // selectors. Absence of a probe hit is NOT proof the domain lacks DKIM.
      dkim_checked_selectors: selectorsToProbe,
      dkim_found: dkimFound,
      dkim_note: dkimSelector
        ? null
        : "DKIM probed via common selectors only — a miss does not prove the domain has no DKIM; pass dkim_selector for an exact check",
      auth_summary: authSummary,
    },
    provenance: {
      source: "dns",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
    },
  };
});
