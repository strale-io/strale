import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchUnavailable, httpUnavailable, quotedLegCodes, UpstreamUnavailableError } from "../lib/upstream-result.js";

const OFF = "Open Food Facts product API";
const UPCITEMDB = "UPCitemdb lookup API";

/**
 * Open Food Facts' answer for one barcode: the product, or null when Open Food
 * Facts says it has none. It answers an unknown product with HTTP 404 and a
 * code it cannot read with HTTP 200, both carrying `status: 0` (live,
 * 2026-11-11). Anything else (a timeout, 429, 5xx, a body without a status) is
 * not an answer and throws.
 */
async function lookupOpenFoodFacts(code: string): Promise<Record<string, any> | null> {
  let resp: Response;
  try {
    resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: { "User-Agent": "StraleAPI/1.0" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw fetchUnavailable(OFF, err);
  }
  if (!resp.ok && resp.status !== 404) {
    await resp.body?.cancel();
    throw httpUnavailable(OFF, resp.status);
  }
  let data: any;
  try {
    data = await resp.json();
  } catch (err) {
    throw fetchUnavailable(OFF, err);
  }
  if (data?.status === 1 && data.product && typeof data.product === "object") return data.product;
  if (data?.status === 0) return null;
  throw new UpstreamUnavailableError(OFF, "the reply carried no product status.", { code: "unparseable", retryable: false });
}

/**
 * UPCitemdb's answer: its first item, or null when it has none. It answers an
 * unknown code with `items: []` and a code that fails its check digit with
 * HTTP 400 `INVALID_UPC` (live, 2026-11-11); both mean it holds no such
 * product. Its trial tier rate-limits with 429, which is not an answer.
 */
async function lookupUpcItemDb(code: string): Promise<Record<string, any> | null> {
  let resp: Response;
  try {
    resp = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${code}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw fetchUnavailable(UPCITEMDB, err);
  }
  if (!resp.ok && resp.status !== 400) {
    await resp.body?.cancel();
    throw httpUnavailable(UPCITEMDB, resp.status);
  }
  let data: any;
  try {
    data = await resp.json();
  } catch (err) {
    throw fetchUnavailable(UPCITEMDB, err);
  }
  if (resp.status === 400) {
    if (data?.code === "INVALID_UPC") return null;
    throw httpUnavailable(UPCITEMDB, 400);
  }
  if (Array.isArray(data?.items)) return data.items[0] ?? null;
  throw new UpstreamUnavailableError(UPCITEMDB, "the reply carried no item list.", { code: "unparseable", retryable: false });
}

// Open Food Facts API (free) + UPC ItemDB fallback
registerCapability("barcode-lookup", async (input: CapabilityInput) => {
  const barcode = ((input.barcode as string) ?? (input.upc as string) ?? (input.ean as string) ?? (input.task as string) ?? "").trim();
  if (!barcode) throw new Error("'barcode' (UPC/EAN barcode number) is required.");

  // Validate barcode format (8-14 digits)
  const cleaned = barcode.replace(/[\s-]/g, "");
  if (!/^\d{8,14}$/.test(cleaned)) throw new Error("Invalid barcode format. Expected 8-14 digit UPC/EAN.");

  // "found: false" is an answer only when both databases said they hold no
  // such product. A source that could not answer is kept and thrown below
  // unless the other source finds the product.
  const failures: UpstreamUnavailableError[] = [];

  // Try Open Food Facts first (best for food/drink products)
  let p: Record<string, any> | null = null;
  try {
    p = await lookupOpenFoodFacts(cleaned);
  } catch (err) {
    // degraded-ok: an Open Food Facts outage is recorded here and thrown below unless UPCitemdb finds the product; it is never read as "not found".
    if (!(err instanceof UpstreamUnavailableError)) throw err;
    failures.push(err);
  }
  if (p) {
    return {
      output: {
        barcode: cleaned,
        found: true,
        source: "open_food_facts",
        product_name: p.product_name ?? p.product_name_en ?? null,
        brand: p.brands ?? null,
        categories: p.categories ?? null,
        quantity: p.quantity ?? null,
        ingredients: p.ingredients_text ?? p.ingredients_text_en ?? null,
        nutriscore_grade: p.nutriscore_grade ?? null,
        nova_group: p.nova_group ?? null,
        ecoscore_grade: p.ecoscore_grade ?? null,
        image_url: p.image_url ?? null,
        countries: p.countries ?? null,
        allergens: p.allergens ?? null,
        nutrition: p.nutriments ? {
          energy_kcal: p.nutriments["energy-kcal_100g"] ?? null,
          fat_g: p.nutriments.fat_100g ?? null,
          carbs_g: p.nutriments.carbohydrates_100g ?? null,
          protein_g: p.nutriments.proteins_100g ?? null,
          salt_g: p.nutriments.salt_100g ?? null,
          sugar_g: p.nutriments.sugars_100g ?? null,
        } : null,
      },
      provenance: { source: "world.openfoodfacts.org", fetched_at: new Date().toISOString() },
    };
  }

  // Try UPC ItemDB as fallback
  let item: Record<string, any> | null = null;
  try {
    item = await lookupUpcItemDb(cleaned);
  } catch (err) {
    // degraded-ok: a UPCitemdb outage is recorded here and thrown below, since the product is not known to be absent; it is never read as "not found".
    if (!(err instanceof UpstreamUnavailableError)) throw err;
    failures.push(err);
  }
  if (item) {
    return {
      output: {
        barcode: cleaned,
        found: true,
        source: "upcitemdb",
        product_name: item.title ?? null,
        brand: item.brand ?? null,
        categories: item.category ?? null,
        description: item.description ?? null,
        weight: item.weight ?? null,
        image_url: item.images?.[0] ?? null,
        ean: item.ean ?? null,
        upc: item.upc ?? null,
      },
      provenance: {
        source: "api.upcitemdb.com",
        fetched_at: new Date().toISOString(),
        acquisition_method: "vendor_api",
        upstream_vendor: "upcitemdb",
      },
    };
  }

  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new UpstreamUnavailableError(
      `${OFF} and ${UPCITEMDB}`,
      `neither database answered (${quotedLegCodes(failures)}).`,
      { code: failures[0].code, retryable: failures.some((f) => f.retryable) },
    );
  }

  return {
    output: {
      barcode: cleaned,
      found: false,
      message: `No product found for barcode ${cleaned}. The product may not be in the database.`,
    },
    provenance: { source: "barcode-lookup", fetched_at: new Date().toISOString() },
  };
});
