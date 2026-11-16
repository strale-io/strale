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
        Georgia: [{ name: "Georgia", latitude: 31.52, longitude: -85.06, country_code: "US", country: "United States", admin1: "Alabama" }],
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
      await expect(exec({ city: "London, Japan" })).rejects.toThrow(/places named "London" exist, but none in Japan/);
      expect(fetchMock.mock.calls.some((c) => new URL(String(c[0])).hostname === "api.open-meteo.com")).toBe(false);
    });

    it("never looks a later part up on its own ('Georgia' out of 'Twiggs County, Georgia, USA' is a town in Alabama)", async () => {
      await expect(exec({ city: "Twiggs County, Georgia, USA" })).rejects.toThrow(/not found/);
      const names = fetchMock.mock.calls.map((c) => new URL(String(c[0])).searchParams.get("name"));
      expect(names).not.toContain("Georgia");
    });

    it("requires every qualifier to match, not just the country", async () => {
      await expect(exec({ city: "London, Ontario, UK" })).rejects.toThrow(/none in Ontario, UK/);
    });

    it("refuses a region given only as a postcode instead of taking the top namesake", async () => {
      await expect(exec({ city: "London, 43140" })).rejects.toThrow(/not found/);
      expect(fetchMock.mock.calls.some((c) => new URL(String(c[0])).hostname === "api.open-meteo.com")).toBe(false);
    });

    it("still refuses a place the geocoder does not know", async () => {
      await expect(exec({ city: "Ogbomosho, Nigeria" })).rejects.toThrow(/Location "Ogbomosho, Nigeria" not found\.$/);
    });

    it("bounds the upstream lookups for a string of many commas", async () => {
      await expect(exec({ city: Array.from({ length: 50 }, (_, i) => `x${i}`).join(", ") })).rejects.toThrow(/not found/);
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);
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

  it("accepts place as an alias and treats a non-string city as absent", async () => {
    fetchMock = fakeOpenMeteo({ London: [LONDON_GB] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ place: "London" });
    expect(r.output.coordinates.latitude).toBe(LONDON_GB.latitude);
    await expect(exec({ city: 42 })).rejects.toThrow("'city' (location name) or 'latitude'/'longitude' is required.");
  });

  it("resolves a country qualifier without a comma", async () => {
    const lagosNg = { name: "Lagos", latitude: 6.45407, longitude: 3.39467, country_code: "NG", country: "Nigeria" };
    const lagosPt = { name: "Lagos", latitude: 37.10202, longitude: -8.67422, country_code: "PT", country: "Portugal" };
    fetchMock = fakeOpenMeteo({ "Lagos Nigeria": [], Lagos: [lagosPt, lagosNg] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Lagos Nigeria" });
    expect(r.output.coordinates).toEqual({ latitude: lagosNg.latitude, longitude: lagosNg.longitude });
  });

  it("takes the qualified Hyderabad even when Pakistan is listed first", async () => {
    const hyderabadPk = { name: "Hyderabad", latitude: 25.39242, longitude: 68.37366, country_code: "PK", country: "Pakistan" };
    const hyderabadIn = { name: "Hyderabad", latitude: 17.38405, longitude: 78.45636, country_code: "IN", country: "India" };
    fetchMock = fakeOpenMeteo({ "Hyderabad India": [], Hyderabad: [hyderabadPk, hyderabadIn] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Hyderabad India" });
    expect(r.output.coordinates.latitude).toBe(hyderabadIn.latitude);
  });

  it("refuses a namesake outside the unpunctuated qualifier without forecasting", async () => {
    const parisFr = { name: "Paris", latitude: 48.85341, longitude: 2.3488, country_code: "FR", country: "France" };
    fetchMock = fakeOpenMeteo({ "Paris Texas": [], Paris: [parisFr] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city: "Paris Texas" })).rejects.toThrow(/places named "Paris" exist, but none in Texas/);
    expect(forecastCall(fetchMock)).toBeUndefined();
  });

  it("resolves a trailing City only when the returned name is exact", async () => {
    const luxembourg = { name: "Luxembourg", latitude: 49.61167, longitude: 6.13, country_code: "LU", country: "Luxembourg" };
    const township = { name: "Springfield Township", latitude: 40.1, longitude: -75.2, country_code: "US", country: "United States" };
    fetchMock = fakeOpenMeteo({ "Luxembourg City": [], Luxembourg: [luxembourg], "Springfield City": [], Springfield: [township] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Luxembourg City" });
    expect(r.output.coordinates.latitude).toBe(luxembourg.latitude);
    await expect(exec({ city: "Springfield City" })).rejects.toThrow(/not found/);
  });

  it("keeps a direct Kansas City hit to one geocoder call", async () => {
    const kansasCity = { name: "Kansas City", latitude: 39.09973, longitude: -94.57857, country_code: "US", country: "United States", admin1: "Missouri" };
    fetchMock = fakeOpenMeteo({ "Kansas City": [kansasCity] });
    vi.stubGlobal("fetch", fetchMock);

    await exec({ city: "Kansas City" });
    const geo = fetchMock.mock.calls.filter((c) => new URL(String(c[0])).hostname === "geocoding-api.open-meteo.com");
    expect(geo).toHaveLength(1);
  });

  it("bounds an unknown five-word place to five geocoder calls", async () => {
    fetchMock = fakeOpenMeteo({});
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city: "one two three four five" })).rejects.toThrow(/not found/);
    const geo = fetchMock.mock.calls.filter((c) => new URL(String(c[0])).hostname === "geocoding-api.open-meteo.com");
    expect(geo.length).toBeLessThanOrEqual(5);
  });

  it("qualifier matching: country code, alias, region name; never a single letter", () => {
    expect(hitMatchesQualifiers(LONDON_GB, ["GB"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_GB, ["UK"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_GB, ["England"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_GB, ["United Kingdom"])).toBe(true);
    expect(hitMatchesQualifiers(LONDON_CA, ["UK"])).toBe(false);
    expect(hitMatchesQualifiers(MANHATTAN_KS, ["New York City"])).toBe(false);
    expect(hitMatchesQualifiers({ ...LONDON_GB, admin1: "E" }, ["E"])).toBe(false);
    // Review of PR 968: a qualifier must not name a longer region that merely contains it, or the reverse.
    const NEWRY = { name: "Newry", latitude: 54.17, longitude: -6.34, country_code: "GB", country: "United Kingdom", admin1: "Northern Ireland" };
    expect(hitMatchesQualifiers(NEWRY, ["Ireland"])).toBe(false);
    expect(hitMatchesQualifiers(NEWRY, ["Northern Ireland"])).toBe(true);
    expect(hitMatchesQualifiers({ ...LONDON_GB, admin1: "England", admin2: "Hampshire" }, ["New Hampshire"])).toBe(false);
    expect(hitMatchesQualifiers({ name: "Example", latitude: 0, longitude: 0, country_code: "MX", country: "Mexico" }, ["New Mexico"])).toBe(false);
  });
});
