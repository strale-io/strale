// OpenSanctions commercial API tier confirmed (DEC-20260320-E).
// Standard tier at €0.10/call. Uses OPENSANCTIONS_API_KEY env var.

import { registerCapability, type CapabilityInput } from "./index.js";

// OpenSanctions API — PEP-specific search
const OPENSANCTIONS_API = "https://api.opensanctions.org/match/default";

registerCapability("pep-check", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.task as string) ?? "").trim();
  if (!name) {
    throw new Error("'name' is required. Provide a person's full name to screen.");
  }

  const dateOfBirth = ((input.date_of_birth as string) ?? (input.birth_date as string) ?? "").trim() || undefined;
  const country = ((input.country as string) ?? "").trim().toUpperCase() || undefined;

  const query: Record<string, unknown> = {
    schema: "Person",
    properties: {
      name: [name],
    },
  };

  if (dateOfBirth) {
    (query.properties as any).birthDate = [dateOfBirth];
  }
  if (country) {
    (query.properties as any).country = [country];
  }

  const body = { queries: { q1: query } };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const opensanctionsKey = process.env.OPENSANCTIONS_API_KEY;
  if (opensanctionsKey) {
    headers["Authorization"] = `ApiKey ${opensanctionsKey}`;
  }

  const res = await fetch(OPENSANCTIONS_API, {
    method: "POST",
    headers,
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
      let pepLevel = "unknown";
      if (topics.includes("role.pep")) pepLevel = "pep";
      else if (topics.includes("role.rca")) pepLevel = "close_associate";
      else if (topics.some((t: string) => t.startsWith("role."))) pepLevel = "related";

      // Derive relationship from topics
      let relationship = "direct";
      if (topics.includes("role.rca")) relationship = "close_associate";
      else if (topics.includes("role.family")) relationship = "family_member";

      return {
        name: r.properties?.name?.[0] ?? r.caption ?? "Unknown",
        score: r.score ?? 0,
        position: r.properties?.position?.[0] ?? null,
        jurisdiction: (r.properties?.country ?? [])[0] ?? null,
        pep_level: pepLevel,
        relationship,
        datasets: r.datasets ?? [],
      };
    })
    .slice(0, 20);

  // Also check all results (not just PEP-tagged) for high-confidence matches
  const allHighConf = results
    .filter((r: any) => r.score > 0.7)
    .map((r: any) => ({
      name: r.properties?.name?.[0] ?? r.caption ?? "Unknown",
      score: r.score ?? 0,
      position: r.properties?.position?.[0] ?? null,
      jurisdiction: (r.properties?.country ?? [])[0] ?? null,
      pep_level: "potential",
      relationship: "direct",
      datasets: r.datasets ?? [],
    }));

  // Merge, deduplicate by name
  const seen = new Set(pepMatches.map((m: any) => m.name));
  const merged = [
    ...pepMatches,
    ...allHighConf.filter((m: any) => !seen.has(m.name)),
  ].slice(0, 20);

  // Collect unique dataset sources
  const checkedSources = [
    ...new Set(
      results.flatMap((r: any) => r.datasets ?? []),
    ),
  ];

  return {
    output: {
      query: { name, country: country ?? null, date_of_birth: dateOfBirth ?? null },
      is_pep: merged.some((m) => m.score > 0.6 && (m.pep_level === "pep" || m.pep_level === "close_associate")),
      pep_matches: merged,
      checked_sources: checkedSources.length > 0 ? checkedSources : ["OpenSanctions (consolidated)"],
    },
    provenance: { source: "opensanctions.org", fetched_at: new Date().toISOString() },
  };
});
