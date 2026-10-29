import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlacesQuery, PlacesResult, PlacesRow } from "./lib/overture-places/shared.js";

const queryPlaces = vi.fn<(q: PlacesQuery) => Promise<PlacesResult>>();
vi.mock("./lib/overture-places/client.js", () => ({ queryPlaces: (q: PlacesQuery) => queryPlaces(q) }));

const { getDirectExecutor } = await import("./index.js");
await import("./places-search.js");
const { parseReleases } = await import("./lib/overture-places/shared.js");
const exec = getDirectExecutor("places-search")!;

function row(over: Partial<PlacesRow>): PlacesRow {
  return {
    id: "id-1", name: "Cafe Runsten", category: "cafe", taxonomy: "cafe", brand: null,
    address: { freeform: "Kåkbrinken 4", locality: "Stockholm", postcode: null, region: null, country: "SE" },
    latitude: 59.3248, longitude: 18.0702, distance_m: 120, confidence: 0.973, operating_status: "open",
    phones: [], websites: [], source: "meta", license: "CDLA-Permissive-2.0", source_record_id: "r1",
    ...over,
  };
}

describe("places-search", () => {
  afterEach(() => queryPlaces.mockReset());

  it("refuses missing or out-of-range coordinates before any query", async () => {
    await expect(exec({ longitude: 18 })).rejects.toThrow(/latitude/);
    await expect(exec({ latitude: 91, longitude: 18 })).rejects.toThrow(/latitude/);
    await expect(exec({ latitude: 59, longitude: 181 })).rejects.toThrow(/longitude/);
    await expect(exec({ latitude: 59, longitude: 18, radius_m: 50_000 })).rejects.toThrow(/radius_m/);
    await expect(exec({ latitude: 59, longitude: 18, limit: 500 })).rejects.toThrow(/limit/);
    await expect(exec({ latitude: 59, longitude: 18, query: "a" })).rejects.toThrow(/query/);
    await expect(exec({ latitude: 59, longitude: 18, category: "'; DROP" })).rejects.toThrow(/category/);
    expect(queryPlaces).not.toHaveBeenCalled();
  });

  it("passes defaults and normalises the category id", async () => {
    queryPlaces.mockResolvedValue({ release: "2026-10-21.0", files_scanned: 1, rows: [] });
    await exec({ latitude: "59.33", longitude: 18.06, category: "Coffee Shop" });
    expect(queryPlaces).toHaveBeenCalledWith({
      latitude: 59.33, longitude: 18.06, radius_m: 1000, query: null, category: "coffee_shop", limit: 20,
    });
  });

  it("returns licence and source per row, attribution per source, licence texts, and withholds unknown licences", async () => {
    queryPlaces.mockResolvedValue({
      release: "2026-10-21.0",
      files_scanned: 1,
      rows: [
        row({}),
        row({ id: "id-2", name: "The Best Pizza", source: "Foursquare", license: "Apache-2.0" }),
        row({ id: "id-3", name: "Odd", source: "someone", license: "ODbL-1.0" }),
        row({ id: "id-4", name: "No licence", license: null }),
      ],
    });
    const { output, provenance } = await exec({ latitude: 59.33, longitude: 18.06, query: "cafe" });
    const places = output.places as Record<string, unknown>[];
    expect(places.map((p) => p.name)).toEqual(["Cafe Runsten", "The Best Pizza"]);
    expect(places[1]).toMatchObject({ source: "Foursquare", license: "Apache-2.0", overture_id: "id-2" });
    expect(output.withheld_unknown_license).toBe(2);
    expect(output.result_count).toBe(2);
    expect(output.attribution).toEqual([
      "Data from Meta. Available under CDLA Permissive 2.0.",
      expect.stringContaining("Copyright 2024 Foursquare Labs, Inc."),
    ]);
    expect(output.licenses).toEqual([
      { id: "Apache-2.0", text_url: "https://www.apache.org/licenses/LICENSE-2.0" },
      { id: "CDLA-Permissive-2.0", text_url: "https://cdla.dev/permissive-2-0/" },
    ]);
    expect(provenance).toMatchObject({ source: "overture-maps-places", dataset_release: "2026-10-21.0" });
    expect(provenance.attribution).toEqual(output.attribution);
  });
});

describe("parseReleases", () => {
  it("lists release ids newest first and ignores other prefixes", () => {
    const xml = "<Prefix>release/</Prefix><Prefix>release/2026-09-23.0/</Prefix><Prefix>release/2026-10-21.0/</Prefix><Prefix>release/2026-09-23.1/</Prefix><Prefix>release/latest/</Prefix>";
    expect(parseReleases(xml)).toEqual(["2026-10-21.0", "2026-09-23.1", "2026-09-23.0"]);
  });
});
