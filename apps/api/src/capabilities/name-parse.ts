import { registerCapability, type CapabilityInput } from "./index.js";

const PREFIXES = new Set(["mr", "mrs", "ms", "miss", "dr", "prof", "rev", "sir", "dame", "lord", "lady", "hon", "judge", "justice", "capt", "col", "gen", "lt", "sgt", "cpl", "pvt", "cmdr", "adm", "herr", "frau", "fru", "hr"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v", "esq", "phd", "md", "dds", "dvm", "jd", "cpa", "rn", "pe"]);
const PARTICLES = new Set(["von", "van", "de", "del", "della", "di", "da", "dos", "das", "du", "le", "la", "el", "al", "bin", "ibn", "af", "av", "zu", "zum", "zur"]);

registerCapability("name-parse", async (input: CapabilityInput) => {
  const fullName = ((input.full_name as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!fullName) throw new Error("'full_name' is required.");

  const result = parseName(fullName);

  return {
    output: result,
    provenance: { source: "algorithmic", fetched_at: new Date().toISOString() },
  };
});

function parseName(input: string): Record<string, unknown> {
  let s = input.trim();

  // Extract nickname in quotes or parentheses
  let nickname: string | null = null;
  const nickMatch = s.match(/["']([^"']+)["']/) ?? s.match(/\(([^)]+)\)/);
  if (nickMatch) {
    nickname = nickMatch[1].trim();
    s = s.replace(nickMatch[0], "").trim();
  }

  // Split into parts
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { full_name: input, first_name: null, middle_name: null, last_name: null, prefix: null, suffix: null, nickname };
  }

  // Extract prefix
  let prefix: string | null = null;
  if (parts.length > 1) {
    const first = parts[0].replace(/\.$/, "").toLowerCase();
    if (PREFIXES.has(first)) {
      prefix = parts.shift()!;
    }
  }

  // Extract suffix(es)
  const suffixes: string[] = [];
  while (parts.length > 1) {
    const last = parts[parts.length - 1].replace(/[.,]$/g, "").toLowerCase();
    if (SUFFIXES.has(last)) {
      suffixes.unshift(parts.pop()!);
    } else {
      break;
    }
  }
  const suffix = suffixes.length > 0 ? suffixes.join(" ") : null;

  // Handle "Last, First Middle" format
  if (parts.length >= 2 && parts[0].endsWith(",")) {
    parts[0] = parts[0].replace(/,$/, "");
    const lastName = parts.shift()!;
    parts.push(lastName);
  }

  // First name
  const firstName = parts.length > 0 ? parts.shift()! : null;

  // Last name (including particles like "von", "van der", etc.)
  let lastName: string | null = null;
  const lastParts: string[] = [];

  if (parts.length > 0) {
    // Collect particles + final surname
    while (parts.length > 1 && PARTICLES.has(parts[parts.length - 1].toLowerCase())) {
      // This shouldn't happen — particles come before surname
      break;
    }

    // Check if remaining parts start with particles
    const remaining = [...parts];
    const particleParts: string[] = [];

    // Last element is the surname; preceding particles attach to it
    if (remaining.length >= 2) {
      while (remaining.length > 1 && PARTICLES.has(remaining[0].toLowerCase())) {
        particleParts.push(remaining.shift()!);
      }
    }

    if (remaining.length === 1) {
      lastName = [...particleParts, remaining[0]].join(" ");
    } else {
      // Multiple remaining: middle names + last name
      lastName = remaining.pop()!;
      if (particleParts.length > 0) {
        lastName = [...particleParts, lastName].join(" ");
      }
    }

    // Everything between first and last is middle name
    const middleParts = parts.slice(0, parts.length - (particleParts.length + 1));
    if (middleParts.length > 0) {
      lastParts.push(...middleParts);
    }
  }

  const middleName = lastParts.length > 0 ? lastParts.join(" ") : null;

  return {
    full_name: input,
    first_name: firstName,
    middle_name: middleName,
    last_name: lastName,
    prefix,
    suffix,
    nickname,
  };
}
