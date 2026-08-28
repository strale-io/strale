import { registerCapability, type CapabilityInput } from "./index.js";
import { extractJsonObject } from "./lib/llm-json.js";
import Anthropic from "@anthropic-ai/sdk";
import { safeFetch } from "../lib/safe-fetch.js";
import {
  MAX_DECODED_DOCUMENT_BYTES,
  assertDecodedSizeWithinLimit,
  decodedLengthOfBase64,
  normalizeBase64,
  readBodyWithLimit,
} from "./lib/image-limits.js";

registerCapability("resume-parse", async (input: CapabilityInput) => {
  const pdfUrl = (input.pdf_url as string)?.trim() ?? (input.url as string)?.trim();
  const rawBase64 = (input.base64 as string)?.trim();
  const text = (input.text as string)?.trim();
  // Refusal messages name the field the caller actually used.
  const urlField = input.pdf_url ? "pdf_url" : "url";

  if (!pdfUrl && !rawBase64 && !text) {
    throw new Error("'pdf_url', 'base64', or 'text' is required.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [];

  if (rawBase64) {
    // #412: ONE normalisation (data-URI prefix + whitespace); the SAME string
    // is measured, sniffed, and sent downstream.
    const base64 = normalizeBase64(rawBase64);
    assertDecodedSizeWithinLimit(
      decodedLengthOfBase64(base64),
      "base64",
      MAX_DECODED_DOCUMENT_BYTES,
    );
    // Use vision for image-based resumes
    const mediaType = base64.startsWith("/9j") ? "image/jpeg" : "image/png";
    messages.push({
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
        { type: "text", text: EXTRACT_PROMPT },
      ],
    });
  } else if (pdfUrl) {
    // F-0-006: safeFetch guards SSRF when fetching a user-supplied PDF URL.
    const res = await safeFetch(pdfUrl, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Failed to fetch PDF: HTTP ${res.status}`);
    // #412: streamed with a cap, not arrayBuffer() — a post-buffer length
    // check bounds nothing because the bytes are already resident.
    const buf = await readBodyWithLimit(res, MAX_DECODED_DOCUMENT_BYTES, urlField);
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
      // Treat as image
      const mediaType = contentType.includes("jpeg") || contentType.includes("jpg") ? "image/jpeg" : "image/png";
      messages.push({
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: buf.toString("base64") } },
          { type: "text", text: EXTRACT_PROMPT },
        ],
      });
    }
  } else {
    messages.push({ role: "user", content: `${EXTRACT_PROMPT}\n\nResume text:\n${text!.slice(0, 10000)}` });
  }

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages,
  });

  const responseText = r.content[0]?.type === "text" ? r.content[0].text.trim() : "";
  const parsedOutput = extractJsonObject(responseText);
  if (!parsedOutput) throw new Error("Failed to parse resume.");

  return {
    output: parsedOutput,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});

const EXTRACT_PROMPT = `Extract structured data from this resume/CV. Return ONLY valid JSON.

{
  "name": "full name",
  "email": "email or null",
  "phone": "phone or null",
  "location": "location or null",
  "linkedin": "LinkedIn URL or null",
  "website": "personal website or null",
  "summary": "professional summary or null",
  "experience": [
    {
      "company": "company name",
      "title": "job title",
      "start_date": "start date",
      "end_date": "end date or 'Present'",
      "highlights": ["key achievements/responsibilities"]
    }
  ],
  "education": [
    {
      "institution": "school name",
      "degree": "degree type and field",
      "start_date": "start or null",
      "end_date": "end or null",
      "gpa": "GPA or null"
    }
  ],
  "skills": ["list of skills"],
  "certifications": ["list of certifications"],
  "languages": ["list of languages"],
  "total_experience_years": <estimated number>
}`;
