import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// Return/refund policy extraction from retailer websites via Browserless + Claude

const RETURN_POLICY_PATHS = [
  "/return-policy",
  "/returns",
  "/refund-policy",
  "/shipping-returns",
  "/help/returns",
  "/pages/returns",
  "/pages/return-policy",
  "/pages/refund-policy",
  "/customer-service/returns",
];

registerCapability("return-policy-extract", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!rawUrl) {
    throw new Error(
      "'url' is required. Provide a retailer website URL (e.g. 'https://www.example.com').",
    );
  }

  const fullUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

  let domain: string;
  let baseUrl: string;
  try {
    const parsed = new URL(fullUrl);
    domain = parsed.hostname.replace(/^www\./, "");
    baseUrl = `${parsed.protocol}//${parsed.hostname}`;
  } catch {
    domain = "unknown";
    baseUrl = fullUrl;
  }

  // Strategy: fetch the provided URL, then look for return policy links
  let pageText = "";
  let policyUrl = fullUrl;

  // If the URL looks like a homepage or non-policy page, try known policy paths
  const urlPath = new URL(fullUrl).pathname.toLowerCase();
  const isAlreadyPolicyPage =
    urlPath.includes("return") || urlPath.includes("refund") || urlPath.includes("shipping");

  if (isAlreadyPolicyPage) {
    // Directly fetch the provided URL
    const html = await fetchRenderedHtml(fullUrl);
    pageText = htmlToText(html).slice(0, 12000);
  } else {
    // Try common return policy paths
    let found = false;
    for (const path of RETURN_POLICY_PATHS) {
      try {
        const tryUrl = `${baseUrl}${path}`;
        const html = await fetchRenderedHtml(tryUrl);
        const text = htmlToText(html);
        // Check if the page actually has return policy content
        const lower = text.toLowerCase();
        if (
          lower.includes("return") ||
          lower.includes("refund") ||
          lower.includes("exchange")
        ) {
          pageText = text.slice(0, 12000);
          policyUrl = tryUrl;
          found = true;
          break;
        }
      } catch {
        // Continue trying other paths
      }
    }

    // Fallback: fetch the original URL and extract whatever we can
    if (!found) {
      const html = await fetchRenderedHtml(fullUrl);
      pageText = htmlToText(html).slice(0, 12000);
      policyUrl = fullUrl;
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract return/refund policy information from this retailer page. Return ONLY valid JSON.

Retailer: ${domain}
URL: ${policyUrl}

Page text:
${pageText}

Return JSON:
{
  "retailer": "${domain}",
  "return_window_days": 30,
  "refund_method": "original_payment",
  "free_returns": true,
  "conditions": ["Items must be unused", "Original packaging required"],
  "exclusions": ["Sale items", "Underwear", "Personalized items"],
  "process_steps": ["Log into account", "Select order", "Print return label"],
  "exchange_available": true,
  "store_credit_option": true,
  "restocking_fee": null,
  "contact_info": { "email": "returns@store.com", "phone": "..." },
  "international_returns": "Customer pays shipping"
}

Use null for any fields you cannot determine. If the page does not contain return policy information, set return_window_days to null and add a note in conditions.`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract return policy data.");

  const output = JSON.parse(jsonMatch[0]);
  output.policy_url = policyUrl;

  return {
    output,
    provenance: {
      source: domain,
      fetched_at: new Date().toISOString(),
    },
  };
});
