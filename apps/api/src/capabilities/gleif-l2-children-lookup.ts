import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * GLEIF Level 2 (Who Owns Whom) — children lookup.
 *
 * Returns direct or ultimate child LEI records for a given entity. Useful
 * for due-diligence questions like "is this a holding company?" or "what
 * subsidiaries does this entity own?". Pairs with `gleif-l2-ubo-lookup`
 * which goes the other direction (parents).
 *
 * Free, no auth, CC0-equivalent license. Coverage limited to entities
 * that have an LEI (~2.6M globally, mostly large/regulated). Children
 * are entities that themselves have LEIs and report this entity as
 * direct or ultimate parent.
 */

const GLEIF_API = "https://api.gleif.org/api/v1";
const LEI_RE = /^[A-Z0-9]{20}$/;

type ChildInfo = {
  lei: string;
  legal_name: string;
  jurisdiction: string | null;
  country: string | null;
};

async function gleifFetch(path: string): Promise<Response> {
  return fetch(`${GLEIF_API}${path}`, {
    headers: { Accept: "application/vnd.api+json" },
    signal: AbortSignal.timeout(10000),
  });
}

async function lookupByLei(lei: string): Promise<{ lei: string; legal_name: string; jurisdiction: string | null }> {
  const res = await gleifFetch(`/lei-records/${lei}`);
  if (res.status === 404) throw new Error(`LEI ${lei} not found in GLEIF database.`);
  if (!res.ok) throw new Error(`GLEIF API returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const entity = data?.data?.attributes?.entity ?? {};
  return {
    lei: data?.data?.attributes?.lei || lei,
    legal_name: entity.legalName?.name || "",
    jurisdiction: entity.jurisdiction || null,
  };
}

async function searchByName(name: string, jurisdiction?: string): Promise<string> {
  let url = `/lei-records?filter[entity.legalName]=${encodeURIComponent(name)}&page[size]=5`;
  if (jurisdiction) url += `&filter[entity.legalAddress.country]=${encodeURIComponent(jurisdiction)}`;
  const res = await gleifFetch(url);
  if (!res.ok) throw new Error(`GLEIF search returned HTTP ${res.status}`);
  const data = (await res.json()) as any;
  const records: any[] = data?.data ?? [];
  if (records.length === 0) throw new Error(`No LEI found matching "${name}".`);
  const active = records.find((r) => r?.attributes?.entity?.status === "ACTIVE");
  return (active ?? records[0])?.attributes?.lei;
}

function mapChild(record: any): ChildInfo {
  const entity = record?.attributes?.entity ?? {};
  return {
    lei: record?.attributes?.lei || record?.id || "",
    legal_name: entity.legalName?.name || "",
    jurisdiction: entity.jurisdiction || null,
    country: entity.legalAddress?.country || null,
  };
}

registerCapability("gleif-l2-children-lookup", async (input: CapabilityInput) => {
  const leiInput = (input.lei as string)?.trim().toUpperCase() ?? "";
  const companyName = (input.company_name as string)?.trim() ?? "";
  const jurisdiction = (input.jurisdiction as string)?.trim().toUpperCase() ?? undefined;
  const level = ((input.level as string) ?? "direct").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 200);

  if (!leiInput && !companyName) {
    throw new Error("'lei' or 'company_name' is required. Provide a 20-character LEI or a company name to search.");
  }

  if (level !== "direct" && level !== "ultimate") {
    throw new Error(`Invalid level: "${level}". Must be "direct" or "ultimate".`);
  }

  const lei = LEI_RE.test(leiInput) ? leiInput : await searchByName(companyName, jurisdiction);

  // Fetch entity record + first page of children
  const [entity, childrenRes] = await Promise.all([
    lookupByLei(lei),
    gleifFetch(`/lei-records/${lei}/${level}-children?page[size]=${limit}`),
  ]);

  let totalChildren = 0;
  let children: ChildInfo[] = [];

  if (childrenRes.ok) {
    const data = (await childrenRes.json()) as any;
    totalChildren = data?.meta?.pagination?.total ?? (data?.data?.length ?? 0);
    children = (data?.data ?? []).map(mapChild);
  } else if (childrenRes.status !== 404) {
    throw new Error(`GLEIF L2 children endpoint returned HTTP ${childrenRes.status}`);
  }
  // 404 → no children, return totals=0

  return {
    output: {
      input_lei: entity.lei,
      legal_name: entity.legal_name,
      jurisdiction: entity.jurisdiction,
      level,
      total_children: totalChildren,
      has_children: totalChildren > 0,
      is_holding_entity: totalChildren > 0,
      children,
      paginated: totalChildren > children.length,
      data_source: "GLEIF Level 2 (Who Owns Whom)",
    },
    provenance: {
      source: "gleif.org",
      fetched_at: new Date().toISOString(),
    },
  };
});
