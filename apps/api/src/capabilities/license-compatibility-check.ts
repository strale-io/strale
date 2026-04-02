import { registerCapability, type CapabilityInput } from "./index.js";

// ── License knowledge base ────────────────────────────────────────────────────

interface LicenseInfo {
  spdxId: string;
  type: "permissive" | "weak_copyleft" | "strong_copyleft" | "proprietary" | "unknown";
  osiApproved: boolean;
  copyleft: boolean;
  commercialOk: boolean;
  saasOk: boolean;
  patentGrant: boolean;
}

const LICENSES: Record<string, LicenseInfo> = {};

function add(spdx: string, type: LicenseInfo["type"], osi: boolean, copyleft: boolean, commercial: boolean, saas: boolean, patent: boolean) {
  LICENSES[spdx] = { spdxId: spdx, type, osiApproved: osi, copyleft, commercialOk: commercial, saasOk: saas, patentGrant: patent };
}

// Permissive
add("MIT", "permissive", true, false, true, true, false);
add("ISC", "permissive", true, false, true, true, false);
add("BSD-2-Clause", "permissive", true, false, true, true, false);
add("BSD-3-Clause", "permissive", true, false, true, true, false);
add("Apache-2.0", "permissive", true, false, true, true, true);
add("Unlicense", "permissive", true, false, true, true, false);
add("CC0-1.0", "permissive", false, false, true, true, false);
add("0BSD", "permissive", true, false, true, true, false);
add("BlueOak-1.0.0", "permissive", false, false, true, true, true);
add("Zlib", "permissive", true, false, true, true, false);

// Weak copyleft
add("LGPL-2.1-only", "weak_copyleft", true, true, true, true, false);
add("LGPL-2.1-or-later", "weak_copyleft", true, true, true, true, false);
add("LGPL-3.0-only", "weak_copyleft", true, true, true, true, false);
add("LGPL-3.0-or-later", "weak_copyleft", true, true, true, true, false);
add("MPL-2.0", "weak_copyleft", true, true, true, true, true);
add("EPL-2.0", "weak_copyleft", true, true, true, true, true);
add("CDDL-1.0", "weak_copyleft", true, true, true, true, false);

// Strong copyleft
add("GPL-2.0-only", "strong_copyleft", true, true, false, false, false);
add("GPL-2.0-or-later", "strong_copyleft", true, true, false, false, false);
add("GPL-3.0-only", "strong_copyleft", true, true, false, false, true);
add("GPL-3.0-or-later", "strong_copyleft", true, true, false, false, true);
add("AGPL-3.0-only", "strong_copyleft", true, true, false, false, true);
add("AGPL-3.0-or-later", "strong_copyleft", true, true, false, false, true);

// Proprietary / restrictive
add("SSPL-1.0", "proprietary", false, true, false, false, false);
add("BSL-1.1", "proprietary", false, false, false, false, false);
add("BUSL-1.1", "proprietary", false, false, false, false, false);
add("Elastic-2.0", "proprietary", false, false, false, false, false);

// ── Alias normalization ───────────────────────────────────────────────────────

const ALIASES: Record<string, string> = {
  "mit": "MIT", "isc": "ISC",
  "bsd": "BSD-2-Clause", "bsd-2": "BSD-2-Clause", "bsd-3": "BSD-3-Clause",
  "apache": "Apache-2.0", "apache2": "Apache-2.0", "apache-2": "Apache-2.0",
  "gpl2": "GPL-2.0-only", "gplv2": "GPL-2.0-only", "gpl-2.0": "GPL-2.0-only", "gpl-2": "GPL-2.0-only",
  "gpl3": "GPL-3.0-only", "gplv3": "GPL-3.0-only", "gpl-3.0": "GPL-3.0-only", "gpl-3": "GPL-3.0-only",
  "agpl": "AGPL-3.0-only", "agpl3": "AGPL-3.0-only", "agplv3": "AGPL-3.0-only", "agpl-3.0": "AGPL-3.0-only",
  "lgpl": "LGPL-3.0-only", "lgpl3": "LGPL-3.0-only", "lgplv3": "LGPL-3.0-only", "lgpl-3.0": "LGPL-3.0-only",
  "lgpl2.1": "LGPL-2.1-only", "lgplv2.1": "LGPL-2.1-only",
  "mpl": "MPL-2.0", "mpl2": "MPL-2.0",
  "unlicense": "Unlicense", "public domain": "Unlicense",
  "cc0": "CC0-1.0", "cc0-1": "CC0-1.0",
  "sspl": "SSPL-1.0", "bsl": "BSL-1.1",
};

