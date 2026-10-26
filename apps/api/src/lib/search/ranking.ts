/** Solutions only win on raw merit or ties; weak bundles never leapfrog a tool. */
export function applyConditionalSolutionBonus<
  T extends { item: { type: "solution" | "capability" }; score: number }
>(scored: T[], bonus = 3): void {
  const topCapability = scored.reduce(
    (best, s) =>
      s.item.type === "capability" ? Math.max(best, s.score) : best,
    -Infinity
  );
  for (const s of scored)
    if (s.item.type === "solution" && s.score >= topCapability)
      s.score += bonus;
}
export function isSlugFamilyMatch(slug: string, word: string): boolean {
  if (word === slug) return true;
  if (!word.includes("-") || word.startsWith("-") || word.endsWith("-"))
    return false;
  return `-${slug}-`.includes(`-${word}-`);
}
/** Group after scoring, preserving the best country variant and response metadata. */
export function groupSolutionVariants<
  T extends { item: { type: string; name: string } }
>(
  scored: T[],
  catalogue?: readonly { type: string; name: string }[]
): Array<T & { alsoAvailable?: string[] }> {
  const result: Array<T & { alsoAvailable?: string[] }> = [];
  const groups = new Map<string, number>();
  for (const entry of scored) {
    const match =
      entry.item.type === "solution"
        ? entry.item.name.match(/^(.*?)\s[—–]\s(.+)$/)
        : null;
    if (match) {
      const previous = groups.get(match[1]);
      if (previous !== undefined) {
        (result[previous].alsoAvailable ??= []).push(match[2]);
        continue;
      }
      groups.set(match[1], result.length);
    }
    result.push({ ...entry });
  }
  // Availability describes the catalogue, independently of relevance. A
  // country-specific query must not hide the other shipped country variants.
  if (catalogue)
    for (const entry of result) {
      if (entry.item.type !== "solution") continue;
      const selected = entry.item.name.match(/^(.*?)\s[—–]\s(.+)$/);
      if (!selected) continue;
      const variants = catalogue
        .filter((i) => i.type === "solution")
        .map((i) => i.name.match(/^(.*?)\s[—–]\s(.+)$/))
        .filter((m) => m && m[1] === selected[1] && m[2] !== selected[2])
        .map((m) => m![2]);
      if (variants.length) entry.alsoAvailable = [...new Set(variants)];
    }
  return result;
}
