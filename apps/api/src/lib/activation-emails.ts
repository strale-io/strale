/**
 * Activation drip emails — nudge new users toward their first API call.
 * All emails fire-and-forget via Resend. Failures logged but never thrown.
 */

import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM = "Petter at Strale <petter@strale.io>";
const REPLY_TO = "petter@strale.io";
const INTERNAL = ["@strale.io", "@strale.internal", "@example.com"];

function isInternal(email: string): boolean {
  return INTERNAL.some((d) => email.endsWith(d));
}

async function send(to: string, subject: string, text: string, html: string): Promise<void> {
  if (isInternal(to)) return;

  const resend = getResend();
  if (!resend) {
    console.log(`[activation-email-skip] No RESEND_API_KEY — would send "${subject}" to ${to}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to,
      subject,
      text,
      html,
      replyTo: REPLY_TO,
    });
    if (error) {
      console.error(`[activation-email-error] ${subject}: ${error.message}`);
      return;
    }
    console.log(`[activation-email-sent] "${subject}" to ${to}`);
  } catch (err) {
    console.error(`[activation-email-error] ${err instanceof Error ? err.message : err}`);
  }
}

// ── Day 2: Nudge (48h after signup, no API call) ─────────────────────────────

export async function sendDay2NudgeEmail(email: string): Promise<void> {
  const subject = "Your API key is ready — try a free call";

  const text = `Hey,

You signed up for Strale a couple of days ago but haven't made your first API call yet. Your account has EUR 2.00 in free credits waiting.

Here's the fastest way to test it — paste this into a terminal:

curl -X POST https://api.strale.io/v1/do \\
  -H "Content-Type: application/json" \\
  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}}'

That validates a German IBAN. It's free — no credits used, no API key needed.

When you're ready for paid capabilities (company lookups, sanctions screening, web extraction), your API key and EUR 2.00 credits are waiting in your account.

Browse all 250+ capabilities: https://strale.dev/capabilities

Questions? Reply to this email — it goes straight to me.

— Petter
Founder, Strale
https://strale.dev
`;

  const preStyle = "background:#f4f4f4;padding:12px;border-radius:4px;overflow-x:auto;font-size:13px;line-height:1.5;font-family:monospace;white-space:pre-wrap;word-break:break-all;";
  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px;">',
    "<p>Hey,</p>",
    "<p>You signed up for Strale a couple of days ago but haven't made your first API call yet. Your account has <strong>EUR 2.00 in free credits</strong> waiting.</p>",
    "<p>Here's the fastest way to test it — paste this into a terminal:</p>",
    `<pre style="${preStyle}">curl -X POST https://api.strale.io/v1/do \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}}'</pre>`,
    "<p>That validates a German IBAN. It's free — no credits used, no API key needed.</p>",
    '<p>Browse all 250+ capabilities: <a href="https://strale.dev/capabilities" style="color:#2563eb;">strale.dev/capabilities</a></p>',
    "<p>Questions? Reply to this email — it goes straight to me.</p>",
    '<p>— Petter<br>Founder, Strale<br><a href="https://strale.dev" style="color:#2563eb;">strale.dev</a></p>',
    "</div>",
  ].join("\n");

  await send(email, subject, text, html);
}

// ── Day 5: Reminder (120h after signup, still no API call) ────────────────────

