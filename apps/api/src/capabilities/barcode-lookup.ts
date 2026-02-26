import { registerCapability, type CapabilityInput } from "./index.js";

// Open Food Facts API (free) + UPC ItemDB fallback
registerCapability("barcode-lookup", async (input: CapabilityInput) => {
  const barcode = ((input.barcode as string) ?? (input.upc as string) ?? (input.ean as string) ?? (input.task as string) ?? "").trim();
  if (!barcode) throw new Error("'barcode' (UPC/EAN barcode number) is required.");

  // Validate barcode format (8-14 digits)
  const cleaned = barcode.replace(/[\s-]/g, "");
  if (!/^\d{8,14}$/.test(cleaned)) throw new Error("Invalid barcode format. Expected 8-14 digit UPC/EAN.");

  // Try Open Food Facts first (best for food/drink products)
  try {
    const offUrl = `https://world.openfoodfacts.org/api/v2/product/${cleaned}.json`;
    const offResp = await fetch(offUrl, {
      headers: { "User-Agent": "StraleAPI/1.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (offResp.ok) {
      const offData = (await offResp.json()) as any;
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
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
    }
  } catch { /* fall through to next source */ }

  // Try UPC ItemDB as fallback
  try {
    const upcUrl = `https://api.upcitemdb.com/prod/trial/lookup?upc=${cleaned}`;
    const upcResp = await fetch(upcUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });

    if (upcResp.ok) {
      const upcData = (await upcResp.json()) as any;
      if (upcData.items?.length > 0) {
        const item = upcData.items[0];
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
          provenance: { source: "api.upcitemdb.com", fetched_at: new Date().toISOString() },
        };
      }
    }
  } catch { /* fall through */ }

  return {
    output: {
      barcode: cleaned,
      found: false,
      message: `No product found for barcode ${cleaned}. The product may not be in the database.`,
    },
    provenance: { source: "barcode-lookup", fetched_at: new Date().toISOString() },
  };
});
