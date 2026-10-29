import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlacesQuery, PlacesResult, PlacesRow } from "./lib/overture-places/shared.js";

const queryPlaces = vi.fn<(q: PlacesQuery) => Promise<PlacesResult>>();
vi.mock("./lib/overture-places/client.js", () => ({ queryPlaces: (q: PlacesQuery) => queryPlaces(q) }));

const { getDirectExecutor } = await import("./index.js");
await import("./places-search.js");
const { parseReleases, parsePlaceFiles, PLACE_FILE_URL } = await import("./lib/overture-places/shared.js");
const exec = getDirectExecutor("places-search")!;

function row(over: Partial<PlacesRow>): PlacesRow {
  return {
    id: "id-1", name: "Cafe Runsten", category: "cafe", taxonomy: "cafe", brand: null,
    address: { freeform: "Kåkbrinken 4", locality: "Stockholm", postcode: null, region: null, country: "SE" },
    latitude: 59.3248, longitude: 18.0702, distance_m: 120, confidence: 0.973, operating_status: "open",
    phones: [], websites: [],
    sources: [{ dataset: "Overture", license: "CDLA-Permissive-2.0" }, { dataset: "meta", license: "CDLA-Permissive-2.0" }],
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
        row({ id: "id-2", name: "The Best Pizza", sources: [{ dataset: "Foursquare", license: "Apache-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }] }),
        // One unknown licence among several sources withholds the whole row.
        row({ id: "id-3", name: "Odd", sources: [{ dataset: "meta", license: "CDLA-Permissive-2.0" }, { dataset: "someone", license: "ODbL-1.0" }] }),
        row({ id: "id-4", name: "No licence", sources: [{ dataset: "meta", license: null }] }),
        row({ id: "id-5", name: "No sources", sources: [] }),
      ],
    });
    const { output, provenance } = await exec({ latitude: 59.33, longitude: 18.06, query: "cafe" });
    const places = output.places as Record<string, unknown>[];
    expect(places.map((p) => p.name)).toEqual(["Cafe Runsten", "The Best Pizza"]);
    expect(places[1]).toMatchObject({
      overture_id: "id-2",
      sources: [{ dataset: "Foursquare", license: "Apache-2.0" }, { dataset: "Overture", license: "CDLA-Permissive-2.0" }],
      licenses: ["Apache-2.0", "CDLA-Permissive-2.0"],
    });
    expect(output.withheld_unknown_license).toBe(3);
    expect(output.result_count).toBe(2);
    expect(output.attribution).toEqual([
      "Data from Overture. Available under CDLA Permissive 2.0.",
      "Data from Meta. Available under CDLA Permissive 2.0.",
      expect.stringContaining("Copyright 2024 Foursquare Labs, Inc."),
    ]);
    expect(output.licenses).toEqual([
      { id: "Apache-2.0", text_url: "https://www.apache.org/licenses/LICENSE-2.0", notice_url: "https://docs.overturemaps.org/attribution/" },
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

describe("parsePlaceFiles (the guard for file URLs inlined into SQL)", () => {
  it("keeps only exact release place files and drops keys that could break out of a SQL literal", () => {
    const good = "release/2026-10-21.0/theme=places/type=place/part-00000-a0a9949b-7e8e-59fe-803b-6cc55b17f790-c000.zstd.parquet";
    const xml = [
      good,
      "release/2026-10-21.0/theme=places/type=place/part-1'),read_csv('/etc/passwd.zstd.parquet",
      "release/2026-10-21.0/theme=places/type=place/part-1.zstd.parquet' OR 1=1",
      "release/2026-10-21.0/theme=buildings/type=building/part-00000-x.zstd.parquet",
      "release/2026-10-21.0/theme=places/type=place/_SUCCESS",
    ].map((k) => `<Key>${k}</Key>`).join("");
    expect(parsePlaceFiles(xml)).toEqual([`s3://overturemaps-us-west-2/${good}`]);
    expect(PLACE_FILE_URL.test("s3://overturemaps-us-west-2/release/2026-10-21.0/theme=places/type=place/part-a.zstd.parquet\n")).toBe(false);
  });
});
