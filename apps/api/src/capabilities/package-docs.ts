import { registerCapability, type CapabilityInput } from "./index.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { SourceBlockedError, STRALE_USER_AGENT } from "../lib/site-access.js";
import { MAX_PACKAGE_REGISTRY_RESPONSE_BYTES, ResourceLimitError, readJsonWithLimit } from "../lib/resource-limits.js";

interface Person { name?: string; email?: string; url?: string }
interface NpmVersion {
  name?: string; version?: string; description?: string; readme?: string; readmeFilename?: string;
  homepage?: string; repository?: string | { url?: string };
  license?: string | { type?: string }; author?: string | Person;
  maintainers?: Person[]; deprecated?: string;
}
interface Packument extends NpmVersion {
  versions?: Record<string, NpmVersion>;
  "dist-tags"?: Record<string, string>;
  time?: Record<string, string>;
}
interface ReleaseFile { upload_time_iso_8601?: string; yanked?: boolean; yanked_reason?: string }
interface PypiResponse {
  info: {
    name: string; version: string; summary?: string; description?: string;
    description_content_type?: string; project_urls?: Record<string, string>;
    home_page?: string; license?: string; license_expression?: string;
    classifiers?: string[]; author?: string; maintainer?: string; author_email?: string; maintainer_email?: string;
    yanked?: boolean; yanked_reason?: string;
  };
  releases?: Record<string, ReleaseFile[]>;
}

// House-style messages remain refusals even on paths which persist only text.
function refuse(field: string, fix: string): never {
  throw new CapabilityRefusalError(`'${field}' must be ${fix}`);
}
function validate(input: CapabilityInput) {
  const ecosystem = input.ecosystem;
  if (ecosystem !== "npm" && ecosystem !== "pypi") refuse("ecosystem", "npm or pypi.");
  const name = input.package;
  if (typeof name !== "string" || !name || name !== name.trim()) refuse("package", "a public registry package name.");
  if (ecosystem === "npm") {
    const part = "[A-Za-z0-9~-][A-Za-z0-9._~-]*";
    if (name.length > 214 || !new RegExp(`^(?:@${part}/)?${part}$`).test(name) || !/[A-Za-z0-9]/.test(name.split("/").pop()!) || ["node_modules", "favicon.ico"].includes(name.toLowerCase())) {
      refuse("package", "a valid npm name, optionally @scope/name; no URLs or paths.");
    }
  } else if (name.length > 200 || !/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(name)) {
    refuse("package", "a PyPI name with ASCII letters, numbers, dots, underscores or hyphens, starting and ending in a letter or number.");
  }
  const version = input.version;
  if (version !== undefined && (typeof version !== "string" || version !== version.trim() || !/^[A-Za-z0-9][A-Za-z0-9.+_!-]{0,127}$/.test(version))) {
    refuse("version", "an exact published version or npm dist-tag; omit it for latest.");
  }
  const max = input.max_readme_chars === undefined ? 20000 : input.max_readme_chars;
  if (typeof max !== "number" || !Number.isInteger(max) || max < 1 || max > 100000) {
    refuse("max_readme_chars", "an integer from 1 to 100000 (default 20000).");
  }
  return { ecosystem, name: ecosystem === "pypi" ? name.toLowerCase().replace(/[-_.]+/g, "-") : name, version, max };
}

async function registryJson<T>(url: string, versionRequested = false): Promise<T | null> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": STRALE_USER_AGENT },
    signal: AbortSignal.timeout(10000),
    // Never follow registry redirects to a documentation site or another host.
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) return null;
    if (response.status === 403 || response.status === 429) {
      throw new SourceBlockedError(`Package registry source unavailable (HTTP ${response.status}); retry later. Strale does not bypass registry blocks.`, { kind: "http", status: response.status });
    }
    throw new Error(`Package registry source returned HTTP ${response.status}; retry later.`);
  }
  try {
    const data = await readJsonWithLimit<T>(response, MAX_PACKAGE_REGISTRY_RESPONSE_BYTES, "package");
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new SyntaxError();
    return data;
  } catch (error) {
    if (error instanceof ResourceLimitError) {
      throw new CapabilityRefusalError(versionRequested
        ? "'package' must be a registry record no larger than 20 MiB; consult the registry directly for this oversized release."
        : "'package' must be a registry record no larger than 20 MiB; request a specific 'version' to use the smaller per-version record.");
    }
    if (error instanceof SyntaxError) throw new Error("Package registry source returned malformed JSON metadata; retry later.");
    throw error;
  }
}

