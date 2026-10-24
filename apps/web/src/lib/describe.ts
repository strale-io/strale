// Plain-language labels for API values (VOICE.md: say what it means, not the field name).

export function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  return m ? m[1] : t;
}

export const TRANSPARENCY: Record<string, string> = {
  algorithmic: "Computed by fixed rules and lookups; no AI model writes the answer.",
  ai_generated: "An AI model takes part in producing the answer. Check it before acting on it.",
  mixed: "Partly AI: some fields are written by an AI model, the rest come from lookups or rules.",
};

export const RELIABILITY: Record<string, { label: string; note: string }> = {
  guaranteed: { label: "Always", note: "present in every successful answer" },
  common: { label: "Usually", note: "present for most inputs" },
  rare: { label: "Sometimes", note: "present only for some inputs" },
};

export function schemaType(p: { type?: string | string[]; enum?: unknown[] } | undefined): string {
  if (!p) return "—";
  if (p.enum?.length) return `one of ${p.enum.map(String).join(", ")}`;
  return Array.isArray(p.type) ? p.type.join(" or ") : p.type ?? "any";
}
