import type { BeaconActivity } from "./types.js";
import { logWarn } from "../log.js";

export async function getBeaconActivity(): Promise<BeaconActivity> {
  const baseUrl = process.env.BEACON_SUPABASE_URL;
  const key = process.env.BEACON_SUPABASE_SERVICE_ROLE_KEY;

  if (!baseUrl || !key) {
    return { scansLast24h: 0, scanDomains: [], newSubscribers: 0, totalScans: 0 };
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };

  try {
    const [scansResp, countResp, subsResp] = await Promise.all([
      fetch(`${baseUrl}/rest/v1/scans?select=slug,domain,scanned_at&order=scanned_at.desc&limit=200`, {
        headers,
        signal: AbortSignal.timeout(15000),
      }),
      fetch(`${baseUrl}/rest/v1/scans?select=id`, {
        headers: { ...headers, Prefer: "count=exact", Range: "0-0" },
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      }),
      fetch(`${baseUrl}/rest/v1/subscribers?select=id,created_at&order=created_at.desc&limit=50`, {
        headers,
        signal: AbortSignal.timeout(10000),
      }).catch(() => null),
    ]);

    // Recent scans
    let scansLast24h = 0;
    const scanDomains = new Set<string>();
    if (scansResp.ok) {
      const scans = await scansResp.json() as Array<{ slug: string; domain: string; scanned_at: string }>;
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const s of scans) {
        if (new Date(s.scanned_at).getTime() >= cutoff) {
          scansLast24h++;
          scanDomains.add(s.domain || s.slug);
        }
      }
    }

    // Total count from content-range header
    const rangeHeader = countResp.headers.get("content-range") ?? "";
    const totalMatch = rangeHeader.match(/\/(\d+)/);
    const totalScans = totalMatch ? parseInt(totalMatch[1], 10) : 0;

    // New subscribers
    let newSubscribers = 0;
    if (subsResp?.ok) {
      const subs = await subsResp.json() as Array<{ created_at: string }>;
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      newSubscribers = subs.filter((s) => new Date(s.created_at).getTime() >= cutoff).length;
    }

    return {
      scansLast24h,
      scanDomains: [...scanDomains],
      newSubscribers,
      totalScans,
    };
  } catch (err) {
    logWarn("digest-beacon-unreachable", "beacon Supabase unreachable", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { scansLast24h: 0, scanDomains: [], newSubscribers: 0, totalScans: 0 };
  }
}
