/** vat-validate's SOAP adapter returns XML text without decoding entities. */
export function decodeViesText(value: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, entity => {
    const key = entity.slice(1, -1);
    if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? entity;
    const point = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

const LEGAL_FORM_SUFFIX = /(?:^|\s)(ab|gmbh|ltd|limited|sa|s a|bv|b v|oy|oyj|a s|as|aps|a p s|plc|inc|llc|ag|nv|sarl|sas)$/;

function foldCompanyName(name: string): string {
  return name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/ß/g, "ss").replace(/ø/g, "o").replace(/ł/g, "l")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

/** Deterministic string equivalence only; never resolves an entity. */
export function normaliseCompanyName(name: string): string {
  let value = foldCompanyName(name);
  // Only strip trailing legal forms, including dotted or slashed variants.
  for (;;) {
    const next = value.replace(LEGAL_FORM_SUFFIX, "").trim();
    if (next === value) return value;
    value = next;
  }
}

export function compareCompanyNames(invoice: string, registered: string): "exact" | "equivalent" | "different" {
  if (invoice === registered) return "exact";
  const a = normaliseCompanyName(invoice);
  return a !== "" && a === normaliseCompanyName(registered) ? "equivalent" : "different";
}

/** Source text can contain XML escapes, line breaks and invisible direction marks. */
export function sanitiseSourceName(value: string): string {
  return decodeViesText(value).replace(/\s+/gu, " ").replace(/[\p{Cc}\p{Cf}]/gu, "").trim();
}

/** Recognise trailing forms independently of the equivalence comparison. */
function legalForm(name: string): string | undefined {
  const form = foldCompanyName(name).match(LEGAL_FORM_SUFFIX)?.[1];
  return form === "limited" ? "ltd" : form?.replace(/ /g, "");
}

export function legalFormDiffers(a: string, b: string): boolean {
  const first = legalForm(a), second = legalForm(b);
  return first !== undefined && second !== undefined && first !== second;
}
