import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

// Swedish org numbers: 10 digits, optionally with hyphen after 6th digit
const ORG_NUMBER_RE = /^(\d{6})-?(\d{4})$/;

function parseOrgNumber(input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  const match = cleaned.match(ORG_NUMBER_RE);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function findOrgNumber(input: string): string | null {
  const match = input.match(/\d{6}-?\d{4}/);
  if (!match) return null;
  return parseOrgNumber(match[0]);
}

const EXTRACTION_PROMPT = `You are an expert financial analyst specializing in Swedish annual reports (årsredovisningar).

Extract the following financial data from this annual report. Return valid JSON only, no other text.

Required output format:
{
  "company_name": "string",
  "org_number": "string (NNNNNN-NNNN format)",
  "fiscal_year": "string (e.g. 2024-01-01 to 2024-12-31, or 2024)",
  "revenue_sek": "number or null (Nettoomsättning / Net revenue in SEK)",
  "profit_sek": "number or null (Årets resultat / Net income in SEK)",
  "operating_profit_sek": "number or null (Rörelseresultat in SEK)",
  "total_assets_sek": "number or null (Summa tillgångar in SEK)",
  "equity_sek": "number or null (Eget kapital in SEK)",
  "number_of_employees": "number or null (Medelantal anställda)",
  "board_members": ["string (Name, role)"],
  "auditor": "string or null",
  "dividend_sek": "number or null (Utdelning per aktie or total)",
  "key_ratios": {
    "equity_ratio_pct": "number or null (Soliditet %)",
    "return_on_equity_pct": "number or null (Avkastning på eget kapital %)",
    "profit_margin_pct": "number or null (Vinstmarginal %)"
  }
}

Rules:
- All monetary amounts in SEK (not tkr/thousands — convert if needed by multiplying by 1000)
- board_members should include role in parentheses, e.g. "Anna Svensson (Ordförande)"
- If a value is stated in tkr (tusentals kronor), multiply by 1000
- If a field cannot be determined from the report, use null
- board_members and key_ratios can be empty array/object if not found`;

// ─── Find and download the annual report PDF ─────────────────────────────────
async function findAnnualReportPdf(
  orgNumber: string,
  year?: number,
): Promise<{ pdfBase64: string; source: string }> {
  const browserlessUrl = process.env.BROWSERLESS_URL;
  const browserlessKey = process.env.BROWSERLESS_API_KEY;

  if (!browserlessUrl || !browserlessKey) {
    throw new Error(
      "BROWSERLESS_URL and BROWSERLESS_API_KEY are required for annual-report-extract.",
    );
  }

  const cleanOrg = orgNumber.replace("-", "");

  // Strategy 1: Try Allabolag's annual report page which links to PDF downloads
  const allabolagUrl = `https://www.allabolag.se/${cleanOrg}/arsredovisning`;
  const contentUrl = `${browserlessUrl}/content?token=${browserlessKey}`;

  const pageResponse = await fetch(contentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: allabolagUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 25000 },
    }),
    signal: AbortSignal.timeout(35000),
  });

  if (!pageResponse.ok) {
    throw new Error(
      `Failed to load Allabolag annual report page: HTTP ${pageResponse.status}`,
    );
  }

  const html = await pageResponse.text();

  // Look for PDF download links
  // Allabolag often has links to Bolagsverket PDFs or their own hosted versions
  const pdfLinks: string[] = [];

  // Pattern 1: Direct PDF links
  const pdfLinkRegex = /href="([^"]*\.pdf[^"]*)"/gi;
  let match: RegExpExecArray | null;
  while ((match = pdfLinkRegex.exec(html)) !== null) {
    pdfLinks.push(match[1]);
  }

  // Pattern 2: Allabolag's own report download links (may not be .pdf extension)
  const reportLinkRegex = /href="([^"]*(?:arsredovisning|annual.?report|dokument)[^"]*)"/gi;
  while ((match = reportLinkRegex.exec(html)) !== null) {
    if (!pdfLinks.includes(match[1])) {
      pdfLinks.push(match[1]);
    }
  }

  // If we found PDF links, try to download the most relevant one
  if (pdfLinks.length > 0) {
    // Prefer links matching the requested year
    let targetLink = pdfLinks[0];
    if (year) {
      const yearLink = pdfLinks.find((l) => l.includes(String(year)));
      if (yearLink) targetLink = yearLink;
    }

    // Make absolute URL
    if (targetLink.startsWith("/")) {
      targetLink = `https://www.allabolag.se${targetLink}`;
    } else if (!targetLink.startsWith("http")) {
      targetLink = `https://www.allabolag.se/${targetLink}`;
    }

    try {
      const pdfResponse = await fetch(targetLink, {
        signal: AbortSignal.timeout(20000),
        headers: { "User-Agent": "Strale/1.0 annual-report-extract" },
      });

      if (pdfResponse.ok) {
        const pdfBuffer = await pdfResponse.arrayBuffer();
        if (pdfBuffer.byteLength > 1000) {
          return {
            pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
            source: `allabolag.se (${targetLink})`,
          };
        }
      }
    } catch {
      // Fall through to alternative strategies
    }
  }

  // Strategy 2: If no PDF found, extract financial data from the page itself
  // The Allabolag arsredovisning page may have summary data even without a PDF
  // We'll pass the HTML text to the LLM instead
  const pageText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (pageText.length > 500) {
    // Encode text as base64 to pass through the same interface
    return {
      pdfBase64: Buffer.from(pageText, "utf-8").toString("base64"),
      source: `allabolag.se/arsredovisning (page text)`,
    };
  }

  throw new Error(
    `Could not find an annual report for org number ${orgNumber}. The company may not have published one yet.`,
  );
}

