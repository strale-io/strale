import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dutch energy performance label lookup via EP-Online.
 * Requires EP_ONLINE_API_KEY env var (free registration at apikey.ep-online.nl).
 * Returns energy label grade (A++++–G), registration number, and validity.
 */

registerCapability("nl-energy-label", async (input: CapabilityInput) => {
  const postcode = ((input.postcode as string) ?? "").trim().replace(/\s+/g, "").toUpperCase();
  const huisnummer = String(input.huisnummer ?? input.house_number ?? "").trim();
  const huisletter = ((input.huisletter as string) ?? "").trim().toUpperCase();
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

  // EP-Online API v2: search by postcode + huisnummer or BAG ID
  let url: string;
  if (bagId) {
    url = `https://public.ep-online.nl/api/v2/PandEnergielabel/Adres/${encodeURIComponent(bagId)}`;
  } else {
    const params = new URLSearchParams({ Postcode: postcode, Huisnummer: huisnummer });
    if (huisletter) params.set("Huisletter", huisletter);
    if (toevoeging) params.set("HuisnummerToevoeging", toevoeging);
    url = `https://public.ep-online.nl/api/v2/PandEnergielabel/Adres?${params}`;
  }

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
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
      postcode: postcode || null,
      huisnummer: huisnummer || null,
      energy_label: label.Energielabel ?? label.labelLetter ?? label.energieprestatieIndicator,
      energy_index: label.EnergieIndex ?? label.energieIndex ?? null,
      registration_number: label.RegistratieNummer ?? label.opnameNummer ?? null,
      registration_date: label.RegistratieDatum ?? label.afmelddatum ?? null,
      valid_until: label.GeldigTot ?? label.geldigTot ?? null,
      building_type: label.GebouwType ?? label.gebouwtype ?? null,
      building_subtype: label.GebouwSubtype ?? label.gebouwsubtype ?? null,
      method: label.BerekeningsMethode ?? label.berekeningstype ?? null,
      address: label.Adres ?? label.adres ?? null,
      bag_verblijfsobject_id: label.BagVerblijfsobjectId ?? label.bagVerblijfsobjectId ?? null,
      is_provisional: label.IsVoorlopig ?? label.isVoorlopig ?? false,
      total_results: labels.length,
    },
    provenance: { source: "public.ep-online.nl", fetched_at: new Date().toISOString() },
  };
});
