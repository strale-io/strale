/**
 * Fire-and-forget webhook delivery.
 * Used for signup notifications and transaction milestone alerts.
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL;

export async function sendWebhook(payload: Record<string, unknown>): Promise<void> {
  if (!WEBHOOK_URL) return;

  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(
        `[webhook] POST ${WEBHOOK_URL} returned ${resp.status}: ${await resp.text().catch(() => "")}`,
      );
    }
  } catch (err) {
    console.warn(
      `[webhook] Failed to deliver to ${WEBHOOK_URL}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
