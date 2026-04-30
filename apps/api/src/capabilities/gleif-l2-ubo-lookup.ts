import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * GLEIF Level 2 (Who Owns Whom) UBO supplement.
 *
 * For any LEI-bearing entity, returns direct + ultimate parent relationships
 * if reported, or the structured reporting exception (NATURAL_PERSONS,
 * NON_CONSOLIDATING, NO_KNOWN_PERSON, etc.) if the entity declares a
 * reason for not reporting a parent.
 *
 * Free, no auth, CC0-equivalent license. Coverage is limited to entities
 * that have an LEI (~2.6M globally, mostly large/regulated). Acts as a UBO
 * supplement, not a replacement — pairs with country registries for SMEs.
 */

const GLEIF_API = "https://api.gleif.org/api/v1";
const LEI_RE = /^[A-Z0-9]{20}$/;

type ParentInfo = {
  lei: string;
  legal_name: string;
  jurisdiction: string | null;
  country: string | null;
};

type ReportingException = {
  category: string | null;
  reason: string | null;
  reference: string | null;
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
  // Prefer ACTIVE status; otherwise first result
  const active = records.find((r) => r?.attributes?.entity?.status === "ACTIVE");
  return (active ?? records[0])?.attributes?.lei;
}

function parseParent(payload: any): ParentInfo | null {
  const record = payload?.data;
  if (!record || record.type !== "lei-records") return null;
  const entity = record.attributes?.entity ?? {};
  return {
    lei: record.attributes?.lei || record.id || "",
    legal_name: entity.legalName?.name || "",
    jurisdiction: entity.jurisdiction || null,
    country: entity.legalAddress?.country || null,
  };
}

function parseException(payload: any): ReportingException | null {
  const record = payload?.data;
  if (!record || record.type !== "reporting-exceptions") return null;
  return {
    category: record.attributes?.category ?? null,
    reason: record.attributes?.reason ?? null,
    reference: record.attributes?.reference ?? null,
  };
}

async function fetchParentOrException(
  lei: string,
  level: "direct" | "ultimate",
): Promise<{ parent: ParentInfo | null; exception: ReportingException | null }> {
  const parentRes = await gleifFetch(`/lei-records/${lei}/${level}-parent`);

  if (parentRes.ok) {
    const parsed = parseParent(await parentRes.json());
    return { parent: parsed, exception: null };
  }

  // 404 on the parent endpoint means either (a) a reporting exception is filed,
  // or (b) the entity simply has no parent record at all. Check the exception
  // endpoint to disambiguate.
  if (parentRes.status === 404) {
    const excRes = await gleifFetch(`/lei-records/${lei}/${level}-parent-reporting-exception`);
    if (excRes.ok) {
      return { parent: null, exception: parseException(await excRes.json()) };
    }
    if (excRes.status === 404) {
      return { parent: null, exception: null };
    }
    throw new Error(`GLEIF L2 exception endpoint returned HTTP ${excRes.status}`);
  }

  throw new Error(`GLEIF L2 parent endpoint returned HTTP ${parentRes.status}`);
}

registerCapability("gleif-l2-ubo-lookup", async (input: CapabilityInput) => {
  const leiInput = (input.lei as string)?.trim().toUpperCase() ?? "";
  const companyName = (input.company_name as string)?.trim() ?? "";
  const jurisdiction = (input.jurisdiction as string)?.trim().toUpperCase() ?? undefined;

  if (!leiInput && !companyName) {
    throw new Error("'lei' or 'company_name' is required. Provide a 20-character LEI or a company name to search.");
  }

  const lei = LEI_RE.test(leiInput) ? leiInput : await searchByName(companyName, jurisdiction);

  // Fetch entity record + both parents in parallel
  const [entity, direct, ultimate] = await Promise.all([
    lookupByLei(lei),
    fetchParentOrException(lei, "direct"),
    fetchParentOrException(lei, "ultimate"),
  ]);

  const isTopOfTree =
    !direct.parent &&
    !ultimate.parent &&
    (direct.exception !== null || ultimate.exception !== null);

  const ownershipChainComplete = direct.parent !== null && ultimate.parent !== null;

  return {
    output: {
      input_lei: entity.lei,
      legal_name: entity.legal_name,
      jurisdiction: entity.jurisdiction,
      direct_parent: direct.parent,
      direct_parent_exception: direct.exception,
      ultimate_parent: ultimate.parent,
      ultimate_parent_exception: ultimate.exception,
      has_direct_parent: direct.parent !== null,
      has_ultimate_parent: ultimate.parent !== null,
      is_top_of_tree: isTopOfTree,
      ownership_chain_complete: ownershipChainComplete,
      data_source: "GLEIF Level 2 (Who Owns Whom)",
    },
    provenance: {
      source: "gleif.org",
      fetched_at: new Date().toISOString(),
    },
  };
});
