import Anthropic from "@anthropic-ai/sdk";
import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("pdf-extract", async (input: CapabilityInput) => {
  const url = input.url as string | undefined;
  const base64Input = input.base64 as string | undefined;
  const extract = (input.extract as string) || (input.task as string) || "";

  if (!url && !base64Input) {
    throw new Error(
      "'url' or 'base64' is required. Provide a URL to a PDF or a base64-encoded PDF.",
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for pdf-extract.");

  // Get PDF content as base64
  let pdfBase64: string;
  let sourceInfo: string;

  if (url) {
    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: "${url}".`);
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Only http and https URLs are supported.");
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "Strale/1.0 pdf-extract" },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: HTTP ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    pdfBase64 = Buffer.from(buffer).toString("base64");
    sourceInfo = `pdf-extract:url:${parsedUrl.hostname}`;
  } else {
    // Clean base64 input
    let cleanBase64 = base64Input!;
    const dataUriMatch = cleanBase64.match(/^data:([^;]+);base64,(.+)$/);
    if (dataUriMatch) {
      cleanBase64 = dataUriMatch[2];
    }
    pdfBase64 = cleanBase64;
    sourceInfo = "pdf-extract:base64";
  }

  const extractionPrompt = extract
    ? `Extract the following data from this PDF document and return it as structured JSON:\n\n${extract}`
    : "Extract the main content and key data from this PDF document and return it as structured JSON.";

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          } as any,
          {
            type: "text",
            text: `${extractionPrompt}\n\nReturn ONLY valid JSON. No markdown, no explanation, no code fences. Just the JSON object.`,
          },
        ],
      },
    ],
  });

  const responseText =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonStr = responseText
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse extraction result as JSON. Raw: ${responseText.slice(0, 300)}`);
  }

  return {
    output: {
      data: parsed,
      source_url: url || null,
    },
    provenance: {
      source: sourceInfo,
      fetched_at: new Date().toISOString(),
    },
  };
});
