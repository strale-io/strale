import { log, logWarn } from "../log.js";

export async function sendDigestEmail(html: string, date: Date): Promise<void> {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    logWarn("digest-no-resend-key", "RESEND_API_KEY not set; skipping email send");
    return;
  }

  const dateStr = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Strale Digest <petter@strale.io>",
      to: ["petter@strale.io"],
      subject: `Strale Daily Digest - ${dateStr}`,
      html,
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Resend API error ${resp.status}: ${body}`);
  }

  const result = await resp.json();
  log.info(
    { label: "digest-email-sent", message_id: (result as Record<string, unknown>).id },
    "digest-email-sent",
  );
}
