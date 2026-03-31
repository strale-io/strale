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

  try {
    const { error } = await resend.emails.send({
      from: "Petter at Strale <petter@strale.io>",
      to: email,
      subject: "Your new Strale API key",
      text,
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

  try {
    const { error } = await resend.emails.send({
      from: "Petter at Strale <petter@strale.io>",
      to: email,
      subject: "Your Strale API key",
      text,
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
