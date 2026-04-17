import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

// F-0-006 Bucket D: user inputs (including URL-like strings) are passed
// to Claude as prose for config generation. No network I/O touches the
// user-supplied values.

registerCapability("nginx-config-generate", async (input: CapabilityInput) => {
  const domain = ((input.domain as string) ?? (input.task as string) ?? "").trim();
  if (!domain) throw new Error("'domain' is required.");

  const upstreamPort = (input.upstream_port as number) ?? 3000;
  const ssl = (input.ssl as boolean) ?? true;
  const wwwRedirect = (input.www_redirect as boolean) ?? true;
  const rateLimit = (input.rate_limit as number) ?? 0;
  const gzip = (input.gzip as boolean) ?? true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Generate a production-ready nginx server block configuration. Return ONLY valid JSON.

Domain: ${domain}
Upstream port: ${upstreamPort}
SSL: ${ssl} ${ssl ? "(use Let's Encrypt paths)" : ""}
WWW redirect: ${wwwRedirect}
Rate limit: ${rateLimit > 0 ? `${rateLimit} req/sec` : "none"}
Gzip: ${gzip}

Include:
- proxy_pass to localhost:${upstreamPort}
- WebSocket support (proxy headers)
- Security headers (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy)
- Proper proxy headers (X-Real-IP, X-Forwarded-For, X-Forwarded-Proto)
${ssl ? "- SSL with Let's Encrypt certificate paths\n- HTTP to HTTPS redirect" : ""}
${wwwRedirect ? `- www.${domain} → ${domain} redirect` : ""}
${rateLimit > 0 ? `- Rate limiting at ${rateLimit} req/sec` : ""}
${gzip ? "- Gzip compression for text types" : ""}

Return JSON:
{
  "config": "the complete nginx config as a string",
  "features_enabled": ["list of features included"],
  "security_headers_included": ["list of security headers"],
  "notes": ["important notes about this config"]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate nginx config.");

  const output = JSON.parse(jsonMatch[0]);
  output.domain = domain;
  output.upstream_port = upstreamPort;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
