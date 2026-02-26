import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml, htmlToText } from "./lib/browserless-extract.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("structured-scrape", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const schema = input.schema ?? input.extract_schema ?? input.fields;
  if (!schema) throw new Error("'schema' is required. Provide a JSON schema describing the data to extract.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  const html = await fetchRenderedHtml(fullUrl);
  const text = htmlToText(html);

  if (text.length < 50) throw new Error(`Page at ${fullUrl} returned too little content.`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const schemaStr = typeof schema === "string" ? schema : JSON.stringify(schema, null, 2);

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract data from this web page according to the given schema. Return ONLY valid JSON matching the schema.

Schema:
${schemaStr}

Page text:
${text.slice(0, 12000)}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/[\[{][\s\S]*[\]}]/);
  if (!jsonMatch) throw new Error("Failed to extract structured data from the page.");

  const data = JSON.parse(jsonMatch[0]);

  return {
    output: { data, url: fullUrl },
    provenance: { source: "browserless+claude", fetched_at: new Date().toISOString() },
  };
});
