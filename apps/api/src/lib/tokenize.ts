const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been",
  "for", "of", "to", "in", "on", "at", "by", "with", "from",
  "and", "or", "not", "this", "that", "it", "its",
  "i", "me", "my", "we", "our", "you", "your",
  "do", "does", "did", "have", "has", "had",
  "can", "could", "would", "should", "will",
  "want", "need", "like", "get", "make",
]);

/** Tokenize a string into a set of lowercase alphanumeric words, dropping noise. */
export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9åäöéü\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));

  return new Set(words);
}
