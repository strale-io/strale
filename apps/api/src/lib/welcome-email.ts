/**
 * Welcome email — sends API key and first-call instructions to new users.
 * Fire-and-forget: failures are logged but never break registration.
 */

import { Resend } from "resend";
import { log, logError } from "./log.js";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    _resend = new Resend(key);
  }
  return _resend;
}

const INTERNAL_DOMAINS = ["@strale.io", "@strale.internal", "@example.com"];

export async function sendRecoveryEmail(email: string, apiKey: string): Promise<void> {
  if (INTERNAL_DOMAINS.some((d) => email.endsWith(d))) {
    // F-0-013: skip logging email; reason is enough for diagnostics.
    log.info({ label: "key-recovery-email-skip", reason: "internal-email" }, "key-recovery-email-skip");
    return;
  }

  const resend = getResend();
  if (!resend) {
    log.info({ label: "key-recovery-email-skip", reason: "no-api-key" }, "key-recovery-email-skip");
    return;
  }

  const text = `Hey,

You requested a new API key for your Strale account. Here it is:

${apiKey}

Your previous key has been deactivated. Save this one somewhere safe.

If you didn't request this, you can ignore this email — your old key was already replaced, so just request another one when you need it.

— Petter
Founder, Strale
`;

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">',
    "<p>Hey,</p>",
    "<p>You requested a new API key for your Strale account. Here it is:</p>",
    '<p><code style="background: #f4f4f4; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-family: monospace;">' + apiKey + "</code></p>",
    "<p>Your previous key has been deactivated. Save this one somewhere safe.</p>",
    "<p>If you didn't request this, you can ignore this email — your old key was already replaced, so just request another one when you need it.</p>",
    "<p>— Petter<br>Founder, Strale</p>",
    "</div>",
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: "Petter at Strale <petter@strale.io>",
      to: email,
      subject: "Your new Strale API key",
      text,
      html,
      replyTo: "petter@strale.io",
    });

    if (error) {
      // F-0-013: don't log email. user.id is captured by the caller's request context.
      logError("key-recovery-email-error", new Error(error.message));
      return;
    }

    log.info({ label: "key-recovery-email-sent" }, "key-recovery-email-sent");
  } catch (err) {
    logError("key-recovery-email-error", err);
  }
}

