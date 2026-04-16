import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "../lib/safe-fetch.js";

registerCapability("contract-extract", async (input: CapabilityInput) => {
  const pdfUrl = (input.pdf_url as string)?.trim() ?? (input.url as string)?.trim();
  const base64 = (input.base64 as string)?.trim();
  const text = (input.text as string)?.trim();

  if (!pdfUrl && !base64 && !text) {
    throw new Error("'pdf_url', 'base64', or 'text' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [];

  if (base64) {
    const mediaType = detectMediaType(base64);
    if (mediaType === "application/pdf") {
      messages.push({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType as "image/png" | "image/jpeg", data: base64 } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      });
    }
  } else if (pdfUrl) {
    // F-0-006: safeFetch validates + refuses DNS-rebinding and redirect-to-private.
    const res = await safeFetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Failed to fetch document: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("pdf")) {
      messages.push({
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      });
    } else {
      const mediaType = contentType.includes("jpeg") ? "image/jpeg" : "image/png";
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      });
    }
  } else {
    messages.push({ role: "user", content: `${EXTRACT_PROMPT}\n\nContract text:\n${text!.slice(0, 12000)}` });
  }

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages,
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract contract data.");

  const output = JSON.parse(jsonMatch[0]);
  output.disclaimer = "AI-extracted summary. Not legal advice. Verify all terms against the original document.";

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});

function detectMediaType(b64: string): string {
  if (b64.startsWith("JVBERi")) return "application/pdf";
  if (b64.startsWith("/9j")) return "image/jpeg";
  return "image/png";
}

const EXTRACT_PROMPT = `Extract structured data from this contract/legal document. Return ONLY valid JSON.

{
  "document_type": "string (e.g. NDA, SaaS Agreement, Employment Contract, Service Agreement)",
  "parties": [{"name": "party name", "role": "role (e.g. Provider, Client, Employer)"}],
  "effective_date": "date or null",
  "termination_date": "date or null",
  "key_obligations": [{"party": "who", "obligation": "what"}],
  "payment_terms": {"amount": "string or null", "frequency": "string or null", "due_date": "string or null"},
  "liability_caps": ["liability limitations"],
  "termination_clauses": ["how the contract can be terminated"],
  "governing_law": "jurisdiction or null",
  "renewal_terms": "auto-renewal details or null",
  "confidentiality": "summary of confidentiality terms or null",
  "unusual_clauses": ["anything non-standard or noteworthy"],
  "summary": "2-3 sentence summary of the contract"
}`;
