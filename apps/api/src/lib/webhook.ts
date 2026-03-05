/**
 * Fire-and-forget webhook delivery.
 * Used for signup notifications and transaction milestone alerts.
 */

const WEBHOOK_URL = process.env.WEBHOOK_URL;

/** Mask a URL for safe logging — shows host but hides path/query/auth details */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/***`;
  } catch {
    return "***";
  }
}

export async function sendWebhook(payload: Record<string, unknown>): Promise<void> {
  if (!WEBHOOK_URL) return;

  const masked = maskUrl(WEBHOOK_URL);

  try {
    const resp = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) {
      console.warn(
        `[webhook] POST ${masked} returned ${resp.status}`,
      );
    }
  } catch (err) {
    console.warn(
      `[webhook] Failed to deliver to ${masked}:`,
      err instanceof Error ? err.message : err,
    );
  }
}