export async function sendWelcomeEmail(email: string, apiKey: string): Promise<void> {
  if (INTERNAL_DOMAINS.some((d) => email.endsWith(d))) {
    log.info({ label: "welcome-email-skip", reason: "internal-email" }, "welcome-email-skip");
    return;
  }

  const resend = getResend();
  if (!resend) {
    log.info({ label: "welcome-email-skip", reason: "no-api-key" }, "welcome-email-skip");
    return;
  }

  const text = `Hey,

Welcome to Strale. Here's your API key:

${apiKey}

Save it somewhere safe — this is the only copy. If you lose it, reply to this email and I'll help.

YOUR FIRST CALL (copy-paste into a terminal — takes 2 seconds):

curl -X POST https://api.strale.io/v1/do \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}, "max_price_cents": 100}'

That validates a German IBAN — free, no credits used.

THREE MORE THINGS TO TRY (each uses a few cents from your €2.00 trial credits):

1. Screen a name against sanctions lists (€0.02):
curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug": "sanctions-check", "inputs": {"name": "John Smith"}, "max_price_cents": 100}'

2. Look up a Swedish company (€0.05):
curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug": "swedish-company-data", "inputs": {"query": "Spotify"}, "max_price_cents": 100}'

3. Audit an npm package for vulnerabilities (€0.15):
curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug": "package-security-audit", "inputs": {"name": "express"}, "max_price_cents": 100}'

Browse all 270+ capabilities: https://api.strale.io/v1/capabilities
Docs: https://strale.dev/docs

HELP US GET DISCOVERED:
If Strale is useful, a GitHub star helps us get listed in developer directories:
https://github.com/strale-io/strale

Questions? Just reply — this goes straight to me.

— Petter
Founder, Strale
https://strale.dev
`;

  const preStyle = "background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.5; font-family: monospace; white-space: pre-wrap; word-break: break-all;";
  const codeStyle = "background: #f4f4f4; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-family: monospace;";
  const sectionStyle = "margin: 24px 0 8px 0; font-size: 13px; font-weight: 600; color: #666; text-transform: uppercase; letter-spacing: 0.5px;";
  const cardStyle = "background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 16px; margin: 12px 0;";
  const btnStyle = "display: inline-block; background: #1a1a1a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;";
  const starBtnStyle = "display: inline-block; background: #ffffff; color: #1a1a1a; padding: 8px 16px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 13px; border: 1px solid #d0d7de;";

  const curlFree = [
    "curl -X POST https://api.strale.io/v1/do \\",
    '  -H "Authorization: Bearer ' + apiKey + '" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"capability_slug\": \"iban-validate\", \"inputs\": {\"iban\": \"DE89370400440532013000\"}, \"max_price_cents\": 100}'",
  ].join("\n");

  const tryCmds = [
    {
      label: "Screen against sanctions lists",
      price: "€0.02",
      curl: `curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug": "sanctions-check", "inputs": {"name": "John Smith"}, "max_price_cents": 100}'`,
    },
    {
      label: "Look up a Swedish company",
      price: "€0.05",
      curl: `curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug": "swedish-company-data", "inputs": {"query": "Spotify"}, "max_price_cents": 100}'`,
    },
    {
      label: "Audit an npm package",
      price: "€0.15",
      curl: `curl -X POST https://api.strale.io/v1/do -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '{"capability_slug": "package-security-audit", "inputs": {"name": "express"}, "max_price_cents": 100}'`,
    },
  ];

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">',
    "<p>Hey,</p>",
    "<p>Welcome to Strale. Here's your API key:</p>",
    '<p><code style="' + codeStyle + '">' + apiKey + "</code></p>",
    "<p>Save it somewhere safe — this is the only copy. If you lose it, reply to this email and I'll help.</p>",

    // ── First call CTA ──
    '<p style="' + sectionStyle + '">Your first call (copy-paste, 2 seconds)</p>',
    '<pre style="' + preStyle + '">' + curlFree + "</pre>",
    '<p style="margin-top: 4px; color: #666; font-size: 13px;">Validates a German IBAN — free, no credits used.</p>',

    // ── Three more things to try ──
    '<p style="' + sectionStyle + '">Three more things to try</p>',
    '<p style="font-size: 14px; color: #666; margin-bottom: 12px;">Each uses a few cents from your €2.00 trial credits.</p>',
    ...tryCmds.map((cmd) => [
      '<div style="' + cardStyle + '">',
      `<p style="margin: 0 0 8px 0; font-weight: 600;">${cmd.label} <span style="color: #666; font-weight: 400; font-size: 13px;">${cmd.price}</span></p>`,
      '<pre style="' + preStyle + ' margin: 0;">' + cmd.curl + "</pre>",
      "</div>",
    ].join("\n")),

    // ── Browse capabilities ──
    '<p style="margin-top: 24px;">',
    '<a href="https://api.strale.io/v1/capabilities" style="' + btnStyle + '">Browse all 270+ capabilities</a>',
    "&nbsp;&nbsp;",
    '<a href="https://strale.dev/docs" style="color: #666; text-decoration: underline; font-size: 14px;">Read the docs</a>',
    "</p>",

    // ── GitHub star CTA ──
    '<div style="margin-top: 32px; padding-top: 20px; border-top: 1px solid #e9ecef;">',
    '<p style="font-size: 14px; color: #666; margin: 0 0 8px 0;">Help us get discovered by developers and AI agents:</p>',
    '<a href="https://github.com/strale-io/strale" style="' + starBtnStyle + '">&#11088; Star on GitHub</a>',
    "</div>",

    // ── Sign off ──
    '<p style="margin-top: 24px;">Questions? Just reply — this goes straight to me.</p>',
    '<p>— Petter<br>Founder, Strale<br><a href="https://strale.dev">strale.dev</a></p>',
    "</div>",
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: "Petter at Strale <petter@strale.io>",
      to: email,
      subject: "Your Strale API key",
      text,
      html,
      replyTo: "petter@strale.io",
    });

    if (error) {
      logError("welcome-email-error", new Error(error.message));
      return;
    }

    log.info({ label: "welcome-email-sent" }, "welcome-email-sent");
  } catch (err) {
    logError("welcome-email-error", err);
  }
}
