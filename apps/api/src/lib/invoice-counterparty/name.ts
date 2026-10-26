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

/** Deterministic string equivalence only; never resolves an entity. */
export function normaliseCompanyName(name: string): string {
  let value = name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/ß/g, "ss").replace(/ø/g, "o").replace(/ł/g, "l")
    .replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
  // Only strip trailing legal forms, including dotted or slashed variants.
  const suffix = /(?:^|\s)(?:ab|gmbh|ltd|limited|sa|s a|bv|b v|oy|oyj|a s|as|aps|a p s|plc|inc|llc|ag|nv|sarl|sas)$/;
  for (;;) {
    const next = value.replace(suffix, "").trim();
    if (next === value) return value;
    value = next;
  }
}

export function compareCompanyNames(invoice: string, registered: string): "exact" | "equivalent" | "different" {
  if (invoice === registered) return "exact";
  const a = normaliseCompanyName(invoice);
  return a !== "" && a === normaliseCompanyName(registered) ? "equivalent" : "different";
}