function assertPypiMetadata(data: PypiResponse): void {
  if (!data.info || typeof data.info.name !== "string" || typeof data.info.version !== "string" ||
      (data.info.description != null && typeof data.info.description !== "string")) {
    throw new Error("PyPI registry source returned invalid package metadata; retry later.");
  }
}

function isoDate(raw: string | undefined): string | null {
  const time = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}
function recentVersions(entries: Array<{ version: string; released_at: string | null }>) {
  return entries.sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? "") || b.version.localeCompare(a.version)).slice(0, 50);
}
function unknownVersion(requested: string, versions: string[], byDate = false): never {
  // Shared prefix places the same major/minor family first, then recent entries.
  const prefix = (v: string) => { let n = 0; while (n < v.length && n < requested.length && v[n] === requested[n]) n++; return n; };
  const nearby = (byDate ? versions : [...versions].sort((a, b) => prefix(b) - prefix(a))).slice(0, 10);
  return refuse("version", `a published version or npm dist-tag. Nearby available versions: ${nearby.join(", ") || "none listed"}. Check the version list or omit version for latest.`);
}
function npmLicense(value: NpmVersion["license"]): string | null {
  return typeof value === "string" ? value : value?.type ?? null;
}
function projectLink(urls: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const link = Object.entries(urls).find(([label]) => label.toLowerCase().replace(/[ _-]/g, "") === key)?.[1];
    if (link) return link;
  }
  return null;
}

