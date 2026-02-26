import { registerCapability, type CapabilityInput } from "./index.js";

const PATTERNS: Array<{ type: string; regex: RegExp; severity: "critical" | "high" | "medium" }> = [
  // AWS
  { type: "aws_access_key", regex: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
  { type: "aws_secret_key", regex: /(?:aws)?_?(?:secret)?_?(?:access)?_?key['":\s=]*['"]?([A-Za-z0-9/+=]{40})['"]?/gi, severity: "critical" },
  // GitHub
  { type: "github_token", regex: /gh[pousr]_[A-Za-z0-9_]{36,255}/g, severity: "critical" },
  { type: "github_classic_token", regex: /ghp_[A-Za-z0-9]{36}/g, severity: "critical" },
  // Stripe
  { type: "stripe_secret_key", regex: /sk_(?:live|test)_[A-Za-z0-9]{24,}/g, severity: "critical" },
  { type: "stripe_publishable_key", regex: /pk_(?:live|test)_[A-Za-z0-9]{24,}/g, severity: "medium" },
  // Anthropic
  { type: "anthropic_api_key", regex: /sk-ant-[A-Za-z0-9_-]{40,}/g, severity: "critical" },
  // OpenAI
  { type: "openai_api_key", regex: /sk-[A-Za-z0-9]{20,}/g, severity: "critical" },
  // Generic API keys / bearer tokens
  { type: "bearer_token", regex: /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/g, severity: "high" },
  { type: "authorization_header", regex: /[Aa]uthorization['":\s]*['"]?(?:Bearer|Basic|Token)\s+[A-Za-z0-9_\-.~+/]+/g, severity: "high" },
  // Private keys
  { type: "private_key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: "critical" },
  // Database connection strings
  { type: "database_url", regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s'"]+/gi, severity: "critical" },
  // JWT
  { type: "jwt_token", regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-+/=]{10,}/g, severity: "high" },
  // Slack
  { type: "slack_token", regex: /xox[bpras]-[A-Za-z0-9-]{10,}/g, severity: "critical" },
  // SendGrid
  { type: "sendgrid_key", regex: /SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}/g, severity: "critical" },
  // Twilio
  { type: "twilio_key", regex: /SK[0-9a-fA-F]{32}/g, severity: "high" },
  // Generic secret patterns
  { type: "generic_secret", regex: /(?:secret|password|passwd|token|api_key|apikey)[\s]*[=:]\s*['"][A-Za-z0-9_\-.~+/]{8,}['"]/gi, severity: "high" },
];

function maskValue(value: string): string {
  if (value.length <= 8) return "***";
  return value.slice(0, 4) + "..." + value.slice(-4);
}

registerCapability("secret-scan", async (input: CapabilityInput) => {
  const text = ((input.text as string) ?? (input.code as string) ?? (input.task as string) ?? "").trim();
  if (!text) throw new Error("'text' (code, config, or log output) is required.");

  const lines = text.split("\n");
  const findings: Array<{ type: string; line_number: number; masked_value: string; severity: string; pattern_matched: string }> = [];
  const seen = new Set<string>(); // Dedup

  for (const pattern of PATTERNS) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      pattern.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.regex.exec(line)) !== null) {
        const key = `${pattern.type}:${i}:${match.index}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push({
          type: pattern.type,
          line_number: i + 1,
          masked_value: maskValue(match[0]),
          severity: pattern.severity,
          pattern_matched: pattern.type,
        });
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  findings.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));

  return {
    output: {
      findings,
      total_findings: findings.length,
      clean: findings.length === 0,
      severity_summary: {
        critical: findings.filter((f) => f.severity === "critical").length,
        high: findings.filter((f) => f.severity === "high").length,
        medium: findings.filter((f) => f.severity === "medium").length,
      },
      lines_scanned: lines.length,
    },
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});
