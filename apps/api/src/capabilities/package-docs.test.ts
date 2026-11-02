import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import "./package-docs.js";
import { stampDataAccess, parseDataAccess } from "../lib/data-access.js";
import yaml from "js-yaml";
import { getDirectExecutor } from "./index.js";
import { CapabilityRefusalError, isCapabilityRefusal } from "../lib/capability-refusal.js";
import { SourceBlockedError, STRALE_USER_AGENT } from "../lib/site-access.js";
import { MAX_PACKAGE_REGISTRY_RESPONSE_BYTES } from "../lib/resource-limits.js";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./__fixtures__/package-docs/${name}.json`, import.meta.url), "utf8"));
const execute = getDirectExecutor("package-docs")!;
const json = (data: unknown) => new Response(JSON.stringify(data));
const mock = (data: any) => vi.spyOn(globalThis, "fetch").mockImplementation(async url => {
  const path = new URL(String(url));
  const version = path.hostname === "registry.npmjs.org" ? path.pathname.split("/")[2] : undefined;
  if (version && data.versions) {
    const selected = data.versions[data["dist-tags"]?.[decodeURIComponent(version)] ?? decodeURIComponent(version)];
    return selected ? json(selected) : new Response(null, { status: 404 });
  }
  return json(data);
});
afterEach(() => vi.restoreAllMocks());

describe("package-docs registry contract", () => {
  it("reads an npm scoped package with an honest user agent and timeout; fetches no linked sites", async () => {
    const data = fixture("npm-scoped"); const spy = mock(data);
    const { output, provenance } = await execute({ ecosystem: "npm", package: "@babel/code-frame" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("https://registry.npmjs.org/%40babel%2Fcode-frame", expect.objectContaining({ headers: { Accept: "application/json", "User-Agent": STRALE_USER_AGENT }, signal: expect.any(AbortSignal), redirect: "error" }));
    expect(output).toMatchObject({ name: "@babel/code-frame", ecosystem: "npm", version: data["dist-tags"].latest, readme: null, readme_truncated: false, readme_chars_total: 0, readme_version_note: expect.stringContaining("No README") });
    expect(provenance).toEqual({ source: expect.stringContaining("registry.npmjs.org"), fetched_at: expect.any(String) });
    expect(Number.isFinite(Date.parse(provenance.fetched_at))).toBe(true);
  });
  it.each(["npm", "pypi"])("reports the recorded terms check through the manifest provenance stamper for %s", async ecosystem => {
    mock(fixture(ecosystem === "npm" ? "npm-deprecated" : "pypi-project"));
    const manifest = yaml.load(readFileSync(new URL("../../../../manifests/package-docs.yaml", import.meta.url), "utf8")) as {data_access: unknown};
    const access = parseDataAccess(manifest.data_access);
    expect(access.ok).toBe(true);
    if (!access.ok) throw new Error("Invalid manifest data access");
    const { provenance } = await execute({ ecosystem, package: "requests" });
    expect(stampDataAccess(provenance, access.value)).toMatchObject({ acquisition_method: "direct_api", data_access_lane: "allowed_with_checks", data_access_checks: "recorded", upstream_vendor: "npm; PyPI" });
  });
  it("resolves a dist-tag and labels a packument README that may describe another version", async () => {
    const data = fixture("npm-deprecated"); const older = Object.keys(data.versions)[1];
    data["dist-tags"].fixture = older; mock(data);
    const { output } = await execute({ ecosystem: "npm", package: "request", version: "fixture" });
    expect(output.version).toBe(older);
    expect(output.readme).toBe(data.readme);
    expect(output.readme_version_note).toContain(`not pinned to ${older}`);
    expect(output.readme_version_note).toContain("may describe a different version");
    expect(output.deprecated).toBe(data.versions[older].deprecated);
    expect(output.attribution).toMatchObject({ license: output.license, author: { name: "Fixture author" }, registry_url: "https://www.npmjs.com/package/request" });
  });
  it("keeps historical package metadata separate from current packument README attribution", async () => {
    const data = fixture("npm-deprecated"); const latest = data["dist-tags"].latest;
    const older = Object.keys(data.versions).find(v => v !== latest)!;
    delete data.license; delete data.author; delete data.maintainers;
    data.versions[older].license = "MIT";
    data.versions[older].author = "Fixture historical author";
    data.versions[latest].license = "Apache-2.0";
    data.versions[latest].author = "Fixture current author";
    mock(data);
    const { output } = await execute({ ecosystem: "npm", package: "request", version: older });
    expect(output.license).toBe("MIT");
    expect(output.attribution).toMatchObject({ license: "Apache-2.0", author: { name: "Fixture current author" }, registry_url: "https://www.npmjs.com/package/request" });
    expect(output.readme_version_note).toContain("does not establish this README's version or licence separately");
  });
  it("prefers a version-specific npm README without changing whitespace or markup", async () => {
    const data = fixture("npm-deprecated"); const latest = data["dist-tags"].latest;
    data.versions[latest].readme = "\n# A\n\n  content  \n"; mock(data);
    const { output } = await execute({ ecosystem: "npm", package: "request", version: latest });
    expect(output.readme).toBe(data.versions[latest].readme);
    expect(output.readme_version_note).toBeNull();
  });
  it("reads PyPI Documentation and source URLs without fetching them", async () => {
    const data = fixture("pypi-project"); const spy = mock(data);
    const { output } = await execute({ ecosystem: "pypi", package: "requests" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(output).toMatchObject({ version: data.info.version, docs_url: data.info.project_urls.Documentation, repository_url: data.info.project_urls.Source, readme_format: "markdown", readme_version_note: null, yanked: false });
    expect(output.attribution).toMatchObject({ author: "Fixture author", maintainer: "Fixture maintainer", license: output.license });
  });
  it("fetches the yanked release description with a second bounded request and retains latest/history", async () => {
    const project = fixture("pypi-project"), release = fixture("pypi-yanked");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(project)).mockResolvedValueOnce(json(release));
    const { output, provenance } = await execute({ ecosystem: "pypi", package: "requests", version: "2.32.0" });
    expect(output).toMatchObject({ version: "2.32.0", latest_version: project.info.version, yanked: true, yanked_reason: release.info.yanked_reason, readme: release.info.description });
    expect(output.versions).toHaveLength(Object.keys(project.releases).length);
    expect(spy.mock.calls[1]).toEqual(["https://pypi.org/pypi/requests/2.32.0/json", expect.objectContaining({ signal: expect.any(AbortSignal) })]);
    expect(provenance.source).toBe("https://pypi.org/pypi/requests/2.32.0/json");
  });
  it("normalises PyPI names under PEP 503 before fetching", async () => {
    const spy = mock(fixture("pypi-project"));
    await execute({ ecosystem: "pypi", package: "Requests___Test..Name" });
    expect(spy.mock.calls[0][0]).toBe("https://pypi.org/pypi/requests-test-name/json");
  });
  it.each([["text/x-rst", "rst"], ["text/plain", "plain"], [undefined, "plain"], ["text/markdown; charset=UTF-8", "markdown"]])("maps content type %s", async (type, expected) => {
    const data = fixture("pypi-project"); data.info.description_content_type = type; mock(data);
    expect((await execute({ ecosystem: "pypi", package: "requests" })).output.readme_format).toBe(expected);
  });
  it("sorts by actual release date, caps history at 50 and uses the earliest file date per PyPI release", async () => {
    const data = fixture("pypi-project"); data.releases = {};
    for (let i = 0; i < 55; i++) data.releases[`1.${i}`] = [{ upload_time_iso_8601: new Date(Date.UTC(2020, 0, i + 1)).toISOString() }];
    data.releases["1.54"].push({ upload_time_iso_8601: "2025-01-01T00:00:00Z" });
    mock(data); const { output } = await execute({ ecosystem: "pypi", package: "requests" });
    const versions = output.versions as Array<{ version: string; released_at: string }>;
    expect(versions).toHaveLength(50); expect(versions[0]).toEqual({ version: "1.54", released_at: "2020-02-24T00:00:00.000Z" });
    expect(versions[49].version).toBe("1.5");
  });
  it("sorts npm releases by date rather than object insertion order", async () => {
    const data = fixture("npm-deprecated"); const versions = Object.keys(data.versions);
    data.time[versions[0]] = "2020-01-01T00:00:00Z"; data.time[versions[2]] = "2024-01-01T00:00:00Z";
    mock(data); const { output } = await execute({ ecosystem: "npm", package: "request" });
    expect((output.versions as Array<{version: string}>)[0].version).toBe(versions[2]);
  });
  it.each([undefined, 5, 100000])("truncates only at the requested/default character count %s", async max => {
    const data = fixture("pypi-project"); data.info.description = " \n" + "x".repeat(100010); mock(data);
    const { output } = await execute({ ecosystem: "pypi", package: "requests", ...(max === undefined ? {} : { max_readme_chars: max }) });
    expect(output.readme).toBe(data.info.description.slice(0, max ?? 20000));
    expect(output.readme_chars_total).toBe(data.info.description.length); expect(output.readme_truncated).toBe(true);
  });
});

describe("package-docs refusal and source failures", () => {
  it.each(["npm", "pypi"])("refuses missing %s packages with a fix", async ecosystem => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 404 }));
    await expect(execute({ ecosystem, package: "does-not-exist" })).rejects.toThrow(/Check spelling and ecosystem/);
  });
  it.each(["npm", "pypi"])("refuses an unknown %s version with no more than ten suggestions", async ecosystem => {
    const data = fixture(ecosystem === "npm" ? "npm-deprecated" : "pypi-project");
    const spy = ecosystem === "npm" ? mock(data) : vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(data)).mockResolvedValueOnce(new Response(null, { status: 404 }));
    try { await execute({ ecosystem, package: "request", version: "0.0.0000" }); expect.fail("expected refusal"); }
    catch (error) { expect(error).toBeInstanceOf(CapabilityRefusalError); expect(isCapabilityRefusal((error as Error).message)).toBe(true); expect((error as Error).message).toContain("Nearby available versions:"); }
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it("lists only the ten closest available versions in an unknown-version refusal", async () => {
    const data = fixture("npm-deprecated");
    data.versions = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`1.2.${i}`, {}]));
    mock(data);
    try { await execute({ ecosystem: "npm", package: "request", version: "1.2.99" }); expect.fail("expected refusal"); }
    catch (error) {
      const message = (error as Error).message;
      const suggestions = message.split("Nearby available versions: ")[1].split(". Check")[0].split(", ");
      expect(suggestions).toHaveLength(10);
      expect(suggestions.every(v => Object.hasOwn(data.versions, v))).toBe(true);
    }
  });
  it.each([403, 429, 500, 503])("counts HTTP %s as a source fault, with no retry", async status => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>secret upstream page</html>", { status }));
    try { await execute({ ecosystem: "npm", package: "request" }); expect.fail("expected source fault"); }
    catch (error) { expect(isCapabilityRefusal(error)).toBe(false); expect(isCapabilityRefusal((error as Error).message)).toBe(false); expect((error as Error).message).not.toContain("html"); if (status < 500) expect(error).toBeInstanceOf(SourceBlockedError); }
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it.each(["<html>private upstream diagnostics</html>", "{broken", "null"])("does not expose a malformed response body: %s", async body => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    try { await execute({ ecosystem: "pypi", package: "requests" }); expect.fail("expected source fault"); }
    catch (error) { expect((error as Error).message).toBe("Package registry source returned malformed JSON metadata; retry later."); expect(isCapabilityRefusal(error)).toBe(false); }
  });
  it.each(["npm", "pypi"])("classifies malformed %s metadata as a source fault", async ecosystem => {
    mock(ecosystem === "npm" ? { versions: [] } : {});
    await expect(execute({ ecosystem, package: "requests" })).rejects.toThrow(/registry source returned invalid package metadata/);
  });
  it("enforces the streaming size cap without relying on content-length and cancels reading", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(1024 * 1024)); }, cancel });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    await expect(execute({ ecosystem: "npm", package: "request" })).rejects.toThrow(/request a specific 'version'/);
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("rejects an oversized declared body and cancels it", async () => {
    const cancel = vi.fn(); const body = new ReadableStream({ cancel });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { headers: { "Content-Length": String(MAX_PACKAGE_REGISTRY_RESPONSE_BYTES + 1) } }));
    await expect(execute({ ecosystem: "npm", package: "request" })).rejects.toThrow(/request a specific 'version'/);
    expect(cancel).toHaveBeenCalled();
  });
  it("propagates timeouts as counted source faults", async () => {
    const timeout = new DOMException("Registry request timed out", "TimeoutError");
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(timeout));
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => { init?.signal?.throwIfAborted(); return json({}); });
    await expect(execute({ ecosystem: "pypi", package: "requests" })).rejects.toBe(timeout);
    expect(isCapabilityRefusal(timeout)).toBe(false); expect(spy).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ecosystem: "other", package: "x" }, { ecosystem: "npm", package: "@scope" },
    ...["", "../foo", "https://example.com", "-", "~", "--~", "favicon.ico", "@scope/../x", "foo?x", "node_modules", "a".repeat(215), null, 4].map(p => ({ ecosystem: "npm", package: p })),
    ...["", "-foo", "foo_", "föö", "foo/bar", "a\n", "a".repeat(201)].map(p => ({ ecosystem: "pypi", package: p })),
    ...["../x", "", 3].map(version => ({ ecosystem: "npm", package: "request", version })),
    ...[0, -1, 100001, 2.5, "5"].map(max_readme_chars => ({ ecosystem: "npm", package: "request", max_readme_chars })),
  ])("refuses invalid input before any fetch: %j", async input => {
    const spy = vi.spyOn(globalThis, "fetch");
    await expect(execute(input)).rejects.toBeInstanceOf(CapabilityRefusalError); expect(spy).not.toHaveBeenCalled();
  });
});

describe("Round 2 registry edge cases", () => {
  it.each(["npm-deprecated", "npm-scoped", "pypi-project", "pypi-yanked"])("never emits contact details in attribution: %s", async name => {
    mock(fixture(name));
    const { output } = await execute({ ecosystem: name.startsWith("npm") ? "npm" : "pypi", package: "fixture" });
    const attribution = output.attribution as { author: unknown; maintainer: unknown[] };
    expect(JSON.stringify(attribution)).not.toContain("@");
    if (name === "npm-deprecated") {
      expect(attribution.maintainer).toHaveLength(10);
      expect(attribution.author).toEqual({ name: "Fixture author", url: "https://example.invalid/author" });
    }
    if (name === "npm-scoped") expect(attribution.author).toEqual({ name: "Fixture author", url: "https://example.invalid/author" });
    if (name === "pypi-project") expect(attribution.author).toBe("Fixture author");
    if (name === "pypi-yanked") expect(attribution.author).toBeNull();
  });
  it("accepts legacy uppercase npm names", async () => {
    const spy = mock(fixture("npm-deprecated"));
    await execute({ ecosystem: "npm", package: "JSONStream" });
    expect(spy.mock.calls[0][0]).toBe("https://registry.npmjs.org/JSONStream");
  });
  it("refuses npm special registry records without versions as not found", async () => {
    mock({ _id: "special" });
    await expect(execute({ ecosystem: "npm", package: "special" })).rejects.toBeInstanceOf(CapabilityRefusalError);
  });
  it.each(["", "ERROR: No README data found!"])("falls back from missing version README %j", async readme => {
    const data = fixture("npm-deprecated"); data.versions[data["dist-tags"].latest].readme = readme; mock(data);
    const { output } = await execute({ ecosystem: "npm", package: "request" });
    expect(output.readme).toBe(data.readme);
    expect(output.readme_version_note).toContain("not pinned");
  });
  it.each([["README.md", "markdown"], ["README.rst", "rst"], ["README.txt", "plain"]])("uses npm filename %s for format", async (filename, format) => {
    const data = fixture("npm-deprecated"); data.readmeFilename = filename; mock(data);
    expect((await execute({ ecosystem: "npm", package: "request" })).output.readme_format).toBe(format);
  });
  it("returns null and explains a missing README", async () => {
    const data = fixture("npm-deprecated"); data.readme = "ERROR: No README data found!"; mock(data);
    expect((await execute({ ecosystem: "npm", package: "request" })).output).toMatchObject({ readme: null, readme_version_note: expect.stringContaining("No README") });
  });
  it("uses only the per-version npm endpoint when README is present", async () => {
    const data = fixture("npm-deprecated"); data.versions["2.88.2"].readme = "# Release docs";
    const spy = mock(data);
    const { output, provenance } = await execute({ ecosystem: "npm", package: "request", version: "2.88.2" });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(provenance.source).toBe("https://registry.npmjs.org/request/2.88.2");
    expect(output.readme).toBe("# Release docs");
  });
  it("returns smaller npm release metadata even when optional packument exceeds the cap", async () => {
    const release = fixture("npm-deprecated").versions["2.88.2"];
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(release)).mockResolvedValueOnce(new Response(null, { headers: { "Content-Length": String(MAX_PACKAGE_REGISTRY_RESPONSE_BYTES + 1) } }));
    const { output } = await execute({ ecosystem: "npm", package: "request", version: "2.88.2" });
    expect(output).toMatchObject({ version: "2.88.2", readme: null, latest_version: null });
  });
  it.each([["git+https://github.com/user/repo.git", "https://github.com/user/repo"], ["github:user/repo", "https://github.com/user/repo"], ["unusable", null]])("normalizes repository %s", async (raw, url) => {
    const data = fixture("npm-deprecated"); data.versions[data["dist-tags"].latest].repository = raw; mock(data);
    expect((await execute({ ecosystem: "npm", package: "request" })).output).toMatchObject({ repository_url: url, repository_raw: url ? null : raw });
  });
  it("ignores invented npm changelog fields", async () => {
    const data = fixture("npm-deprecated"); data.versions[data["dist-tags"].latest].changelog = "https://example.invalid/fake"; mock(data);
    expect((await execute({ ecosystem: "npm", package: "request" })).output.changelog_url).toBeNull();
  });
  it.each(["Changelog", "Changes", "Release notes"])("reads PyPI %s links", async key => {
    const data = fixture("pypi-project"); data.info.project_urls = { [key]: "https://example.invalid/changes" }; mock(data);
    expect((await execute({ ecosystem: "pypi", package: "requests" })).output.changelog_url).toBe("https://example.invalid/changes");
  });
  it.each(["", "x".repeat(201)])("prefers a PyPI licence classifier over empty or long licence", async license => {
    const data = fixture("pypi-project"); data.info.license_expression = null; data.info.license = license; data.info.classifiers = ["License :: OSI Approved :: MIT License"]; mock(data);
    expect((await execute({ ecosystem: "pypi", package: "requests" })).output.license).toBe("MIT License");
  });
  it("never splits a surrogate pair during truncation", async () => {
    const data = fixture("pypi-project"); data.info.description = "x😀y"; mock(data);
    expect((await execute({ ecosystem: "pypi", package: "requests", max_readme_chars: 2 })).output).toMatchObject({ readme: "x", readme_chars_total: 4, readme_truncated: true });
  });
  it("orders PyPI unknown-version suggestions by upload date rather than prefix", async () => {
    const data = fixture("pypi-project"); data.releases = { "1.0": [{ upload_time_iso_8601: "2020-01-01" }], "2.0": [{ upload_time_iso_8601: "2026-01-01" }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(data)).mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(execute({ ecosystem: "pypi", package: "requests", version: "1.1" })).rejects.toThrow("Nearby available versions: 2.0, 1.0");
  });
});


it("uses a smaller PyPI release when project history exceeds the cap", async () => {
  const release = fixture("pypi-yanked");
  const spy = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(null, { headers: { "Content-Length": String(MAX_PACKAGE_REGISTRY_RESPONSE_BYTES + 1) } }))
    .mockResolvedValueOnce(json(release));
  const { output, provenance } = await execute({ ecosystem: "pypi", package: "requests", version: "2.32.0" });
  expect(spy).toHaveBeenCalledTimes(2);
  expect(output).toMatchObject({ version: "2.32.0", latest_version: null, versions: [], readme: release.info.description });
  expect(provenance.source).toBe("https://pypi.org/pypi/requests/2.32.0/json");
});
