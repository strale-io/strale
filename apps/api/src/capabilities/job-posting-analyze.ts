import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("job-posting-analyze", async (input: CapabilityInput) => {
  const url = (input.url as string)?.trim();
  let text = (input.text as string)?.trim();

  if (!url && !text) throw new Error("'url' or 'text' is required.");

  // Fetch job posting if URL provided
  if (url && !text) {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    try {
      const res = await fetch(fullUrl, {
        headers: { "User-Agent": "Strale/1.0", Accept: "text/html,*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        let html = await res.text();
        html = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
        html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
        html = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        text = html.trim().slice(0, 10000);
      }
    } catch { /* fall through */ }
    if (!text) throw new Error("Could not fetch job posting from URL.");
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Analyze this job posting. Return ONLY valid JSON.

Job posting:
"""
${text!.slice(0, 8000)}
"""

Return JSON:
{
  "title": "job title",
  "company": "company name or null",
  "location": "location or null",
  "remote_policy": "remote/hybrid/onsite/not-specified",
  "salary_range": {"min": <number or null>, "max": <number or null>, "currency": "string or null", "period": "annual/monthly/hourly"},
  "salary_source": "stated/estimated",
  "required_skills": ["hard requirements"],
  "preferred_skills": ["nice to haves"],
  "experience_years": {"min": <number or null>, "max": <number or null>},
  "education_requirement": "string or null",
  "benefits": ["listed benefits"],
  "red_flags": ["concerning aspects of the posting"],
  "culture_signals": ["what the posting reveals about company culture"],
  "seniority_level": "entry/mid/senior/lead/principal/executive",
  "employment_type": "full-time/part-time/contract/freelance",
  "summary": "2-3 sentence assessment of this role"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to analyze job posting.");

  const output = JSON.parse(jsonMatch[0]);
  if (url) output.source_url = url;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
