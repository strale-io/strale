import { registerCapability, type CapabilityInput } from "./index.js";
import dns from "node:dns/promises";

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

// Common DNS blocklists
const DNSBLS = [
  "zen.spamhaus.org",
  "bl.spamcop.net",
  "b.barracudacentral.org",
];

registerCapability("email-deliverability-check", async (input: CapabilityInput) => {
  const raw = ((input.domain as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!raw) throw new Error("'domain' is required. Provide a domain to check email deliverability.");

  // Clean domain
  const domain = raw
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");

  let score = 0;
  const issues: string[] = [];
  const recommendations: string[] = [];

  // 1. Check if domain resolves
  let ipAddresses: string[] = [];
  try {
    ipAddresses = await dns.resolve4(domain);
  } catch {
    throw new Error(`Domain "${domain}" does not resolve. Cannot check email deliverability.`);
  }

  // 2. MX records
  let mxRecords: Array<{ priority: number; exchange: string }> = [];
  try {
    const mx = await dns.resolveMx(domain);
    mxRecords = mx
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({ priority: r.priority, exchange: r.exchange }));
  } catch {
    // No MX records
  }

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
  try {
    const txtRecords = await dns.resolveTxt(domain);
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
  } catch {
    // No TXT records
  }

  if (!spfExists) {
    issues.push("No SPF record found");
    recommendations.push("Add a TXT record with v=spf1 specifying your authorized mail servers.");
  }

  // 4. DMARC record
  let dmarcExists = false;
  let dmarcRecord: string | null = null;
  let dmarcPolicy: string | null = null;
  try {
    const dmarcTxt = await dns.resolveTxt(`_dmarc.${domain}`);
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
  } catch {
    // No DMARC record
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
      const records = await dns.resolveTxt(`${selector}._domainkey.${domain}`);
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

  if (dkimDetected) {
    score += 15;
  } else {
    issues.push("No DKIM record found for common selectors");
    recommendations.push("Configure DKIM signing and publish a DKIM DNS record. Note: custom selectors may exist but were not detected.");
  }

  // 6. Blacklist check
  let blacklisted = false;
  const blacklistResults: Array<{ name: string; listed: boolean }> = [];

  if (ipAddresses.length > 0) {
    const ip = ipAddresses[0];
    const reversedIp = ip.split(".").reverse().join(".");

    const blChecks = await Promise.allSettled(
      DNSBLS.map(async (dnsbl) => {
        try {
          await dns.resolve4(`${reversedIp}.${dnsbl}`);
          // If it resolves, the IP is listed
          return { name: dnsbl, listed: true };
        } catch {
          // NXDOMAIN = not listed (this is the expected good outcome)
          return { name: dnsbl, listed: false };
        }
      }),
    );

    for (const result of blChecks) {
      if (result.status === "fulfilled") {
        blacklistResults.push(result.value);
        if (result.value.listed) blacklisted = true;
      } else {
        // If check itself failed, assume not listed
        blacklistResults.push({ name: "unknown", listed: false });
      }
    }
  }

  if (!blacklisted) {
    score += 20;
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
