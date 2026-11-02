/** Channel labels only. Never persist a URL, address, IP or arbitrary payload. */
import { isIP } from "node:net";
import { resolveDiscoverySource } from "./discovery-source.js";

export function normaliseSignupSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim().toLowerCase();
  return /^[a-z0-9-]{1,64}$/.test(label) && /[a-z]/.test(label) ? label : null;
}

export function resolveSignupSource(req: {
  query(name: string): string | undefined;
  header(name: string): string | undefined;
}, body: Record<string, unknown>): string | null {
  // Precedence applies to supplied fields; invalid explicit input stays null.
  const explicit = [req.query("src"), body.src, req.query("utm_source"), body.utm_source]
    .find(value => value !== undefined && value !== null && !(typeof value === "string" && !value.trim()));
  if (explicit !== undefined && explicit !== null) return normaliseSignupSource(explicit);
  const referer = req.header("referer") ?? req.header("referrer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const host = url.hostname.toLowerCase();
    if (["strale.dev", "strale.io"].some(own => host === own || host.endsWith(`.${own}`))) return null;
    if (!["http:", "https:"].includes(url.protocol) || isIP(host.replace(/^\[|\]$/g, "")) || !host.includes(".")) return null;
    const known = resolveDiscoverySource({ referer });
    return known && !known.tag.startsWith("ref:") ? normaliseSignupSource(known.tag) : null;
  } catch { return null; }
}