export async function sendDay5ReminderEmail(email: string): Promise<void> {
  const subject = "5 capabilities you can try for free";

  const text = `Hey,

Your Strale account still has EUR 2.00 in unused credits. Here are 5 capabilities you can try right now — all free, no API key needed:

1. iban-validate — Validate any IBAN (checksum, bank name, country)
2. email-validate — Check if an email address can receive mail
3. dns-lookup — Look up DNS records for any domain
4. url-to-markdown — Convert any web page to clean markdown
5. json-repair — Fix malformed JSON (trailing commas, single quotes, etc.)

Example:

curl -X POST https://api.strale.io/v1/do \\
  -H "Content-Type: application/json" \\
  -d '{"capability_slug": "email-validate", "inputs": {"email": "test@example.com"}}'

No credit card, no setup. Just paste and run.

For paid capabilities (sanctions screening, company registries, web scraping), your EUR 2.00 credits cover dozens of calls.

Browse everything: https://strale.dev/capabilities

— Petter
Founder, Strale
`;

  const preStyle = "background:#f4f4f4;padding:12px;border-radius:4px;overflow-x:auto;font-size:13px;line-height:1.5;font-family:monospace;white-space:pre-wrap;word-break:break-all;";
  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px;">',
    "<p>Hey,</p>",
    "<p>Your Strale account still has <strong>EUR 2.00 in unused credits</strong>. Here are 5 capabilities you can try right now — all free, no API key needed:</p>",
    '<ol style="padding-left:20px;">',
    "<li><strong>iban-validate</strong> — Validate any IBAN (checksum, bank name, country)</li>",
    "<li><strong>email-validate</strong> — Check if an email address can receive mail</li>",
    "<li><strong>dns-lookup</strong> — Look up DNS records for any domain</li>",
    "<li><strong>url-to-markdown</strong> — Convert any web page to clean markdown</li>",
    "<li><strong>json-repair</strong> — Fix malformed JSON (trailing commas, single quotes, etc.)</li>",
    "</ol>",
    "<p>Example:</p>",
    `<pre style="${preStyle}">curl -X POST https://api.strale.io/v1/do \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"capability_slug": "email-validate", "inputs": {"email": "test@example.com"}}'</pre>`,
    "<p>No credit card, no setup. Just paste and run.</p>",
    '<p>Browse everything: <a href="https://strale.dev/capabilities" style="color:#2563eb;">strale.dev/capabilities</a></p>',
    '<p>— Petter<br>Founder, Strale<br><a href="https://strale.dev" style="color:#2563eb;">strale.dev</a></p>',
    "</div>",
  ].join("\n");

  await send(email, subject, text, html);
}

// ── Activation success (immediately on first API call) ────────────────────────

export async function sendActivationSuccessEmail(email: string, capabilitySlug: string): Promise<void> {
  const subject = "First call complete — here's what's next";

  const suggestions: Record<string, string[]> = {
    "iban-validate": ["vat-validate", "swift-validate", "email-validate"],
    "email-validate": ["dns-lookup", "domain-reputation", "mx-lookup"],
    "dns-lookup": ["whois-lookup", "ssl-check", "domain-reputation"],
    "url-to-markdown": ["web-extract", "meta-extract", "screenshot-url"],
    "json-repair": ["json-schema-validate", "xml-to-json", "csv-to-json"],
  };
  const related = suggestions[capabilitySlug] ?? ["sanctions-check", "swedish-company-data", "beneficial-ownership-lookup"];

  const text = `Hey,

Your first Strale API call just went through — ${capabilitySlug}.

Here are a few related capabilities you might find useful:
${related.map((s) => `- ${s}`).join("\n")}

Browse all 250+ capabilities: https://strale.dev/capabilities
Or try a bundled solution (multi-step workflow): https://strale.dev/solutions

— Petter
Founder, Strale
`;

  const html = [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:600px;">',
    "<p>Hey,</p>",
    `<p>Your first Strale API call just went through — <code style="background:#f4f4f4;padding:2px 6px;border-radius:4px;font-size:14px;">${capabilitySlug}</code>.</p>`,
    "<p>Here are a few related capabilities you might find useful:</p>",
    "<ul>",
    ...related.map((s) => `<li><code style="font-size:13px;">${s}</code></li>`),
    "</ul>",
    '<p>Browse all 250+ capabilities: <a href="https://strale.dev/capabilities" style="color:#2563eb;">strale.dev/capabilities</a></p>',
    '<p>Or try a bundled solution: <a href="https://strale.dev/solutions" style="color:#2563eb;">strale.dev/solutions</a></p>',
    '<p>— Petter<br>Founder, Strale<br><a href="https://strale.dev" style="color:#2563eb;">strale.dev</a></p>',
    "</div>",
  ].join("\n");

  await send(email, subject, text, html);
}
