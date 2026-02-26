import { registerCapability, type CapabilityInput } from "./index.js";

const SECURITY_HEADERS: Array<{
  header: string;
  severity: "high" | "medium" | "low";
  recommendation: string;
  deprecated?: boolean;
}> = [
  { header: "strict-transport-security", severity: "high", recommendation: "Add: Strict-Transport-Security: max-age=31536000; includeSubDomains" },
  { header: "content-security-policy", severity: "high", recommendation: "Add Content-Security-Policy to prevent XSS and injection attacks" },
  { header: "x-frame-options", severity: "medium", recommendation: "Add: X-Frame-Options: DENY (or SAMEORIGIN) to prevent clickjacking" },
  { header: "x-content-type-options", severity: "medium", recommendation: "Add: X-Content-Type-Options: nosniff to prevent MIME sniffing" },
  { header: "referrer-policy", severity: "medium", recommendation: "Add: Referrer-Policy: strict-origin-when-cross-origin" },
  { header: "permissions-policy", severity: "medium", recommendation: "Add Permissions-Policy to restrict browser features (camera, microphone, etc.)" },
  { header: "x-xss-protection", severity: "low", recommendation: "X-XSS-Protection is deprecated but consider: X-XSS-Protection: 0 (rely on CSP instead)", deprecated: true },
];

registerCapability("header-security-check", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;

  const res = await fetch(fullUrl, {
    method: "GET",
    signal: AbortSignal.timeout(10000),
    redirect: "follow",
  });

  const present: Array<{ header: string; value: string; status: string }> = [];
  const missing: Array<{ header: string; severity: string; recommendation: string }> = [];

  for (const check of SECURITY_HEADERS) {
    const value = res.headers.get(check.header);
    if (value) {
      present.push({
        header: check.header,
        value: value.slice(0, 200),
        status: check.deprecated ? "present (deprecated header)" : "present",
      });
    } else if (!check.deprecated) {
      missing.push({ header: check.header, severity: check.severity, recommendation: check.recommendation });
    }
  }

  // Check CORS headers
  const corsHeaders = ["access-control-allow-origin", "access-control-allow-methods", "access-control-allow-headers"];
  const corsPresent: Record<string, string> = {};
  for (const h of corsHeaders) {
    const val = res.headers.get(h);
    if (val) corsPresent[h] = val;
  }

  // Calculate score
  const highMissing = missing.filter((m) => m.severity === "high").length;
  const mediumMissing = missing.filter((m) => m.severity === "medium").length;
  const score = Math.max(0, 100 - (highMissing * 25) - (mediumMissing * 10));

  // Grade
  let grade: string;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 60) grade = "C";
  else if (score >= 40) grade = "D";
  else grade = "F";

  return {
    output: {
      url: fullUrl,
      score,
      grade,
      present,
      missing,
      cors: Object.keys(corsPresent).length > 0 ? corsPresent : null,
      server: res.headers.get("server") ?? null,
      response_status: res.status,
    },
    provenance: { source: "http-headers", fetched_at: new Date().toISOString() },
  };
});
