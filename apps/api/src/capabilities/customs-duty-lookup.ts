import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

// ─── EU Customs Duty Lookup via TARIC + Browserless + Claude ────────────────

registerCapability("customs-duty-lookup", async (input: CapabilityInput) => {
  const hsCode = ((input.hs_code as string) ?? (input.task as string) ?? "").trim();
  if (!hsCode) {
    throw new Error(
      "'hs_code' is required. Provide an HS code (e.g. '8471.30' or '847130') to look up EU customs duties.",
    );
  }

  const originCountry = ((input.origin_country as string) ?? "").trim().toUpperCase() || "";
  const destinationCountry = ((input.destination_country as string) ?? "EU").trim().toUpperCase();

  // Normalize HS code: remove dots and spaces
  const cleanHsCode = hsCode.replace(/[\s.]/g, "");
  if (!/^\d{4,10}$/.test(cleanHsCode)) {
    throw new Error(
      `Invalid HS code format: "${hsCode}". Must be 4-10 digits (e.g. '8471.30' or '847130').`,
    );
  }

  // Pad to at least 6 digits for TARIC
  const paddedCode = cleanHsCode.padEnd(10, "0");

  // Build TARIC consultation URL
  const today = new Date();
  const simDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
  const taricUrl =
    `https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp` +
    `?Lang=en&SimDate=${simDate}&GoodsCode=${paddedCode}` +
    `&Ctry=${originCountry}&Area=&MeasType=&StartPub=&EndPub=` +
    `&MeasText=&search_text=goods&textSearch=&LangDescr=en` +
    `&OrderNum=&Regulation=&measStartDat=&measEndDat=`;

  let pageText: string;
  let sourceUrl = taricUrl;

  try {
    const html = await fetchRenderedHtml(taricUrl);
    pageText = htmlToText(html);

    if (pageText.length < 200) {
      // Fallback: try Access2Markets
      const a2mUrl = `https://trade.ec.europa.eu/access-to-markets/en/search?product=${cleanHsCode}${originCountry ? `&origin=${originCountry}` : ""}&destination=${destinationCountry}`;
      sourceUrl = a2mUrl;
      const a2mHtml = await fetchRenderedHtml(a2mUrl);
      pageText = htmlToText(a2mHtml);
    }
  } catch (e: any) {
    // Try Access2Markets as fallback
    try {
      const a2mUrl = `https://trade.ec.europa.eu/access-to-markets/en/search?product=${cleanHsCode}${originCountry ? `&origin=${originCountry}` : ""}&destination=${destinationCountry}`;
      sourceUrl = a2mUrl;
      const a2mHtml = await fetchRenderedHtml(a2mUrl);
      pageText = htmlToText(a2mHtml);
    } catch {
      throw new Error(
        `Could not fetch customs duty data for HS code "${hsCode}". Both TARIC and Access2Markets failed. Original error: ${e.message}`,
      );
    }
  }

  if (pageText.length < 100) {
    throw new Error(
      `Could not load customs duty page for HS code "${hsCode}". The page returned insufficient content.`,
    );
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
        content: `Extract customs duty information from this EU customs/TARIC page for HS code "${hsCode}"${originCountry ? ` from origin country "${originCountry}"` : ""}.

Return ONLY valid JSON:
{
  "hs_code": "${cleanHsCode}",
  "description": "product description from the page",
  "origin_country": "${originCountry || "not specified"}",
  "destination": "${destinationCountry}",
  "duty_rate": "percentage or specific rate",
  "duty_type": "ad_valorem or specific or mixed",
  "preferential_rates": [{"agreement": "trade agreement name", "rate": "preferential rate"}],
  "anti_dumping": false,
  "additional_duties": [],
  "vat_rate": "standard VAT rate if shown",
  "notes": "any relevant notes, conditions, or regulations"
}

If the page does not contain clear duty data, still return the JSON structure with whatever information is available, using null for missing fields.

Page text:
${pageText.slice(0, 12000)}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract customs duty data from the page.");

  const output = JSON.parse(jsonMatch[0]);

  return {
    output,
    provenance: {
      source: sourceUrl.includes("taric") ? "ec.europa.eu/taric" : "trade.ec.europa.eu/access-to-markets",
      fetched_at: new Date().toISOString(),
    },
  };
});
