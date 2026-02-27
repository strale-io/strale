import type { MetadataRoute } from "next";
import { getCapabilities } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const capabilities = await getCapabilities();

  const staticPages: MetadataRoute.Sitemap = [
    { url: "https://strale.dev", changeFrequency: "weekly", priority: 1 },
    { url: "https://strale.dev/capabilities", changeFrequency: "daily", priority: 0.9 },
    { url: "https://strale.dev/pricing", changeFrequency: "weekly", priority: 0.8 },
    { url: "https://strale.dev/docs", changeFrequency: "weekly", priority: 0.8 },
    { url: "https://strale.dev/docs/getting-started", changeFrequency: "weekly", priority: 0.7 },
    { url: "https://strale.dev/docs/api-reference", changeFrequency: "weekly", priority: 0.7 },
    { url: "https://strale.dev/docs/integrations/mcp", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://strale.dev/docs/integrations/langchain", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://strale.dev/docs/integrations/crewai", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://strale.dev/docs/integrations/semantic-kernel", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://strale.dev/docs/integrations/http-api", changeFrequency: "monthly", priority: 0.6 },
    { url: "https://strale.dev/signup", changeFrequency: "monthly", priority: 0.5 },
  ];

  const capabilityPages: MetadataRoute.Sitemap = capabilities.map((cap) => ({
    url: `https://strale.dev/capabilities/${cap.slug}`,
    changeFrequency: "weekly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...capabilityPages];
}