// Attribution is an allowlist: never pass through registry person objects.
function displayName(raw: string | undefined): string | null {
  const name = raw?.replace(/<[^>]*>/g, "").replace(/\([^)]*\)/g, "")
    .replace(/[^\s,;<>]*@[^\s,;<>]*/g, "").replace(/^[\s,;"']+|[\s,;"']+$/g, "").replace(/\s+,/g, ",").replace(/\s{2,}/g, " ").trim();
  return name || null;
}
function author(raw: NpmVersion["author"]): { name: string | null; url: string | null } | null {
  if (!raw) return null;
  const name = displayName(typeof raw === "string" ? raw : raw.name);
  const url = publicUrl(typeof raw === "string" ? raw.match(/\((https?:\/\/[^)]+)\)/)?.[1] : raw.url);
  return name || url ? { name, url } : null;
}
function publicUrl(raw: string | undefined): string | null {
  if (!raw || raw.includes("@")) return null;
  try {
    const url = new URL(raw);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}
function repository(raw: string | undefined) {
  let candidate = raw?.replace(/^git\+/, "").replace(/^git:\/\//, "https://")
    .replace(/^github:/, "https://github.com/").replace(/^git@github\.com:/, "https://github.com/");
  if (candidate) candidate = candidate.replace(/\.git(?=#|$)/, "");
  const url = publicUrl(candidate)?.replace(/^http:/, "https:") ?? null;
  return { repository_url: url, repository_raw: url ? null : raw ?? null };
}
function usableReadme(raw: string | undefined): raw is string {
  return typeof raw === "string" && raw.trim().length > 0 && raw.trim() !== "ERROR: No README data found!";
}
function truncate(text: string, max: number): string {
  // max/counts use UTF-16 units, but a boundary must never bisect a code point.
  const end = max < text.length && /[\uD800-\uDBFF]/.test(text[max - 1]) && /[\uDC00-\uDFFF]/.test(text[max]) ? max - 1 : max;
  return text.slice(0, end);
}
function pypiLicense(info: PypiResponse["info"]): string | null {
  const classifier = info.classifiers?.find(c => c.startsWith("License :: "))?.split(":: ").pop();
  const value = info.license_expression?.trim() || (info.license?.trim() && info.license.length <= 200 ? info.license.trim() : classifier);
  return value ? truncate(value, 200) : null;
}
function pypiVersions(data: PypiResponse) {
  return Object.entries(data.releases ?? {}).map(([version, files]) => ({
    version, released_at: files.map(f => isoDate(f.upload_time_iso_8601)).filter((d): d is string => d !== null).sort()[0] ?? null,
  })).sort((a, b) => (b.released_at ?? "").localeCompare(a.released_at ?? ""));
}

registerCapability("package-docs", async (input) => {
  const { ecosystem, name, version, max } = validate(input);
  let readme = "";
  let readmeFormat: "markdown" | "rst" | "plain" = "plain";
  let readmeVersionNote: string | null = null;
  let fields: Record<string, unknown>;
  let source: string;
  if (ecosystem === "npm") {
    source = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    // Version/tag endpoints avoid downloading every release in large packuments.
    // Fetch project metadata only for missing README or unknown-version suggestions.
    // An oversized optional fallback must not reject a valid smaller release.
    if (version) source += `/${encodeURIComponent(version)}`;
    let data = await registryJson<Packument>(source, !!version);
    const versionData = version ? data : null;
    if (!data && version) {
      const project = await registryJson<Packument>(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
      if (project?.versions) unknownVersion(version, Object.keys(project.versions).sort((a, b) => (project.time?.[b] ?? "").localeCompare(project.time?.[a] ?? "")));
    }
    if (!data || (!version && !data.versions)) refuse("package", "an existing public npm package. Check spelling and ecosystem, or the version list.");
    if ((!version && (typeof data.versions !== "object" || Array.isArray(data.versions))) || (version && typeof data.version !== "string")) {
      throw new Error("npm registry source returned invalid package metadata; retry later.");
    }
    if (versionData && !usableReadme(versionData.readme)) {
      try {
        const project = await registryJson<Packument>(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
        if (project?.versions && typeof project.versions === "object" && !Array.isArray(project.versions)) data = project;
      } catch (error) {
        if (!(error instanceof CapabilityRefusalError)) throw error;
        // The optional packument exceeded the cap; retain the smaller release.
      }
    }
    const projectAvailable = !version || data !== versionData;
    const latest = projectAvailable ? data["dist-tags"]?.latest ?? null : null;
    const resolved = versionData ? versionData.version! : latest;
    const versions = !projectAvailable ? [{ version: resolved!, released_at: null }] : recentVersions(Object.keys(data.versions!).map(v => ({ version: v, released_at: isoDate(data.time?.[v]) })));
    const selected = versionData ?? (resolved ? data.versions?.[resolved] : undefined);
    if (!selected) unknownVersion("latest", Object.keys(data.versions ?? {}));
    let packumentReadme = false;
    let filename = selected.readmeFilename;
    if (usableReadme(selected.readme)) readme = selected.readme;
    else if (projectAvailable && usableReadme(data.readme)) {
      readme = data.readme;
      filename = data.readmeFilename;
      packumentReadme = true;
      readmeVersionNote = `Registry packument README; not pinned to ${resolved}. It may describe a different version (latest dist-tag: ${latest ?? "unavailable"}). README attribution uses current registry metadata; the registry does not establish this README's version or licence separately.`;
    } else {
      readmeVersionNote = !projectAvailable
        ? "No README published in this per-version registry record. Omit version to try the unpinned packument README; latest and complete history are unavailable on this endpoint."
        : "No README published in the selected release or registry packument.";
    }
    readmeFormat = /\.(md|markdown|mdown)$/i.test(filename ?? "") ? "markdown" : /\.rst$/i.test(filename ?? "") ? "rst" : "plain";
    const license = npmLicense(selected.license);
    const current = latest ? data.versions?.[latest] : undefined;
    // The README is package-level content: do not label it with an old
    // requested release's licence or authorship when the packument supplied it.
    const attributionMetadata = packumentReadme ? {
      license: data.license ?? current?.license,
      author: data.author ?? current?.author,
      maintainers: data.maintainers ?? current?.maintainers,
    } : selected;
    const registryUrl = `https://www.npmjs.com/package/${encodeURIComponent(name)}` + (packumentReadme ? "" : `/v/${resolved}`);
    fields = {
      name: selected.name ?? data.name ?? name, version: resolved, latest_version: latest,
      summary: selected.description ?? data.description ?? null,
      docs_url: selected.homepage ?? data.homepage ?? null, homepage: selected.homepage ?? data.homepage ?? null,
      ...repository(typeof selected.repository === "string" ? selected.repository : selected.repository?.url),
      changelog_url: null, versions,
      deprecated: selected.deprecated ?? null, yanked: null, yanked_reason: null, license,
      attribution: { registry_url: registryUrl, license: npmLicense(attributionMetadata.license), author: author(attributionMetadata.author), maintainer: (Array.isArray(attributionMetadata.maintainers) ? attributionMetadata.maintainers : undefined)?.map(p => displayName(p.name)).filter((n): n is string => n !== null).slice(0, 10) ?? null },
    };
  } else {
    source = `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;
    let data: PypiResponse | null;
    let projectAvailable = true;
    try {
      data = await registryJson<PypiResponse>(source);
    } catch (error) {
      if (!(error instanceof CapabilityRefusalError) || !version) throw error;
      // An explicit release must remain usable when project history is too big.
      projectAvailable = false;
      source = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
      data = await registryJson<PypiResponse>(source, true);
      if (!data) unknownVersion(version, []);
    }
    if (!data) refuse("package", "an existing public PyPI package. Check spelling and ecosystem, or the version list.");
    assertPypiMetadata(data);
    let selected = data;
    if (version && version !== data.info.version) {
      source = `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`;
      const release = await registryJson<PypiResponse>(source, true);
      if (!release) unknownVersion(version, pypiVersions(data).map(v => v.version), true);
      assertPypiMetadata(release);
      selected = release;
    }
    const info = selected.info;
    const urls = info.project_urls ?? {};
    readme = info.description ?? "";
    if (!usableReadme(readme)) readmeVersionNote = "No description published in this PyPI release registry record.";
    const contentType = info.description_content_type?.split(";")[0].trim().toLowerCase();
    readmeFormat = contentType === "text/markdown" ? "markdown" : contentType === "text/x-rst" ? "rst" : "plain";
    const license = pypiLicense(info);
    const versions = pypiVersions(data).slice(0, 50);
    fields = {
      name: info.name, version: info.version, latest_version: projectAvailable ? data.info.version : null,
      summary: info.summary ?? null, docs_url: projectLink(urls, ["documentation", "docs"]),
      homepage: projectLink(urls, ["homepage", "home"]) ?? info.home_page ?? null,
      ...repository(projectLink(urls, ["repository", "source", "sourcecode", "code"]) ?? undefined),
      changelog_url: projectLink(urls, ["changelog", "changes", "releasenotes"]), versions,
      deprecated: null, yanked: info.yanked ?? false, yanked_reason: info.yanked_reason ?? null, license,
      attribution: { registry_url: `https://pypi.org/project/${name}/${info.version}/`, license, author: displayName(info.author?.trim() || info.author_email), maintainer: displayName(info.maintainer?.trim() || info.maintainer_email) },
    };
  }
  if (!usableReadme(readme)) readme = "";
  // provenance.source names the registry actually read. The data-access
  // fields come from the manifest via stampDataAccess: both registries share
  // one recorded terms check, so a per-call vendor here would only make the
  // stamper report the checks as pending.
  return {
    output: { ecosystem, ...fields, readme: usableReadme(readme) ? truncate(readme, max) : null, readme_format: readmeFormat, readme_truncated: readme.length > max, readme_chars_total: readme.length, readme_version_note: readmeVersionNote },
    provenance: { source, fetched_at: new Date().toISOString() },
  };
});