function resolve(input: string): { spdxId: string; info: LicenseInfo | null } {
  const trimmed = input.trim();
  // Exact match
  if (LICENSES[trimmed]) return { spdxId: trimmed, info: LICENSES[trimmed] };
  // Alias match (case-insensitive)
  const lower = trimmed.toLowerCase();
  const alias = ALIASES[lower];
  if (alias && LICENSES[alias]) return { spdxId: alias, info: LICENSES[alias] };
  // Case-insensitive direct match
  for (const [key, val] of Object.entries(LICENSES)) {
    if (key.toLowerCase() === lower) return { spdxId: key, info: val };
  }
  return { spdxId: trimmed, info: null };
}

// ── Compatibility engine ──────────────────────────────────────────────────────

type UseCase = "commercial" | "open-source" | "saas" | "internal";

interface Conflict {
  licenses: string[];
  reason: string;
  severity: "error" | "warning";
}

function checkCompatibility(
  resolvedLicenses: Array<{ input: string; spdxId: string; info: LicenseInfo | null }>,
  useCase: UseCase,
): { compatible: boolean; conflicts: Conflict[]; warnings: string[] } {
  const conflicts: Conflict[] = [];
  const warnings: string[] = [];

  // Per-license vs use case
  for (const lic of resolvedLicenses) {
    if (!lic.info) {
      warnings.push(`Unknown license '${lic.input}' — cannot assess compatibility.`);
      continue;
    }

    if (useCase === "commercial") {
      if (lic.info.type === "strong_copyleft") {
        conflicts.push({
          licenses: [lic.spdxId],
          reason: `${lic.spdxId} is strong copyleft — requires distributing your source code under the same license. Incompatible with proprietary commercial distribution.`,
          severity: "error",
        });
      }
      if (lic.info.type === "weak_copyleft") {
        warnings.push(`${lic.spdxId} is weak copyleft — you must share modifications to the library itself, but your application code can remain proprietary.`);
      }
      if (lic.info.type === "proprietary") {
        conflicts.push({
          licenses: [lic.spdxId],
          reason: `${lic.spdxId} has restrictive terms that may be incompatible with commercial use. Review the specific license terms.`,
          severity: "error",
        });
      }
    }

    if (useCase === "saas") {
      if (lic.spdxId.startsWith("AGPL")) {
        conflicts.push({
          licenses: [lic.spdxId],
          reason: `${lic.spdxId} requires providing source code to network users. SaaS deployment triggers the AGPL's network copyleft clause.`,
          severity: "error",
        });
      }
      if (lic.info.type === "strong_copyleft" && !lic.spdxId.startsWith("AGPL")) {
        warnings.push(`${lic.spdxId} is strong copyleft — SaaS may not trigger distribution obligations, but consult legal counsel.`);
      }
      if (lic.info.type === "proprietary") {
        conflicts.push({
          licenses: [lic.spdxId],
          reason: `${lic.spdxId} has restrictive terms that may prohibit SaaS deployment.`,
          severity: "error",
        });
      }
    }

    if (useCase === "open-source" && !lic.info.osiApproved && lic.info.type !== "permissive") {
      warnings.push(`${lic.spdxId} is not OSI-approved — may not be accepted by open-source projects or package managers.`);
    }
  }

  // Pairwise compatibility
  const known = resolvedLicenses.filter((l) => l.info !== null);
  for (let i = 0; i < known.length; i++) {
    for (let j = i + 1; j < known.length; j++) {
      const a = known[i];
      const b = known[j];

      // GPL-2.0-only and GPL-3.0-only are mutually incompatible
      if (isGpl2Only(a.spdxId) && isGpl3Only(b.spdxId)) {
        conflicts.push({
          licenses: [a.spdxId, b.spdxId],
          reason: "GPL-2.0-only and GPL-3.0-only are mutually incompatible. Use 'or-later' variants to resolve.",
          severity: "error",
        });
      }
      if (isGpl3Only(a.spdxId) && isGpl2Only(b.spdxId)) {
        conflicts.push({
          licenses: [a.spdxId, b.spdxId],
          reason: "GPL-2.0-only and GPL-3.0-only are mutually incompatible. Use 'or-later' variants to resolve.",
          severity: "error",
        });
      }

      // Apache-2.0 is incompatible with GPL-2.0-only
      if (a.spdxId === "Apache-2.0" && isGpl2Only(b.spdxId)) {
        conflicts.push({
          licenses: [a.spdxId, b.spdxId],
          reason: "Apache-2.0 contains patent and indemnification clauses that are incompatible with GPL-2.0-only. Compatible with GPL-3.0.",
          severity: "error",
        });
      }
      if (b.spdxId === "Apache-2.0" && isGpl2Only(a.spdxId)) {
        conflicts.push({
          licenses: [b.spdxId, a.spdxId],
          reason: "Apache-2.0 contains patent and indemnification clauses that are incompatible with GPL-2.0-only. Compatible with GPL-3.0.",
          severity: "error",
        });
      }
    }
  }

  // Internal use: everything is fine (no distribution)
  if (useCase === "internal") {
    return { compatible: true, conflicts: [], warnings };
  }

  const hasErrors = conflicts.some((c) => c.severity === "error");
  return { compatible: !hasErrors, conflicts, warnings };
}

