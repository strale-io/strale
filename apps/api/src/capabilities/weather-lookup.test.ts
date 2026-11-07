import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { hitMatchesQualifiers } from "./weather-lookup.js";

const exec = getDirectExecutor("weather-lookup")!;

// Shapes as Open-Meteo's geocoder returns them (2026-11-07). It matches a bare
// place name only: "London, UK" returns {} with no results.
const LONDON_GB = { name: "London", latitude: 51.50853, longitude: -0.12574, country_code: "GB", country: "United Kingdom", admin1: "England", admin2: "Greater London" };
const LONDON_CA = { name: "London", latitude: 42.98339, longitude: -81.23304, country_code: "CA", country: "Canada", admin1: "Ontario" };
const LONDON_US = { name: "London", latitude: 39.88645, longitude: -83.44825, country_code: "US", country: "United States", admin1: "Ohio" };
const MANHATTAN_KS = { name: "Manhattan", latitude: 39.18361, longitude: -96.57167, country_code: "US", country: "United States", admin1: "Kansas", admin2: "Riley" };
const MANHATTAN_NY = { name: "Manhattan", latitude: 40.78343, longitude: -73.96625, country_code: "US", country: "United States", admin1: "New York", admin2: "New York County" };
const FORECAST = { timezone: "Europe/London", current: { temperature_2m: 9, weather_code: 3 }, daily: { time: ["2026-11-07"], temperature_2m_max: [11], temperature_2m_min: [6], precipitation_sum: [0], weather_code: [3] } };

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** Routes geocoder calls by the `name` parameter; every forecast call gets FORECAST. */
function fakeOpenMeteo(byName: Record<string, unknown[]>) {
  return vi.fn(async (url: string | URL) => {
    const u = new URL(String(url));
    if (u.hostname === "geocoding-api.open-meteo.com") {
      const hits = byName[u.searchParams.get("name") ?? ""];
      return json(hits ? { results: hits } : {});
    }
    return json(FORECAST);
  });
}

const forecastCall = (m: ReturnType<typeof vi.fn>) =>
  m.mock.calls.map((c) => new URL(String(c[0]))).find((u) => u.hostname === "api.open-meteo.com")!;

describe("weather-lookup place resolution", () => {
  let fetchMock: ReturnType<typeof fakeOpenMeteo>;
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  describe("with a geocoder that knows bare names only", () => {
    beforeEach(() => {
      fetchMock = fakeOpenMeteo({
        London: [LONDON_GB, LONDON_CA, LONDON_US],
        Manhattan: [MANHATTAN_NY, MANHATTAN_KS],
        Ogbomoso: [],
      });
      vi.stubGlobal("fetch", fetchMock);
    });

    it("resolves 'London, UK' (a paid call that failed in production) to London, England", async () => {
      const r = await exec({ city: "London, UK" });
      expect(r.output.coordinates).toEqual({ latitude: LONDON_GB.latitude, longitude: LONDON_GB.longitude });
      expect(forecastCall(fetchMock).searchParams.get("latitude")).toBe(String(LONDON_GB.latitude));
      expect(r.output.location).toBe("London, UK");
    });

    it("takes the hit in the region the caller named, not the first hit", async () => {
      const r = await exec({ city: "London, Ontario" });
      expect(r.output.coordinates).toEqual({ latitude: LONDON_CA.latitude, longitude: LONDON_CA.longitude });
    });

    it("matches a region the caller spells longer than the geocoder ('New York City' names 'New York')", async () => {
      const r = await exec({ city: "Manhattan, New York City" });
      expect(r.output.coordinates.latitude).toBe(MANHATTAN_NY.latitude);
    });

    it("drops a postal code from a qualifier ('Ohio 43140')", async () => {
      const r = await exec({ city: "London, Ohio 43140" });
      expect(r.output.coordinates.latitude).toBe(LONDON_US.latitude);
    });

    it("refuses rather than return weather for a namesake elsewhere", async () => {
      await expect(exec({ city: "London, Japan" })).rejects.toThrow(/places of that name exist, but none in Japan/);
      expect(fetchMock.mock.calls.some((c) => new URL(String(c[0])).hostname === "api.open-meteo.com")).toBe(false);
    });

    it("still refuses a place the geocoder does not know", async () => {
      await expect(exec({ city: "Ogbomosho, Nigeria" })).rejects.toThrow(/Location "Ogbomosho, Nigeria" not found\.$/);
    });

    it("bounds the upstream lookups for a string of many commas", async () => {
      await expect(exec({ city: Array.from({ length: 50 }, (_, i) => `x${i}`).join(", ") })).rejects.toThrow(/not found/);
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4);
    });
  });

  it("keeps a direct hit as it was: one geocoder call, first result", async () => {
    fetchMock = fakeOpenMeteo({ London: [LONDON_GB, LONDON_CA] });
    vi.stubGlobal("fetch", fetchMock);
    const r = await exec({ city: "London" });
    expect(r.output.coordinates.latitude).toBe(LONDON_GB.latitude);
    const geo = fetchMock.mock.calls.filter((c) => new URL(String(c[0])).hostname === "geocoding-api.open-meteo.com");
    expect(geo).toHaveLength(1);
  });

  it("qualifier matching: country code, alias, region name; never a single letter", () => {
    expect(hitMatchesQualifiers(LONDON_GB, ["GB"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_GB, ["UK"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_GB, ["England"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_GB, ["United Kingdom"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_CA, ["UK"])).toBe(false);
    expect(hitMatchesQualifiers(MANHATTAN_KS, ["New York City"])).toBe(false);
    expect(hitMatchesQualifiers({ ...LONDON_GB, admin1: "E" }, ["E"])).toBe(false);
  });
});