registerCapability(
  "annual-report-extract",
  async (input: CapabilityInput) => {
    const rawInput =
      (input.org_number as string) ?? (input.task as string) ?? "";
    const year = input.year as number | undefined;

    if (typeof rawInput !== "string" || !rawInput.trim()) {
      throw new Error(
        "'org_number' is required. Provide a Swedish organization number (e.g. 556703-7485).",
      );
    }

    const trimmed = rawInput.trim();
    const orgNumber = parseOrgNumber(trimmed) ?? findOrgNumber(trimmed);

    if (!orgNumber) {
      throw new Error(
        `Could not parse a valid Swedish organization number from: "${trimmed}". Expected format: NNNNNN-NNNN (e.g. 556703-7485).`,
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is required for annual report extraction.",
      );
    }

    // Step 1: Find and download the annual report
    const { pdfBase64, source } = await findAnnualReportPdf(orgNumber, year);

    // Step 2: Send to Claude for extraction
    const client = new Anthropic({ apiKey });

    // Determine if we have a PDF or page text
    const isPdf = source.includes("page text") ? false : true;

    let messages: Anthropic.MessageCreateParams["messages"];

    if (isPdf) {
      // Send as document (PDF)
      messages = [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            {
              type: "text",
              text: `${EXTRACTION_PROMPT}\n\nThis is an annual report (årsredovisning) for a Swedish company with org number ${orgNumber}.${year ? ` Focus on fiscal year ${year}.` : ""}`,
            },
          ],
        },
      ];
    } else {
      // Send as text (page content fallback)
      const pageText = Buffer.from(pdfBase64, "base64").toString("utf-8");
      // Truncate to stay within context
      const truncated =
        pageText.length > 80000
          ? pageText.slice(0, 80000) + "\n\n[Content truncated]"
          : pageText;

      messages = [
        {
          role: "user",
          content: `${EXTRACTION_PROMPT}\n\nThis is extracted text from an annual report page for a Swedish company with org number ${orgNumber}.${year ? ` Focus on fiscal year ${year}.` : ""}\n\n--- REPORT CONTENT ---\n${truncated}\n--- END REPORT CONTENT ---\n\nReturn ONLY valid JSON.`,
        },
      ];
    }

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages,
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    const jsonStr = text
      .trim()
      .replace(/^```(?:json)?\s*\n?/i, "")
      .replace(/\n?```\s*$/i, "")
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new Error(
        `Failed to parse annual report extraction result. Raw response: ${text.slice(0, 300)}`,
      );
    }

    return {
      output: parsed,
      provenance: {
        source,
        fetched_at: new Date().toISOString(),
      },
    };
  },
);
