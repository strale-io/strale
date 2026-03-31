/**
 * Welcome email — sends API key and first-call instructions to new users.
 * Fire-and-forget: failures are logged but never break registration.
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

const INTERNAL_DOMAINS = ["@strale.io", "@strale.internal", "@example.com"];

export async function sendRecoveryEmail(email: string, apiKey: string): Promise<void> {
  if (INTERNAL_DOMAINS.some((d) => email.endsWith(d))) {
    console.log(`[key-recovery-email-skip] internal email: ${email}`);
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.log("[key-recovery-email-skip] RESEND_API_KEY not set");
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
      console.error(`[key-recovery-email-error] email=${email} error=${error.message}`);
      return;
    }

    console.log(`[key-recovery-email-sent] ${email}`);
  } catch (err) {
    console.error(`[key-recovery-email-error] email=${email} error=${err instanceof Error ? err.message : err}`);
  }
}

export async function sendWelcomeEmail(email: string, apiKey: string): Promise<void> {
  if (INTERNAL_DOMAINS.some((d) => email.endsWith(d))) {
    console.log(`[welcome-email-skip] internal email: ${email}`);
    return;
  }

  const resend = getResend();
  if (!resend) {
    console.log("[welcome-email-skip] RESEND_API_KEY not set");
    return;
  }

  const text = `Hey,

Welcome to Strale. Here's your API key:

${apiKey}

Save it somewhere safe — this is the only copy. If you lose it, you can request a new one by replying to this email.

Try your first call right now (paste this into a terminal):

curl -X POST https://api.strale.io/v1/do \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"capability_slug": "iban-validate", "inputs": {"iban": "DE89370400440532013000"}, "max_price_cents": 100}'

That validates a German IBAN — it's free, no credits used.

To try a paid capability (€0.02 from your €2.00 trial credits):

curl -X POST https://api.strale.io/v1/do \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{"capability_slug": "vat-validate", "inputs": {"vat_number": "SE556703748501"}, "max_price_cents": 100}'

Browse all 250+ capabilities:
https://api.strale.io/v1/capabilities

Questions? Just reply — this goes straight to me.

— Petter
Founder, Strale
https://strale.dev
`;

  const preStyle = "background: #f4f4f4; padding: 12px; border-radius: 4px; overflow-x: auto; font-size: 13px; line-height: 1.5; font-family: monospace; white-space: pre-wrap; word-break: break-all;";
  const codeStyle = "background: #f4f4f4; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-family: monospace;";

  const curlFree = [
    "curl -X POST https://api.strale.io/v1/do \\",
    '  -H "Authorization: Bearer ' + apiKey + '" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"capability_slug\": \"iban-validate\", \"inputs\": {\"iban\": \"DE89370400440532013000\"}, \"max_price_cents\": 100}'",
  ].join("\n");

  const curlPaid = [
    "curl -X POST https://api.strale.io/v1/do \\",
    '  -H "Authorization: Bearer ' + apiKey + '" \\',
    '  -H "Content-Type: application/json" \\',
    "  -d '{\"capability_slug\": \"vat-validate\", \"inputs\": {\"vat_number\": \"SE556703748501\"}, \"max_price_cents\": 100}'",
  ].join("\n");

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">',
    "<p>Hey,</p>",
    "<p>Welcome to Strale. Here's your API key:</p>",
    '<p><code style="' + codeStyle + '">' + apiKey + "</code></p>",
    "<p>Save it somewhere safe — this is the only copy. If you lose it, you can request a new one by replying to this email.</p>",
    "<p><strong>Try your first call right now</strong> (paste this into a terminal):</p>",
    '<pre style="' + preStyle + '">' + curlFree + "</pre>",
    "<p>That validates a German IBAN — it's free, no credits used.</p>",
    "<p><strong>To try a paid capability</strong> (€0.02 from your €2.00 trial credits):</p>",
    '<pre style="' + preStyle + '">' + curlPaid + "</pre>",
    '<p>Browse all 250+ capabilities: <a href="https://api.strale.io/v1/capabilities">api.strale.io/v1/capabilities</a></p>',
    "<p>Questions? Just reply — this goes straight to me.</p>",
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
      console.error(`[welcome-email-error] ${error.message}`);
      return;
    }

    console.log(`[welcome-email-sent] ${email}`);
  } catch (err) {
    console.error(`[welcome-email-error] ${err instanceof Error ? err.message : err}`);
  }
}
