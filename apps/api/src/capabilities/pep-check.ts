import { registerCapability, type CapabilityInput } from "./index.js";

// OpenSanctions API — PEP-specific search
const OPENSANCTIONS_API = "https://api.opensanctions.org/match/default";

registerCapability("pep-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.task as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person's full name to screen.");
  }

  const birthDate = ((input.birth_date as string) ?? "").trim() || undefined;
  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;

  const query: Record<string, unknown> = {
    schema: "Person",
    properties: {
      name: [name],
    },
  };

  if (birthDate) {
    (query.properties as any).birthDate = [birthDate];
  }
  if (country) {
    (query.properties as any).country = [country];
  }

  const body = {
    queries: { q1: query },
  };

  const res = await fetch(OPENSANCTIONS_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenSanctions API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as any;
  const results = data?.responses?.q1?.results ?? [];

  // Filter to PEP-related topics
  const pepMatches = results
    .filter((r: any) => {
      const topics = r.properties?.topics ?? [];
      return (
        r.score > 0.4 &&
        topics.some((t: string) =>
          t === "role.pep" || t === "role.rca" || t.startsWith("role."),
        )
      );
    })
    .map((r: any) => {
      const topics = r.properties?.topics ?? [];
      let pepType = "unknown";
      if (topics.includes("role.pep")) pepType = "pep";
      else if (topics.includes("role.rca")) pepType = "close_associate";
      else if (topics.some((t: string) => t.startsWith("role."))) pepType = "related";

      return {
        name: r.properties?.name?.[0] ?? r.caption ?? "Unknown",
        pep_type: pepType,
        position: r.properties?.position?.[0] ?? null,
        country: (r.properties?.country ?? [])[0] ?? null,
        dataset: (r.datasets ?? [])[0] ?? null,
        score: r.score ?? 0,
        active: r.last_seen ? new Date(r.last_seen) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) : true,
      };
    })
    .slice(0, 20);

  // Also check all results (not just PEP-tagged) for high-confidence matches
  const allHighConf = results
    .filter((r: any) => r.score > 0.7)
    .map((r: any) => ({
      name: r.properties?.name?.[0] ?? r.caption ?? "Unknown",
      pep_type: "potential",
      position: r.properties?.position?.[0] ?? null,
      country: (r.properties?.country ?? [])[0] ?? null,
      dataset: (r.datasets ?? [])[0] ?? null,
      score: r.score ?? 0,
      active: true,
    }));

  // Merge, deduplicate by name
  const seen = new Set(pepMatches.map((m: any) => m.name));
  const merged = [
    ...pepMatches,
    ...allHighConf.filter((m: any) => !seen.has(m.name)),
  ].slice(0, 20);

  return {
    output: {
      query: name,
      birth_date_filter: birthDate ?? null,
      country_filter: country ?? null,
      is_pep: merged.some((m) => m.score > 0.6 && (m.pep_type === "pep" || m.pep_type === "close_associate")),
      total_matches: merged.length,
      matches: merged,
      screened_at: new Date().toISOString(),
    },
    provenance: { source: "opensanctions.org", fetched_at: new Date().toISOString() },
  };
});
