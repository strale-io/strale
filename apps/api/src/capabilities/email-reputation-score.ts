import { registerCapability, type CapabilityInput } from "./index.js";

// Disposable email domain list (subset — comprehensive enough for scoring)
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.de", "tempmail.com",
  "throwaway.email", "temp-mail.org", "yopmail.com", "yopmail.fr",
  "trashmail.com", "trashmail.me", "trashmail.net", "maildrop.cc",
  "dispostable.com", "10minutemail.com", "mohmal.com", "burnermail.io",
  "guerrilla.ml", "sharklasers.com", "grr.la", "tempail.com",
  "mailnesia.com", "mintemail.com", "tempr.email", "fakeinbox.com",
  "mailcatch.com", "meltmail.com", "spamgourmet.com", "mytemp.email",
  "getairmail.com", "33mail.com", "guerrillamailblock.com", "pokemail.net",
  "spam4.me", "binkmail.com", "bobmail.info", "chammy.info",
  "devnullmail.com", "fiifke.de", "filzmail.com", "gishpuppy.com",
  "goemailgo.com", "incognitomail.org", "jetable.org", "kasmail.com",
  "lookugly.com", "mailexpire.com", "mailmoat.com", "mailzilla.com",
  "nomail.xl.cx", "nospamfor.us", "objectmail.com", "ownmail.net",
  "proxymail.eu", "putthisinyouremail.com", "quickinbox.com",
  "reallymymail.com", "recode.me", "regbypass.com", "safetymail.info",
  "spamfree24.org", "suremail.info", "teleworm.us", "thankyou2010.com",
  "thisisnotmyrealemail.com", "tradermail.info", "turual.com",
  "veryreallyme.com", "wuzup.net", "wuzupmail.net", "yopmail.gq",
]);

// Major corporate/reputable providers
const REPUTABLE_PROVIDERS: Record<string, number> = {
  "gmail.com": 85, "googlemail.com": 85, "outlook.com": 85, "hotmail.com": 80,
  "live.com": 80, "msn.com": 75, "yahoo.com": 70, "yahoo.co.uk": 70,
  "icloud.com": 85, "me.com": 80, "mac.com": 80, "aol.com": 60,
  "protonmail.com": 80, "proton.me": 80, "tutanota.com": 75,
  "fastmail.com": 80, "zoho.com": 75,
};

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

registerCapability("email-reputation-score", async (input: CapabilityInput) => {
  const email = ((input.email as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!email) throw new Error("'email' is required.");

  const emailValid = EMAIL_RE.test(email) && email.length <= 254;
  if (!emailValid) {
    return {
      output: {
        email,
        email_valid: false,
        reputation_score: 0,
        risk_level: "critical",
        factors: [{ factor: "invalid_format", impact: -100, detail: "Email format is invalid" }],
      },
      provenance: { source: "strale-email-reputation", fetched_at: new Date().toISOString() },
    };
  }

  const domain = email.split("@")[1];
  const localPart = email.split("@")[0];
  const factors: Array<{ factor: string; impact: number; detail: string }> = [];
  let score = 50; // Base score

  // Check disposable domain
  if (DISPOSABLE_DOMAINS.has(domain)) {
    factors.push({ factor: "disposable_domain", impact: -40, detail: `${domain} is a known disposable email provider` });
    score -= 40;
  }

  // Check reputable provider
  const providerScore = REPUTABLE_PROVIDERS[domain];
  if (providerScore) {
    const boost = Math.round((providerScore - 50) * 0.5);
    factors.push({ factor: "reputable_provider", impact: boost, detail: `${domain} is a well-known email provider` });
    score += boost;
  } else if (!DISPOSABLE_DOMAINS.has(domain)) {
    // Custom domain — could be corporate (positive) or unknown
    factors.push({ factor: "custom_domain", impact: 5, detail: "Custom domain — likely corporate email" });
    score += 5;
  }

  // Check MX records
  try {
    const dns = await import("node:dns/promises");
    const mx = await dns.resolveMx(domain);
    if (mx.length > 0) {
      factors.push({ factor: "valid_mx", impact: 10, detail: `${mx.length} MX record(s) found` });
      score += 10;
    } else {
      factors.push({ factor: "no_mx", impact: -20, detail: "No MX records — domain cannot receive email" });
      score -= 20;
    }
  } catch {
    factors.push({ factor: "mx_lookup_failed", impact: -15, detail: "MX lookup failed — domain may not exist" });
    score -= 15;
  }

  // Check local part patterns
  if (/^\d+$/.test(localPart)) {
    factors.push({ factor: "numeric_local", impact: -5, detail: "Local part is entirely numeric" });
    score -= 5;
  }
  if (localPart.length > 30) {
    factors.push({ factor: "long_local", impact: -3, detail: "Unusually long local part" });
    score -= 3;
  }
  if (/^(test|spam|fake|temp|noreply|no-reply)/.test(localPart)) {
    factors.push({ factor: "suspicious_local", impact: -10, detail: "Local part suggests non-personal address" });
    score -= 10;
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score));

  let riskLevel: string;
  if (score >= 70) riskLevel = "low";
  else if (score >= 40) riskLevel = "medium";
  else if (score >= 20) riskLevel = "high";
  else riskLevel = "critical";

  return {
    output: {
      email,
      email_valid: true,
      reputation_score: score,
      risk_level: riskLevel,
      domain,
      provider_type: REPUTABLE_PROVIDERS[domain] ? "major_provider" : DISPOSABLE_DOMAINS.has(domain) ? "disposable" : "custom",
      factors,
    },
    provenance: { source: "strale-email-reputation", fetched_at: new Date().toISOString() },
  };
});
