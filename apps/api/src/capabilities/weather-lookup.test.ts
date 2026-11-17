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
const WASHINGTON_DC = { name: "Washington D.C.", latitude: 38.89511, longitude: -77.03637, country_code: "US", country: "United States", admin1: "District of Columbia", feature_code: "PPLC" };
const WASHINGTON_PA = { name: "Washington", latitude: 40.17396, longitude: -80.24617, country_code: "US", country: "United States", admin1: "Pennsylvania" };
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

  it.each(["Washington DC", "Washington, DC", "Washington D.C."])("resolves the punctuation-tolerant exact name '%s' to Washington, D.C.", async (city) => {
    fetchMock = fakeOpenMeteo({
      [city]: city === "Washington D.C." ? [WASHINGTON_DC, WASHINGTON_PA] : [],
      Washington: [WASHINGTON_DC, WASHINGTON_PA],
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city });
    expect(r.output.coordinates).toEqual({ latitude: WASHINGTON_DC.latitude, longitude: WASHINGTON_DC.longitude });
  });

  it("resolves 'Washington PA' to Pennsylvania", async () => {
    fetchMock = fakeOpenMeteo({ "Washington PA": [], Washington: [WASHINGTON_DC, WASHINGTON_PA] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Washington PA" });
    expect(r.output.coordinates).toEqual({ latitude: WASHINGTON_PA.latitude, longitude: WASHINGTON_PA.longitude });
  });

  it("keeps the first hit for unqualified 'Washington'", async () => {
    fetchMock = fakeOpenMeteo({ Washington: [WASHINGTON_DC, WASHINGTON_PA] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Washington" });
    expect(r.output.coordinates).toEqual({ latitude: WASHINGTON_DC.latitude, longitude: WASHINGTON_DC.longitude });
  });

  it("ignores a loose namesake when resolving exact-name 'Sacramento, CA'", async () => {
    const sacramentoValley = { name: "Sacramento Valley", latitude: 43.45, longitude: -80.12, country_code: "CA", country: "Canada", admin1: "Ontario" };
    const sacramentoCa = { name: "Sacramento", latitude: 38.58157, longitude: -121.4944, country_code: "US", country: "United States", admin1: "California" };
    fetchMock = fakeOpenMeteo({ "Sacramento, CA": [], Sacramento: [sacramentoValley, sacramentoCa] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Sacramento, CA" });
    expect(r.output.coordinates).toEqual({ latitude: sacramentoCa.latitude, longitude: sacramentoCa.longitude });
  });

  it("falls back to a qualified loose-name hit for 'Bombay, IN'", async () => {
    const bombayNy = { name: "Bombay", latitude: 44.94, longitude: -74.59, country_code: "US", country: "United States", admin1: "New York" };
    const bombayNz = { name: "Bombay", latitude: -37.18, longitude: 174.99, country_code: "NZ", country: "New Zealand", admin1: "Auckland" };
    const dharaviIn = { name: "Dharavi", latitude: 19.04, longitude: 72.85, country_code: "IN", country: "India", admin1: "Maharashtra" };
    fetchMock = fakeOpenMeteo({ "Bombay, IN": [], Bombay: [bombayNy, bombayNz, dharaviIn] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Bombay, IN" });
    expect(r.output.coordinates).toEqual({ latitude: dharaviIn.latitude, longitude: dharaviIn.longitude });
  });

  it("matches a hyphenated geocoder name for 'Winston Salem NC'", async () => {
    const winstonSalem = { name: "Winston-Salem", latitude: 36.1, longitude: -80.24, country_code: "US", country: "United States", admin1: "North Carolina" };
    fetchMock = fakeOpenMeteo({ "Winston Salem NC": [], "Winston Salem": [winstonSalem], Winston: [] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Winston Salem NC" });
    expect(r.output.coordinates).toEqual({ latitude: winstonSalem.latitude, longitude: winstonSalem.longitude });
  });

  it("takes the qualified Hyderabad even when Pakistan is listed first", async () => {
    const hyderabadPk = { name: "Hyderabad", latitude: 25.39242, longitude: 68.37366, country_code: "PK", country: "Pakistan" };
    const hyderabadIn = { name: "Hyderabad", latitude: 17.38405, longitude: 78.45636, country_code: "IN", country: "India" };
    fetchMock = fakeOpenMeteo({ "Hyderabad India": [], Hyderabad: [hyderabadPk, hyderabadIn] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Hyderabad India" });
    expect(r.output.coordinates.latitude).toBe(hyderabadIn.latitude);
  });

  it.each(["Richmond CA", "Richmond, CA"])("refuses ambiguous state and country code in '%s'", async (city) => {
    const richmondBc = { name: "Richmond", latitude: 49.17, longitude: -123.14, country_code: "CA", country: "Canada", admin1: "British Columbia" };
    const richmondCa = { name: "Richmond", latitude: 37.94, longitude: -122.35, country_code: "US", country: "United States", admin1: "California" };
    fetchMock = fakeOpenMeteo({ [city]: [], Richmond: [richmondBc, richmondCa] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city })).rejects.toThrow(`Location "${city}" is ambiguous: "CA" can mean a US state or a country. Write the state or country name in full, or pass latitude and longitude.`);
    expect(forecastCall(fetchMock)).toBeUndefined();
  });

  it("refuses Dublin CA when both Canada and California contain a candidate", async () => {
    const dublinOn = { name: "Dublin", latitude: 43.5, longitude: -81.1, country_code: "CA", country: "Canada", admin1: "Ontario" };
    const dublinCa = { name: "Dublin", latitude: 37.7, longitude: -121.9, country_code: "US", country: "United States", admin1: "California" };
    fetchMock = fakeOpenMeteo({ "Dublin CA": [], Dublin: [dublinOn, dublinCa] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city: "Dublin CA" })).rejects.toThrow(/"CA" can mean a US state or a country/);
  });

  it.each([
    ["Richmond, CA, Canada", "British Columbia"],
    ["Richmond, Canada, CA", "British Columbia"],
    ["Richmond, CA, USA", "California"],
    ["Richmond, USA, CA", "California"],
  ])("lets another qualifier settle a two-letter code in '%s'", async (city, admin1) => {
    const richmondBc = { name: "Richmond", latitude: 49.17, longitude: -123.14, country_code: "CA", country: "Canada", admin1: "British Columbia" };
    const richmondCa = { name: "Richmond", latitude: 37.94, longitude: -122.35, country_code: "US", country: "United States", admin1: "California" };
    fetchMock = fakeOpenMeteo({ [city]: [], Richmond: [richmondBc, richmondCa] });
    vi.stubGlobal("fetch", fetchMock);

    const want = admin1 === "California" ? richmondCa : richmondBc;
    const r = await exec({ city });
    expect(r.output.coordinates).toEqual({ latitude: want.latitude, longitude: want.longitude });
  });

  it.each(["Austin TX", "Austin, TX"])("resolves a state code in '%s'", async (city) => {
    const austin = { name: "Austin", latitude: 30.27, longitude: -97.74, country_code: "US", country: "United States", admin1: "Texas" };
    fetchMock = fakeOpenMeteo({ [city]: [], Austin: [austin] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city });
    expect(r.output.coordinates).toEqual({ latitude: austin.latitude, longitude: austin.longitude });
  });

  it.each([
    ["Richmond California", { name: "Richmond", latitude: 37.94, longitude: -122.35, country_code: "US", country: "United States", admin1: "California" }],
    ["Paris FR", { name: "Paris", latitude: 48.85, longitude: 2.35, country_code: "FR", country: "France" }],
    ["Toronto CA", { name: "Toronto", latitude: 43.65, longitude: -79.38, country_code: "CA", country: "Canada", admin1: "Ontario" }],
    ["Sacramento CA", { name: "Sacramento", latitude: 38.58, longitude: -121.49, country_code: "US", country: "United States", admin1: "California" }],
  ])("resolves the sole interpretation of '%s'", async (city, hit) => {
    const name = city.split(" ")[0];
    fetchMock = fakeOpenMeteo({ [city]: [], [name]: [hit] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city });
    expect(r.output.coordinates).toEqual({ latitude: hit.latitude, longitude: hit.longitude });
  });

  it("does not repeat a lookup when the input differs only by whitespace", async () => {
    const newYork = { name: "New York", latitude: 40.71, longitude: -74.01, country_code: "US", country: "United States", admin1: "New York" };
    fetchMock = fakeOpenMeteo({ "New  York": [], "New York": [newYork], New: [] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city: "New  York" })).rejects.toThrow(/not found/);
    const names = fetchMock.mock.calls
      .map((c) => new URL(String(c[0])))
      .filter((u) => u.hostname === "geocoding-api.open-meteo.com")
      .map((u) => u.searchParams.get("name"));
    expect(names).not.toContain("New York");
    expect(new Set(names).size).toBe(names.length);
  });

  it("still reads a qualifier when the input has extra spaces ('Austin  TX')", async () => {
    const austin = { name: "Austin", latitude: 30.27, longitude: -97.74, country_code: "US", country: "United States", admin1: "Texas" };
    fetchMock = fakeOpenMeteo({ "Austin  TX": [], Austin: [austin] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Austin  TX" });
    expect(r.output.coordinates).toEqual({ latitude: austin.latitude, longitude: austin.longitude });
  });

  it("refuses a namesake outside the unpunctuated qualifier without forecasting", async () => {
    const parisFr = { name: "Paris", latitude: 48.85341, longitude: 2.3488, country_code: "FR", country: "France" };
    const parisMountain = { name: "Paris Mountain", latitude: 33.1, longitude: -95.5, country_code: "US", country: "United States", admin1: "Texas" };
    fetchMock = fakeOpenMeteo({ "Paris Texas": [], Paris: [parisFr, parisMountain] });
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city: "Paris Texas" })).rejects.toThrow(/places named "Paris" exist, but none in Texas/);
    expect(forecastCall(fetchMock)).toBeUndefined();
  });

  it("tries the next split when a longer name lookup returns a fuzzy hit", async () => {
    const charlestonWest = { name: "Charleston", latitude: 37.1, longitude: -78.2, country_code: "US", country: "United States", admin1: "Virginia" };
    const charlestonWv = { name: "Charleston", latitude: 38.34982, longitude: -81.63262, country_code: "US", country: "United States", admin1: "West Virginia" };
    fetchMock = fakeOpenMeteo({
      "Charleston West Virginia": [],
      "Charleston West": [charlestonWest],
      Charleston: [charlestonWv],
    });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "Charleston West Virginia" });
    expect(r.output.coordinates).toEqual({ latitude: charlestonWv.latitude, longitude: charlestonWv.longitude });
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

  it("bounds the worst-case City and postcode retries without repeating a lookup", async () => {
    fetchMock = fakeOpenMeteo({});
    vi.stubGlobal("fetch", fetchMock);

    await expect(exec({ city: "a b c d e City 12345" })).rejects.toThrow(/not found/);
    const geo = fetchMock.mock.calls.filter((c) => new URL(String(c[0])).hostname === "geocoding-api.open-meteo.com");
    expect(geo.length).toBeLessThanOrEqual(5);
    const names = geo.map((call) => new URL(String(call[0])).searchParams.get("name"));
    expect(new Set(names).size).toBe(names.length);
  });

  it("skips blank location aliases when choosing a place name", async () => {
    fetchMock = fakeOpenMeteo({ London: [LONDON_GB] });
    vi.stubGlobal("fetch", fetchMock);

    const r = await exec({ city: "   ", place: "London" });
    expect(r.output.coordinates.latitude).toBe(LONDON_GB.latitude);
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

  describe("trailing US ZIP codes and a leading 'St' (2026-11-17 paid failures)", () => {
    const us = (name: string, admin1: string, latitude: number, longitude: number) =>
      ({ name, latitude, longitude, country_code: "US", country: "United States", admin1 });
    const BROOKLYN_NY = us("Brooklyn", "New York", 40.6501, -73.94958);
    const BROOKLYN_MI = us("Brooklyn", "Michigan", 42.10587, -84.24828);
    const WILDWOOD_NJ = us("Wildwood", "New Jersey", 38.99178, -74.81489);
    const WILDWOOD_FL = us("Wildwood", "Florida", 28.86526, -82.04064);
    const SAINT_CLOUD_MN = us("Saint Cloud", "Minnesota", 45.5608, -94.16249);
    const SAINT_CLOUD_FL = us("Saint Cloud", "Florida", 28.24891, -81.28118);
    const geocoderNames = (m: ReturnType<typeof vi.fn>) => m.mock.calls
      .map((c) => new URL(String(c[0])))
      .filter((u) => u.hostname === "geocoding-api.open-meteo.com")
      .map((u) => u.searchParams.get("name"));

    it("resolves 'Brooklyn, NY 11206' to Brooklyn, New York", async () => {
      fetchMock = fakeOpenMeteo({ Brooklyn: [BROOKLYN_NY, BROOKLYN_MI] });
      vi.stubGlobal("fetch", fetchMock);

      const r = await exec({ city: "Brooklyn, NY 11206" });
      expect(r.output.coordinates).toEqual({ latitude: BROOKLYN_NY.latitude, longitude: BROOKLYN_NY.longitude });
    });

    it("resolves 'Wildwood, FL 34785' to Wildwood, Florida", async () => {
      fetchMock = fakeOpenMeteo({ Wildwood: [WILDWOOD_NJ, WILDWOOD_FL] });
      vi.stubGlobal("fetch", fetchMock);

      const r = await exec({ city: "Wildwood, FL 34785" });
      expect(r.output.coordinates).toEqual({ latitude: WILDWOOD_FL.latitude, longitude: WILDWOOD_FL.longitude });
    });

    it("reads 'St' as 'Saint' in 'St Cloud, Minnesota'", async () => {
      fetchMock = fakeOpenMeteo({ "Saint Cloud": [SAINT_CLOUD_MN, SAINT_CLOUD_FL] });
      vi.stubGlobal("fetch", fetchMock);

      const r = await exec({ city: "St Cloud, Minnesota" });
      expect(r.output.coordinates).toEqual({ latitude: SAINT_CLOUD_MN.latitude, longitude: SAINT_CLOUD_MN.longitude });
    });

    it("reads 'St.' as 'Saint' in 'St. Cloud MN' (no comma)", async () => {
      fetchMock = fakeOpenMeteo({ "Saint Cloud": [SAINT_CLOUD_FL, SAINT_CLOUD_MN] });
      vi.stubGlobal("fetch", fetchMock);

      const r = await exec({ city: "St. Cloud MN" });
      expect(r.output.coordinates).toEqual({ latitude: SAINT_CLOUD_MN.latitude, longitude: SAINT_CLOUD_MN.longitude });
      const names = geocoderNames(fetchMock);
      expect(new Set(names).size).toBe(names.length);
    });

    it("matches a hit spelled 'St. Cloud' when the caller writes 'Saint Cloud MN'", async () => {
      const stCloud = { ...SAINT_CLOUD_MN, name: "St. Cloud" };
      fetchMock = fakeOpenMeteo({ "Saint Cloud": [SAINT_CLOUD_FL, stCloud] });
      vi.stubGlobal("fetch", fetchMock);

      const r = await exec({ city: "Saint Cloud MN" });
      expect(r.output.coordinates).toEqual({ latitude: stCloud.latitude, longitude: stCloud.longitude });
    });

    it("leaves 'Stockholm' alone: no 'Saint' lookup", async () => {
      fetchMock = fakeOpenMeteo({});
      vi.stubGlobal("fetch", fetchMock);

      await expect(exec({ city: "Stockholm" })).rejects.toThrow(/not found/);
      expect(geocoderNames(fetchMock)).toEqual(["Stockholm"]);
    });
  });
});
