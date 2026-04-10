/**
 * Conversion emails — low-balance and zero-balance notifications (DEC-20260410-A).
 * Fire-and-forget via Resend. Failures logged but never thrown.
 *
 * These are triggered by the wallet debit path in do.ts when the balance
 * crosses a threshold after a successful paid execution.
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

interface UsageSummary {
  totalCalls: number;
  daysSinceSignup: number;
  topCapabilities: Array<{ slug: string; count: number }>;
  totalSpentCents: number;
}

function formatUsageSummary(usage: UsageSummary): string {
  const lines = usage.topCapabilities
    .slice(0, 5)
    .map((c) => `  - ${c.count}x ${c.slug}`)
    .join("\n");
  return `Since signing up ${usage.daysSinceSignup} day${usage.daysSinceSignup === 1 ? "" : "s"} ago, your agent made ${usage.totalCalls} calls:\n${lines}\n\nTotal spent: €${(usage.totalSpentCents / 100).toFixed(2)}`;
}

function formatUsageSummaryHtml(usage: UsageSummary): string {
  const items = usage.topCapabilities
    .slice(0, 5)
    .map((c) => `<li>${c.count}x <code>${c.slug}</code></li>`)
    .join("");
  return `<p>Since signing up ${usage.daysSinceSignup} day${usage.daysSinceSignup === 1 ? "" : "s"} ago, your agent made <strong>${usage.totalCalls} calls</strong>:</p><ul>${items}</ul><p>Total spent: <strong>€${(usage.totalSpentCents / 100).toFixed(2)}</strong></p>`;
}

function topUpButtons(userId: string): string {
  // Pre-filled amounts — the links go to the API which creates Stripe Checkout sessions
  // For now, link to the top-up endpoint instructions since we can't pre-auth Stripe links without a session
  return [
    '<div style="margin: 20px 0;">',
    '<a href="https://strale.dev/topup" style="display: inline-block; background: #1a1a1a; color: #ffffff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px; margin-right: 8px;">Add credits</a>',
    "</div>",
  ].join("");
}

/**
 * Send when balance drops below €0.50 (25% of trial credits).
 */
export async function sendLowBalanceEmail(
  email: string,
  balanceCents: number,
  usage: UsageSummary,
): Promise<void> {
  if (isInternal(email)) return;

  const resend = getResend();
  if (!resend) {
    console.log(`[low-balance-email-skip] No RESEND_API_KEY`);
    return;
  }

  const balanceStr = `€${(balanceCents / 100).toFixed(2)}`;

  const text = `Hey,

Your agent has ${balanceStr} remaining on Strale.

${formatUsageSummary(usage)}

Free-tier capabilities (url-to-markdown, email-validate, etc.) still work at no cost. Paid capabilities need a top-up.

Add credits at https://strale.dev/topup

— Petter
Founder, Strale`;

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">',
    `<p>Hey,</p>`,
    `<p>Your agent has <strong>${balanceStr}</strong> remaining on Strale.</p>`,
    formatUsageSummaryHtml(usage),
    `<p>Free-tier capabilities still work at no cost. Paid capabilities need a top-up.</p>`,
    topUpButtons(""),
    '<p>— Petter<br>Founder, Strale</p>',
    "</div>",
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: FROM, to: email, subject: `Your agent has ${balanceStr} remaining on Strale`, text, html, replyTo: REPLY_TO,
    });
    if (error) {
      console.error(`[low-balance-email-error] ${error.message}`);
      return;
    }
    console.log(`[low-balance-email-sent] ${email} balance=${balanceCents}`);
  } catch (err) {
    console.error(`[low-balance-email-error] ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Send when balance hits zero after a paid call.
 */
export async function sendZeroBalanceEmail(
  email: string,
  usage: UsageSummary,
): Promise<void> {
  if (isInternal(email)) return;

  const resend = getResend();
  if (!resend) {
    console.log(`[zero-balance-email-skip] No RESEND_API_KEY`);
    return;
  }

  const text = `Hey,

Your agent can't make paid calls on Strale anymore — the wallet is empty.

${formatUsageSummary(usage)}

Free-tier capabilities (url-to-markdown, email-validate, dns-lookup, iban-validate, json-repair) still work.

Add credits at https://strale.dev/topup — takes 30 seconds.

— Petter
Founder, Strale`;

  const html = [
    '<div style="font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; max-width: 600px;">',
    `<p>Hey,</p>`,
    `<p>Your agent can't make paid calls on Strale anymore — the wallet is empty.</p>`,
    formatUsageSummaryHtml(usage),
    `<p>Free-tier capabilities still work. Paid capabilities need a top-up.</p>`,
    topUpButtons(""),
    '<p>— Petter<br>Founder, Strale</p>',
    "</div>",
  ].join("\n");

  try {
    const { error } = await resend.emails.send({
      from: FROM, to: email, subject: "Your agent ran out of credits on Strale", text, html, replyTo: REPLY_TO,
    });
    if (error) {
      console.error(`[zero-balance-email-error] ${error.message}`);
      return;
    }
    console.log(`[zero-balance-email-sent] ${email}`);
  } catch (err) {
    console.error(`[zero-balance-email-error] ${err instanceof Error ? err.message : err}`);
  }
}