function isGpl2Only(spdx: string): boolean {
  return spdx === "GPL-2.0-only";
}

function isGpl3Only(spdx: string): boolean {
  return spdx === "GPL-3.0-only";
}

// ── Capability registration ───────────────────────────────────────────────────

registerCapability("license-compatibility-check", async (input: CapabilityInput) => {
  const rawLicenses = input.licenses as string[] | undefined;
  if (!rawLicenses || !Array.isArray(rawLicenses) || rawLicenses.length === 0) {
    throw new Error("'licenses' is required — provide an array of SPDX license identifiers (e.g. ['MIT', 'Apache-2.0']).");
  }

  const useCase = ((input.use_case as string) ?? "commercial").trim().toLowerCase() as UseCase;
  if (!["commercial", "open-source", "saas", "internal"].includes(useCase)) {
    throw new Error("'use_case' must be one of: commercial, open-source, saas, internal.");
  }

  const resolved = rawLicenses.map((raw) => {
    const { spdxId, info } = resolve(raw);
    return { input: raw, spdxId, info };
  });

  const { compatible, conflicts, warnings } = checkCompatibility(resolved, useCase);

  // Build summary
  const licenseTypes = new Set(resolved.map((l) => l.info?.type ?? "unknown"));
  let summary: string;
  if (compatible && conflicts.length === 0 && warnings.length === 0) {
    summary = `All ${resolved.length} licenses are compatible for ${useCase} use.`;
  } else if (compatible) {
    summary = `Licenses are compatible for ${useCase} use, but ${warnings.length} warning(s) noted.`;
  } else {
    summary = `${conflicts.filter((c) => c.severity === "error").length} compatibility conflict(s) found for ${useCase} use. ${licenseTypes.has("strong_copyleft") ? "Strong copyleft licenses detected." : ""}`.trim();
  }

  return {
    output: {
      compatible,
      use_case: useCase,
      license_count: resolved.length,
      licenses_analyzed: resolved.map((l) => ({
        input: l.input,
        spdx_id: l.spdxId,
        type: l.info?.type ?? "unknown",
        osi_approved: l.info?.osiApproved ?? false,
        compatible_with_use_case: l.info
          ? useCase === "internal"
            ? true
            : useCase === "commercial"
              ? l.info.commercialOk
              : useCase === "saas"
                ? l.info.saasOk
                : l.info.osiApproved
          : false,
      })),
      conflicts,
      warnings,
      summary,
    },
    provenance: {
      source: "SPDX license database (algorithmic analysis)",
      fetched_at: new Date().toISOString(),
    },
  };
});
