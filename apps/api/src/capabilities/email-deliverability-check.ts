import { inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";
import { dnsOrEmpty, requireAnyLeg, UpstreamUnavailableError } from "../lib/upstream-result.js";

// F-0-006 Bucket C: pure DNS resolution (MX, SPF, DMARC records) on the
// user's email domain. No HTTP fetch, no socket to the resolved IP.
// validateHost not required.


// Common DKIM selectors to probe
const DKIM_SELECTORS = [
  "google",
  "default",
  "selector1",
  "selector2",
  "k1",
  "dkim",
  "mail",
];

// Every DNS lookup below goes through dnsOrEmpty: a record the domain does not
// have reads as absent, and a resolver that could not answer throws (unbilled,
// retried) instead of reading as "no SPF / no DMARC / not blacklisted".

// Common DNS blocklists
const DNSBLS = [
  "zen.spamhaus.org",
  "bl.spamcop.net",
  "b.barracudacentral.org",
];

registerCapability("email-deliverability-check", async (input: CapabilityInput) => {
  const raw = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!raw) throw inputRefusal("'domain' is required. Provide a domain to check email deliverability.", "domain", "Send 'domain' as a DNS hostname such as example.com.");

  // Clean domain
  const domain = raw
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  let score = 0;
  const issues: string[] = [];
  const recommendations: string[] = [];

  // 1. Check if domain resolves. No A record falls back to AAAA; having
  // neither is not fatal, since a domain may still receive email via MX.
  let ipAddresses: string[] = await dnsOrEmpty(() => dns.resolve4(domain), "DNS A query");
  const hasIpv4 = ipAddresses.length > 0;
  if (!hasIpv4) {
    ipAddresses = await dnsOrEmpty(() => dns.resolve6(domain), "DNS AAAA query");
    if (ipAddresses.length === 0) {
      issues.push("Domain has no A/AAAA records (may still receive email via MX)");
    }
  }

  // 2. MX records
  const mxRecords: Array<{ priority: number; exchange: string }> =
    (await dnsOrEmpty(() => dns.resolveMx(domain), "DNS MX query"))
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({ priority: r.priority, exchange: r.exchange }));

  if (mxRecords.length > 0) {
    score += 20;
  } else {
    issues.push("No MX records found");
    recommendations.push("Configure MX records pointing to your mail server.");
  }

  // 3. SPF record
  let spfRecord: string | null = null;
  let spfExists = false;
  let spfValid = false;
  let spfMechanism: string | null = null;
  {
    const txtRecords = await dnsOrEmpty(() => dns.resolveTxt(domain), "DNS TXT query");
    const spfEntry = txtRecords
      .map((r) => r.join(""))
      .find((r) => r.startsWith("v=spf1"));
    if (spfEntry) {
      spfExists = true;
      spfRecord = spfEntry;
      score += 15;

      // Check enforcement mechanism
      if (spfEntry.includes("-all")) {
        spfMechanism = "-all (hard fail)";
        spfValid = true;
        score += 5;
      } else if (spfEntry.includes("~all")) {
        spfMechanism = "~all (soft fail)";
        spfValid = true;
      } else if (spfEntry.includes("?all")) {
        spfMechanism = "?all (neutral)";
        recommendations.push("Strengthen SPF from ?all to ~all or -all.");
      } else if (spfEntry.includes("+all")) {
        spfMechanism = "+all (pass all — dangerous)";
        issues.push("SPF uses +all which allows any server to send email for this domain");
        recommendations.push("Change SPF from +all to -all or ~all immediately.");
      }
    }
  }

  if (!spfExists) {
    issues.push("No SPF record found");
    recommendations.push("Add a TXT record with v=spf1 specifying your authorized mail servers.");
  }

  // 4. DMARC record
  let dmarcExists = false;
  let dmarcRecord: string | null = null;
  let dmarcPolicy: string | null = null;
  {
    const dmarcTxt = await dnsOrEmpty(() => dns.resolveTxt(`_dmarc.${domain}`), "DNS DMARC TXT query");
    const dmarcEntry = dmarcTxt
      .map((r) => r.join(""))
      .find((r) => r.startsWith("v=DMARC1"));
    if (dmarcEntry) {
      dmarcExists = true;
      dmarcRecord = dmarcEntry;
      score += 15;

      // Extract policy
      const policyMatch = dmarcEntry.match(/;\s*p\s*=\s*(none|quarantine|reject)/i);
      if (policyMatch) {
        dmarcPolicy = policyMatch[1].toLowerCase();
        if (dmarcPolicy === "reject") {
          score += 10;
        } else if (dmarcPolicy === "quarantine") {
          score += 5;
          recommendations.push("Consider upgrading DMARC policy from quarantine to reject.");
        } else {
          // p=none
          issues.push("DMARC policy is set to 'none' (monitoring only)");
          recommendations.push("Upgrade DMARC policy from none to quarantine or reject after monitoring.");
        }
      }
    }
  }

  if (!dmarcExists) {
    issues.push("No DMARC record found");
    recommendations.push("Add a DMARC record at _dmarc." + domain + " with at minimum v=DMARC1; p=none; rua=mailto:dmarc@" + domain);
  }

  // 5. DKIM check (probe common selectors)
  let dkimDetected = false;
  let dkimSelectorFound: string | null = null;
  const dkimChecks = await Promise.allSettled(
    DKIM_SELECTORS.map(async (selector) => {
      const records = await dnsOrEmpty(() => dns.resolveTxt(`${selector}._domainkey.${domain}`), "DNS DKIM TXT query");
      const dkimEntry = records
        .map((r) => r.join(""))
        .find((r) => r.includes("v=DKIM1") || r.includes("k=rsa") || r.includes("p="));
      if (dkimEntry) return selector;
      return null;
    }),
  );

  for (const result of dkimChecks) {
    if (result.status === "fulfilled" && result.value) {
      dkimDetected = true;
      dkimSelectorFound = result.value;
      break;
    }
  }
  // A selector the resolver could not answer for might be the one that holds
  // the key, so "No DKIM record found" is only said when every probe answered.
  if (!dkimDetected) {
    const failed = dkimChecks.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) throw failed.reason;
  }

  if (dkimDetected) {
    score += 15;
  } else {
    issues.push("No DKIM record found for common selectors");
    recommendations.push("Configure DKIM signing and publish a DKIM DNS record. Note: custom selectors may exist but were not detected.");
  }

  // 6. Blacklist check. DNSBLs are keyed by reversed IPv4 octets, so only an
  // IPv4 address can be checked (an IPv6 address reversed by "." is not a
  // query any list answers). NXDOMAIN means not listed; a 127.255.255.x
  // answer is the list refusing the query (Spamhaus: public resolver, typo or
  // rate limit), not a listing; any other failure leaves that list unknown.
  // If every list failed there is no blocklist answer at all, and the call
  // throws rather than report "not blacklisted".
  let blacklisted = false;
  const blacklistResults: Array<{ name: string; listed: boolean | null; error?: string }> = [];
  let blacklistsUnknown = 0;

  if (hasIpv4) {
    const ip = ipAddresses[0];
    const reversedIp = ip.split(".").reverse().join(".");

    const blChecks = await Promise.allSettled(
      DNSBLS.map(async (dnsbl) => {
        const answers = await dnsOrEmpty(() => dns.resolve4(`${reversedIp}.${dnsbl}`), `DNSBL ${dnsbl} query`);
        if (answers.length > 0 && answers.every((a) => a.startsWith("127.255.255."))) {
          throw new UpstreamUnavailableError(`DNSBL ${dnsbl}`, `the list refused the query (${answers[0]}).`, { code: answers[0] });
        }
        return { name: dnsbl, listed: answers.length > 0 };
      }),
    );
    requireAnyLeg(blChecks, "DNS blocklists");

    blChecks.forEach((result, i) => {
      if (result.status === "fulfilled") {
        blacklistResults.push(result.value);
        if (result.value.listed) blacklisted = true;
      } else {
        const code = result.reason instanceof UpstreamUnavailableError ? result.reason.code : null;
        blacklistResults.push({ name: DNSBLS[i], listed: null, error: code ?? "query failed" });
        blacklistsUnknown++;
      }
    });
    if (blacklistsUnknown > 0) {
      issues.push(`Blocklist check incomplete: ${blacklistsUnknown} of ${DNSBLS.length} lists did not answer, so their listing status is unknown`);
    }
  }

  if (!blacklisted) {
    // Credit only the lists that answered: an unanswered list is not a clean one.
    score += blacklistsUnknown === 0 ? 20 : Math.round((20 * (DNSBLS.length - blacklistsUnknown)) / DNSBLS.length);
  } else {
    issues.push("Domain IP is listed on one or more DNS blocklists");
    recommendations.push("Request delisting from the blocklists. Investigate potential abuse or misconfiguration.");
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Grade
  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 70) grade = "B";
  else if (score >= 50) grade = "C";
  else if (score >= 30) grade = "D";
  else grade = "F";

  return {
    output: {
      domain,
      score,
      grade,
      mx_records: mxRecords,
      spf: {
        exists: spfExists,
        record: spfRecord,
        valid: spfValid,
        mechanism: spfMechanism,
      },
      dmarc: {
        exists: dmarcExists,
        record: dmarcRecord,
        policy: dmarcPolicy,
      },
      dkim: {
        detected: dkimDetected,
        selector_found: dkimSelectorFound,
      },
      blacklisted,
      blacklists_checked: blacklistResults,
      issues,
      recommendations,
    },
    provenance: { source: "dns-analysis", fetched_at: new Date().toISOString() },
  };
});
