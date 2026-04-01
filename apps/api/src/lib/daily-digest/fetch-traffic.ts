import type { WebsiteTraffic } from "./types.js";

export async function getWebsiteTraffic(): Promise<WebsiteTraffic> {
  return {
    straleDev: {
      available: false,
      note: "No analytics installed. Add Plausible (plausible.io) to strale.dev for tracking.",
    },
    beacon: {
      available: false,
      note: "Vercel Analytics enabled but API access requires Pro plan. Consider adding Plausible.",
    },
  };
}
