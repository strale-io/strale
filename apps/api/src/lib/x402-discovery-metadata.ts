import { readFileSync, readdirSync } from "node:fs";
import { isIP } from "node:net";
import yaml from "js-yaml";
import { Ajv, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export interface DiscoveryManifest {
  slug: string;
  name: string;
  description: string;
  category?: string;
  processes_personal_data?: boolean;
  input_schema?: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  test_fixtures?: { health_check_input?: unknown };
}
export interface DiscoveryMetadata {
  name: string;
  description: string;
  tags: string[];
  inputExample?: unknown;
  outputExample?: unknown;
  inputOmission?: string;
  outputOmission?: string;
}

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv);
const validators = new WeakMap<object, ValidateFunction>();
function unsupportedFormat(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const node = value as Record<string, unknown>;
  if (typeof node.format === "string" && !(node.format in ajv.formats)) return `unsupported schema format: ${node.format}`;
  const children: unknown[] = [];
  for (const key of ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"]) {
    if (node[key] && typeof node[key] === "object") children.push(...Object.values(node[key]));
  }
  for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"]) {
    if (Array.isArray(node[key])) children.push(...node[key]);
  }
  for (const key of ["items", "contains", "additionalProperties", "propertyNames", "not", "if", "then", "else", "unevaluatedItems", "unevaluatedProperties", "additionalItems", "contentSchema"]) {
    if (Array.isArray(node[key])) children.push(...node[key]);
    else if (node[key] && typeof node[key] === "object") children.push(node[key]);
  }
  return children.map(unsupportedFormat).find(Boolean);
}
// Unknown formats fail closed rather than silently publishing an unchecked example.
export function exampleFailure(schema: Record<string, unknown> | undefined, value: unknown): string | undefined {
  if (value === undefined) return "missing example";
  if (!schema) return "missing schema";
  try {
    const unsupported = unsupportedFormat(schema);
    if (unsupported) return unsupported;
    let validate = validators.get(schema);
    if (!validate) {
      validate = ajv.compile(schema);
      // Ajv otherwise strongly retains a new DB schema on every cache refresh.
      ajv.removeSchema(schema);
      validators.set(schema, validate);
    }
    return validate(value) ? undefined : ajv.errorsText(validate.errors, { separator: "; " });
  } catch (error) {
    return `schema validation unavailable: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/** Pure, conservative public-example screen. Public company/VAT IDs are allowed;
 * ambiguous digit strings and free text resembling personal data are withheld.
 * Never consult known_answer: it can intentionally contain invalid input.
 */
export function inputPrivacyFailure(manifest: Pick<DiscoveryManifest, "slug" | "name" | "processes_personal_data" | "category">, value: unknown, kind: "input" | "output" = "input"): string | undefined {
  if (["compliance", "screening"].includes(manifest.category ?? "")) return "compliance or screening category";
  if (manifest.processes_personal_data) return "processes_personal_data";
  if (/(screen|\bpep\b|sanction|adverse.media|person|officer|director|beneficial.ownership|email.finder)/i.test(`${manifest.slug} ${manifest.name}`)) return "person lookup or screening tool";
  const walk = (item: unknown, key = ""): string | undefined => {
    const field = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (/(^|_)(name|full_name|first_name|last_name|persons?|directors?|officers?|surname|given_name|family_name|dob|birth|birthday|birthdate|address|street|phone|mobile|iban|card)(_|$)/.test(field)) return "personal data field";
    if (Array.isArray(item)) return item.map(v => walk(v, key)).find(Boolean);
    if (item && typeof item === "object") return Object.entries(item).map(([k, v]) => walk(v, k)).find(Boolean);
    if (typeof item !== "string" && typeof item !== "number") return undefined;
    let text = String(item);
    try {
      // URLs and stringified payloads are still public values, not a bypass.
      for (let pass = 0; pass < 2 && /%[0-9a-f]{2}/i.test(text); pass++) text = decodeURIComponent(text);
    } catch { return "ambiguous encoded text"; }
    if (/^\s*[\[{]/.test(text)) {
      try { return walk(JSON.parse(text)); }
      catch { return "uninspectable structured text"; }
    }
    // A placeholder is the whole value ("test", "value") or the whole text of a
    // markup element (<item>test</item>). Never a substring: example.com is the
    // reserved documentation domain and the safest example there is.
    if (typeof item === "string" && (/^\s*(?:test|string|example|foo|xxx|value|placeholder)\s*$/i.test(text)
      || />\s*(?:test|string|example|foo|xxx|value|placeholder)\s*</i.test(text))) return "placeholder example";
    if (/["'](?:name|full[_ -]?name|first[_ -]?name|last[_ -]?name|person|director|officer)["']\s*:/i.test(text)) return "embedded personal data field";
    const atDomains = [...text.matchAll(/@([a-z0-9.-]+)/gi)];
    if ((text.match(/@/g) ?? []).length !== atDomains.length || atDomains.some(match => !/^example\.(com|org|net)$/i.test(match[1].replace(/\.$/, "")))) return "email address";
    if (/\b[A-Z]{2}\d{2}(?:[ -]?[A-Z0-9]){11,30}\b/i.test(text)) return "IBAN";
    const ips = text.match(/(?:\d{1,3}\.){3}\d{1,3}|[\da-f]*:[\da-f:]+(?:%\w+)?/gi) ?? [];
    const documentationIP = (ip: string) => /^(192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|2001:0?db8:)/i.test(ip);
    if (ips.some(ip => isIP(ip) && !documentationIP(ip))) return "IP address";
    const withoutDocumentationIPs = ips.filter(ip => isIP(ip) && documentationIP(ip)).reduce((result, ip) => result.replace(ip, ""), text);
    const businessId = /^(company_?(id|number|registration_number)|registration_number|org_?number|orgnr|vat(_?(id|number))?|ico|cvr|siren|siret|corporate_number)$/i.test(field);
    if (/\b\d(?:[ -]?\d){12,18}\b/.test(text) && !(field === "corporate_number" && /^\d{13}$/.test(text))) return "card-shaped number";
    if (!businessId && /(?:\+\d[\d ().-]{6,}\d|\b\d(?:[ ().-]?\d){6,18}\b)/.test(withoutDocumentationIPs)) return "phone or card number";
    if (/\b\d{1,5}[a-z]?\s+(?:[\p{L}]+\s+){0,4}(?:street|st|road|rd|avenue|ave|lane|ln|drive|boulevard|way)\b/iu.test(text) || /\b(?:street|road|avenue|[\p{L}]*(?:gatan|vägen|vagen|straße|strasse|vej|gata))\s+\d+/iu.test(text)) return "street address";
    if (/\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{4}\b/.test(text)) return "possible date of birth";
    if (/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?[,]?\s+\d{4}\b|\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i.test(text)) return "possible date of birth";
    // Name-shaped free text, including nested text/prompt fields, is ambiguous.
    // Inputs only. Any two words match, so on outputs this withheld the example
    // of nearly every text tool ("Moved Permanently", a summary sentence) while
    // finding no personal name (checked 2026-10-29 across the 66 live tools it
    // alone withheld). An output reaching this line already passed the tool
    // gates above (no personal data, no screening, no person lookup) and every
    // field, email, phone, IBAN, IP, address and date check, and the same
    // example is public at GET /v1/capabilities/:slug.
    if (kind === "input" && /\b[\p{L}][\p{L}’'-]+\s+[\p{L}][\p{L}’'-]+\b/u.test(text.replace(/[^\s@]+@[^\s@]+/g, ""))) return "possible personal name";
    return undefined;
  };
  return walk(value);
}

const VOCABULARY: Record<string, string[]> = {
  "email-validate": ["email validation"],
  "whois-lookup": ["WHOIS lookup"],
  "translate": ["translate text"],
  "translate-text": ["translate text"],
  "image-to-text": ["OCR", "image to text"],
  "vat-validate": ["VAT number validation"],
  "vat-format-validate": ["VAT number validation"],
  "tech-stack-detect": ["tech stack detection"],
  "screenshot-url": ["screenshot url"],
  "screenshot": ["screenshot url"],
  "uk-company-data": ["UK company data"],
  "sanctions-check": ["sanctions screening"],
  "pep-check": ["PEP check"],
  "beneficial-ownership-lookup": ["beneficial ownership"],
};
export function discoveryTags(slug: string, category?: string): string[] {
  // DQ-39: no search/SEO vocabulary is added to Serper-backed tools.
  return [...new Set([...(category ? [category] : []), ...(VOCABULARY[slug] ?? [])])].slice(0, 5);
}

/** Whole examples only: measure UTF-8 JSON bytes before validation/publication. */
export function publicExampleFailure(manifest: DiscoveryManifest, schema: Record<string, unknown> | undefined, value: unknown, kind: "input" | "output" = "input"): string | undefined {
  if (value !== undefined && Buffer.byteLength(JSON.stringify(value), "utf8") > 1024) return "example exceeds 1024 bytes";
  return inputPrivacyFailure(manifest, value, kind) ?? exampleFailure(schema, value);
}

export function metadataFromManifest(manifest: DiscoveryManifest): DiscoveryMetadata {
  const input = manifest.test_fixtures?.health_check_input;
  const output = manifest.output_schema?.example;
  const inputOmission = publicExampleFailure(manifest, manifest.input_schema, input);
  const outputOmission = publicExampleFailure(manifest, manifest.output_schema, output, "output");
  return {
    name: manifest.name, description: manifest.description,
    tags: discoveryTags(manifest.slug, manifest.category),
    ...(inputOmission ? { inputOmission } : { inputExample: input }),
    ...(outputOmission ? { outputOmission } : { outputExample: output }),
  };
}

/** Strip annotations that can otherwise leak withheld examples via nested schemas. */
export function discoverySchema(value: unknown): any {
  if (Array.isArray(value)) return value.map(discoverySchema);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !["example", "examples", "default"].includes(key)).map(([key, item]) => [key,
    ["properties", "patternProperties", "$defs", "definitions", "dependentSchemas"].includes(key) && item && typeof item === "object"
      ? Object.fromEntries(Object.entries(item).map(([field, schema]) => [field, discoverySchema(schema)]))
      : ["enum", "const"].includes(key) ? item : discoverySchema(item),
  ]));
}

export function metadataKey(kind: "capability" | "solution", slug: string): string { return `${kind}:${slug}`; }
let manifestMetadata: Map<string, DiscoveryMetadata> | undefined;
export function getDiscoveryMetadata(kind: "capability" | "solution", slug: string): DiscoveryMetadata | undefined {
  if (!manifestMetadata) {
    // Same relative layout in src/ and dist/; Dockerfile COPY manifests/ makes
    // this available in production, as for capabilities/auto-register.ts.
    const directory = new URL("../../../../manifests/", import.meta.url);
    manifestMetadata = new Map(readdirSync(directory).filter(file => file.endsWith(".yaml")).map(file => {
      const manifest = yaml.load(readFileSync(new URL(file, directory), "utf8")) as DiscoveryManifest;
      return [metadataKey("capability", manifest.slug), metadataFromManifest(manifest)];
    }));
  }
  return manifestMetadata.get(metadataKey(kind, slug));
}
