import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dutch BAG address and building lookup via Kadaster API.
 * Requires BAG_API_KEY env var (free registration at kadaster.nl).
 * Returns address details, building type, construction year, and coordinates.
 */

registerCapability("nl-bag-address", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const huisnummer = String(input.huisnummer ?? input.house_number ?? "").trim();
  const huisletter = ((input.huisletter as string) ?? "").trim().toUpperCase();
  const toevoeging = ((input.toevoeging ?? input.huisnummertoevoeging) as string ?? "").trim();

  if (!postcode || !huisnummer) {
    throw new Error("'postcode' (e.g. '2631CR') and 'huisnummer' (house number) are required.");
  }

  // Validate Dutch postcode format: 4 digits + 2 letters
  if (!/^\d{4}[A-Z]{2}$/.test(postcode)) {
    throw new Error(`Invalid Dutch postcode format '${postcode}'. Expected format: 1234AB.`);
  }

  const apiKey = process.env.BAG_API_KEY;
  if (!apiKey) {
    throw new Error(
      "BAG_API_KEY not configured. Register for a free key at https://formulieren.kadaster.nl/aanvraag_bag_api_individuele_bevragingen_productie",
    );
  }

  // Query BAG extended address endpoint
  const params = new URLSearchParams({
    postcode,
    huisnummer,
    exacteMatch: "true",
  });
  if (huisletter) params.set("huisletter", huisletter);
  if (toevoeging) params.set("huisnummertoevoeging", toevoeging);

  const resp = await fetch(
    `https://api.bag.kadaster.nl/lvbag/individuelebevragingen/v2/adressenuitgebreid?${params}`,
    {
      headers: {
        "X-Api-Key": apiKey,
        Accept: "application/hal+json",
      },
      signal: AbortSignal.timeout(10000),
    },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 401) {
      throw new Error("BAG API key is invalid or expired. Check BAG_API_KEY env var.");
    }
    throw new Error(`BAG API returned HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const embedded = data._embedded as Record<string, unknown> | undefined;
  const addresses = (embedded?.adressen ?? []) as Array<Record<string, unknown>>;

  if (addresses.length === 0) {
    throw new Error(`No address found for postcode '${postcode}' huisnummer '${huisnummer}'.`);
  }

  const addr = addresses[0];

  // Extract key fields from extended address response
  const output: Record<string, unknown> = {
    postcode: addr.postcode,
    huisnummer: addr.huisnummer,
    huisletter: addr.huisletter ?? null,
    huisnummertoevoeging: addr.huisnummertoevoeging ?? null,
    street: addr.openbareRuimteNaam ?? addr.korteNaam,
    city: addr.woonplaatsNaam,
    municipality: addr.gemeenteNaam ?? null,
    province: addr.provincieNaam ?? null,
    full_address: `${addr.openbareRuimteNaam ?? addr.korteNaam} ${addr.huisnummer}${addr.huisletter ?? ""}${addr.huisnummertoevoeging ? `-${addr.huisnummertoevoeging}` : ""}, ${addr.postcode} ${addr.woonplaatsNaam}`,
    nummeraanduiding_id: addr.nummeraanduidingIdentificatie ?? null,
    adresseerbaar_object_id: addr.adresseerbaarObjectIdentificatie ?? null,
    building_type: addr.typeAdresseerbaarObject ?? null,
    construction_year: addr.oorspronkelijkBouwjaar ?? null,
    floor_area_m2: addr.oppervlakte ?? null,
    usage_purpose: addr.gebruiksdoel ?? null,
    status: addr.pandStatus ?? addr.adresseerbaarObjectStatus ?? null,
    coordinates: addr.adresseerbaarObjectGeometrie
      ? {
          type: (addr.adresseerbaarObjectGeometrie as Record<string, unknown>).type,
          coordinates: (addr.adresseerbaarObjectGeometrie as Record<string, unknown>).coordinates,
        }
      : null,
    total_results: addresses.length,
  };

  return {
    output,
    provenance: { source: "api.bag.kadaster.nl", fetched_at: new Date().toISOString() },
  };
});
