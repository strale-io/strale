import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dutch energy performance label lookup via EP-Online REST API v5.
 * Requires EP_ONLINE_API_KEY env var (free registration at apikey.ep-online.nl).
 * Returns energy class (A–G), energy index, CO2 emissions, and building details.
 */

registerCapability("nl-energy-label", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const huisnummer = String(input.huisnummer ?? input.house_number ?? "").trim();
  const huisletter = ((input.huisletter as string) ?? "").trim().toLowerCase();
  const toevoeging = ((input.toevoeging ?? input.huisnummertoevoeging) as string ?? "").trim();
  const bagId = ((input.bag_id ?? input.pand_id) as string ?? "").trim();

  if (!bagId && (!postcode || !huisnummer)) {
    throw new Error(
      "'postcode' + 'huisnummer', or 'bag_id' (BAG verblijfsobject ID) is required.",
    );
  }

  if (postcode && !/^\d{4}[A-Z]{2}$/.test(postcode)) {
    throw new Error(`Invalid Dutch postcode format '${postcode}'. Expected format: 1234AB.`);
  }

  const apiKey = process.env.EP_ONLINE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EP_ONLINE_API_KEY not configured. Register for a free key at https://apikey.ep-online.nl",
    );
  }

  // EP-Online REST API v5
  let url: string;
  if (bagId) {
    url = `https://public.ep-online.nl/api/v5/PandEnergielabel/AdresseerbaarObject/${encodeURIComponent(bagId)}`;
  } else {
    const params = new URLSearchParams({ postcode, huisnummer });
    if (huisletter) params.set("huisletter", huisletter);
    if (toevoeging) params.set("huisnummertoevoeging", toevoeging);
    url = `https://public.ep-online.nl/api/v5/PandEnergielabel/Adres?${params}`;
  }

  const resp = await fetch(url, {
    headers: {
      Authorization: apiKey,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    if (resp.status === 401 || resp.status === 403) {
      throw new Error("EP-Online API key is invalid or expired. Check EP_ONLINE_API_KEY env var.");
    }
    if (resp.status === 404) {
      throw new Error(
        `No energy label found for ${postcode} ${huisnummer}${huisletter}${toevoeging ? `-${toevoeging}` : ""}. Not all buildings have a registered energy label.`,
      );
    }
    throw new Error(`EP-Online API returned HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const results = (await resp.json()) as Array<Record<string, unknown>> | Record<string, unknown>;
  const labels = Array.isArray(results) ? results : [results];

  if (labels.length === 0) {
    throw new Error(
      `No energy label found for ${postcode} ${huisnummer}. Not all buildings have a registered energy label.`,
    );
  }

  const label = labels[0];

  return {
    output: {
      postcode: (label.Postcode as string) ?? postcode ?? null,
      huisnummer: label.Huisnummer ?? huisnummer ?? null,
      energy_class: label.Energieklasse ?? null,
      energy_index: label.EnergieIndex != null ? Number(label.EnergieIndex) : null,
      energy_index_emg: label.EnergieIndex_EMG_forfaitair != null ? Number(label.EnergieIndex_EMG_forfaitair) : null,
      co2_emission_kg: label.BerekendeCO2Emissie != null ? Number(label.BerekendeCO2Emissie) : null,
      energy_consumption_kwh: label.BerekendeEnergieverbruik != null ? Number(label.BerekendeEnergieverbruik) : null,
      building_class: label.Gebouwklasse ?? null,
      sbi_code: label.SBIcode ?? null,
      construction_year: label.Bouwjaar != null ? Number(label.Bouwjaar) : null,
      registration_date: label.Registratiedatum ?? null,
      assessment_date: label.Opnamedatum ?? null,
      valid_until: label.Geldig_tot ?? null,
      certificate_holder: label.Certificaathouder ?? null,
      calculation_method: label.Berekeningstype ?? null,
      is_simplified_label: label.IsVereenvoudigdLabel ?? false,
      based_on_reference_building: label.Op_basis_van_referentiegebouw ?? false,
      bag_verblijfsobject_id: label.BAGVerblijfsobjectID ?? null,
      total_results: labels.length,
    },
    provenance: { source: "public.ep-online.nl/api/v5", fetched_at: new Date().toISOString() },
  };
});
