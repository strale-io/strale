/**
 * Company-name matching primitives.
 *
 * Lifted out of us-company-data.ts so registry capabilities and the shared
 * fetch libs can reuse them without importing across the capability boundary.
 * us-company-data re-exports these, so its public surface is unchanged.
 *
 * Every registry name-search API this codebase talks to is fuzzy and NONE of
 * them rank by relevance:
 *   - SEC EDGAR full-text search returns filings mentioning the name, not the
 *     entity itself.
 *   - Finland's PRH searches every historical name and orders by business ID.
 *   - Norway's Brreg orders alphabetically: "Telenor" returns NITO TELENOR (a
 *     union chapter) ahead of TELENOR ASA, and "Norsk Hydro" returns
 *     NORSK HYDROGENBILFORENING.
 *
 * Taking the first result from any of them yields a confidently-wrong legal
 * entity, which a caller cannot detect. Score the candidates and refuse when
 * nothing matches well.
 */

export type MatchConfidence = "exact" | "high" | "low";

// Common corporate suffixes / stopwords stripped before comparing names, so
// "Apple Inc" and "Apple Inc." compare equal. Applied as standalone tokens
// after punctuation has been flattened to spaces.
// Non-English legal forms matter more than they look. Every real customer query
// in the 90 days to 2026-08-09 was a single bare token — LEGO, Maersk, Nokia,
// Telenor — while registries return the full legal name. Without stripping the
// local suffix, "telenor" vs "TELENOR ASA" is a single-token partial match,
// which classifyNameMatch deliberately rates `low`, so a perfectly good query
// gets refused. With it stripped, both sides normalise to "telenor" and match
// exactly.
//
// A bare "as" (Norwegian) is deliberately NOT in the list: it is an ordinary
// English word and stripping it would corrupt unrelated names. "Telenor AS"
// still resolves, via the two-token Jaccard path rather than suffix stripping.
const CORP_SUFFIX_RE =
  // German forms added 2026-08-12 (P1, german-company-data scoring): se, ug,
  // kgaa, ohg, mbh. Two candidates were deliberately REJECTED in review, like
  // bare "as" before them:
  //   - "kg": stripping it makes "Muster GmbH" and "Muster GmbH & Co. KG"
  //     normalize identically — those are two DISTINCT legal entities (the
  //     GmbH is the KG's Komplementär; standard German mid-market structure).
  //     Unstripped, the pair scores `low` and is correctly refused as
  //     ambiguous. It also eats leading tokens ("KG Hansen Transport").
  //   - "ev": the punctuated form "e.V." already normalizes away via the
  //     single-letter drop below; a bare "ev" token only broke real names
  //     ("EV Metals Group" vs "Metals Group" → false exact).
  /\b(incorporated|inc|corporation|corp|company|co|llc|ltd|limited|lp|plc|holdings?|group|the|asa|oyj|oy|abp|ab|aps|gmbh|ag|nv|bv|sa|sas|sarl|srl|spa|kft|se|ug|kgaa|ohg|mbh)\b/gi;

/**
 * Normalize a company name for fuzzy comparison: lowercase, flatten punctuation
 * to spaces, drop common corporate suffixes, collapse whitespace.
 */
/**
 * Fold diacritics and the Nordic/continental letters that Unicode
 * decomposition does not cover.
 *
 * Registries return the legal name with its native spelling while callers type
 * ASCII: "Nestle" for Nestlé S.A., "Orsted" for Ørsted A/S, "Mehilainen" for
 * Mehiläinen. Without folding, those score as non-matches and a valid query is
 * refused. NFD + stripping combining marks handles é/ä/å; ø, æ, œ, ß, ł and đ
 * are single code points with no decomposition, so they need explicit mapping.
 */
const LETTER_FOLD: Record<string, string> = {
  ø: "o", æ: "ae", œ: "oe", ß: "ss", ł: "l", đ: "d", ð: "d", þ: "th",
};

function foldDiacritics(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[øæœßłđðþ]/g, (c) => LETTER_FOLD[c] ?? c);
}

export function normalizeCompanyName(s: string): string {
  const base = foldDiacritics(s.toLowerCase())
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = base.replace(CORP_SUFFIX_RE, " ").replace(/\s+/g, " ").trim();
  // A name that consists ONLY of suffix-list tokens ("EV Group", "KG
  // Knutsson"'s leading token, a company literally named "SE") must not
  // normalize to "" — an empty side always classifies `low`, which would make
  // such companies permanently unresolvable on every registry. Fall back to
  // the unstripped form; comparison still works, just without suffix removal.
  return (stripped || base)
    // Punctuated legal forms shatter into single letters once punctuation is
    // flattened: "Nestlé S.A." -> "nestle s a", "Ørsted A/S" -> "orsted a s",
    // "Heineken N.V." -> "heineken n v". Those stray letters are never part of
    // the distinguishing name, and leaving them in turns an exact match into a
    // partial one, so a valid query gets refused.
    //
    // Only dropped when at least one multi-character token survives — a company
    // genuinely named a single letter keeps it rather than normalising to "".
    .split(" ")
    .reduce<string[]>((acc, tok, _i, all) => {
      const hasLongToken = all.some((t) => t.length > 1);
      if (tok.length === 1 && hasLongToken) return acc;
      acc.push(tok);
      return acc;
    }, [])
    .join(" ");
}

/**
 * Classify how well the name the caller asked for matches the name SEC EDGAR
 * actually returned for the resolved CIK.
 *
 * Why this exists: name lookups resolve via SEC full-text *filing* search
 * (`searchEdgar`), which returns the top-scoring filing that mentions the query
 * — not an entity lookup. For a private company with no filings of its own
 * (e.g. "Stripe Inc" pre-IPO) every hit is a *different* public filer that
 * merely mentions the name, so the capability would otherwise return someone
 * else's identity with no signal. This surfaces that risk (per the DEC-
 * 20260428-B "screening_signal" transparency spirit): callers gate on
 * `is_exact_match` / `match_confidence` rather than trusting a fuzzy hit.
 *
 * Errs toward "low": a correct-but-abbreviated match (e.g. "IBM" vs
 * "International Business Machines Corp") is flagged low, which is the safe
 * direction — a false "low" prompts a caller to verify; a false "exact" would
 * assert a wrong identity.
 */
export function classifyNameMatch(
  searched: string,
  matched: string,
): { match_confidence: MatchConfidence; is_exact_match: boolean } {
  const q = normalizeCompanyName(searched);
  const m = normalizeCompanyName(matched);
  if (!q || !m) return { match_confidence: "low", is_exact_match: false };
  if (q === m) return { match_confidence: "exact", is_exact_match: true };

  const qTokens = new Set(q.split(" "));
  const mTokens = new Set(m.split(" "));
  const intersection = [...qTokens].filter((t) => mTokens.has(t)).length;
  // Both sets are non-empty here (guarded above), so union is too.
  const jaccard = intersection / new Set([...qTokens, ...mTokens]).size;

  // A partial overlap only counts as "high" when BOTH names carry ≥2 tokens.
  // A single-token name (Stripe, Uber, Meta) that shares its one token with a
  // longer, different name ("Stripe Financial Holdings") is not a confident
  // match and must fall through to "low" — otherwise Jaccard 1/2 would call it
  // "high", the exact false-confidence this signal exists to prevent.
  const bothMultiToken = qTokens.size >= 2 && mTokens.size >= 2;
  return bothMultiToken && jaccard >= 0.5
    ? { match_confidence: "high", is_exact_match: false }
    : { match_confidence: "low", is_exact_match: false };
}

export interface NameSearchResolution {
  id: string;
  matchedName: string;
  matchConfidence: "exact" | "high";
}

/**
 * For registries whose search returns a page of candidates that is NOT
 * ranked by legal-entity relevance (Companies House `/search/companies` does
 * its own internal weighting, but that weighting is not an identity match —
 * see this module's header comment) — score every candidate with
 * classifyNameMatch and refuse rather than take candidates[0].
 *
 * uk-company-data.ts independently grew an identically-shaped `pickByName`
 * (PR #224, branch fix/name-match-confidence, open/unmerged as of
 * 2026-08-14) for the same Companies House endpoint. That version could not
 * be imported here: it lives on an unmerged branch, and — more durably —
 * capability executor files deliberately do not import from one another (see
 * this module's header: these primitives were lifted out of a capability
 * file specifically so registry capabilities share them via this lib instead
 * of reaching across the capability boundary). This is that shared version,
 * generalized over the candidate shape so officer-search.ts and
 * uk-filing-events.ts (both Companies House name-search callers) can use it
 * without duplicating the bucket/refuse logic a third and fourth time. When
 * #224 lands, uk-company-data.ts's own pickByName can be consolidated onto
 * this one.
 */
export function pickByName<T>(
  query: string,
  candidates: T[],
  getName: (c: T) => string | null | undefined,
  getId: (c: T) => string | null | undefined,
  opts: { subjectLabel: string; disambiguationHint: string },
): NameSearchResolution {
  const exact = new Map<string, string>();
  const high = new Map<string, string>();
  for (const c of candidates) {
    const name = getName(c);
    const id = getId(c);
    if (!name || !id) continue;
    const { match_confidence } = classifyNameMatch(query, name);
    if (match_confidence === "exact" && !exact.has(id)) exact.set(id, name);
    else if (match_confidence === "high" && !high.has(id)) high.set(id, name);
  }

  const pickUnambiguous = (bucket: Map<string, string>, label: "exact" | "high"): NameSearchResolution | null => {
    if (bucket.size === 0) return null;
    if (bucket.size === 1) {
      const [id, matchedName] = bucket.entries().next().value!;
      return { id, matchedName, matchConfidence: label };
    }
    const listing = [...bucket.entries()].slice(0, 5).map(([id, n]) => `${n} (${id})`).join("; ");
    throw new Error(
      `Ambiguous ${opts.subjectLabel} name "${query}": ${bucket.size} distinct registered ` +
        `entities are ${label === "exact" ? "exact" : "close"} matches — ${listing}. ${opts.disambiguationHint}`,
    );
  };

  const winner = pickUnambiguous(exact, "exact") ?? pickUnambiguous(high, "high");
  if (winner) return winner;

  const closest = candidates.map(getName).filter((n): n is string => !!n).slice(0, 3).join(", ");
  throw new Error(
    `No confident ${opts.subjectLabel} match for "${query}". The search is fuzzy and returned only ` +
      `unrelated entities${closest ? ` (closest: ${closest})` : ""}. ${opts.disambiguationHint}`,
  );
}

/**
 * For registries whose search returns a single best-guess result rather than
 * a ranked candidate pool (cvrapi.dk's `search=` parameter) — there is no pool
 * to bucket and pick from, but the same discipline still applies: classify
 * what came back against what was asked, and refuse rather than silently hand
 * back an unrelated entity. Used by danish-company-data.ts.
 *
 * canadian-company-data.ts shared this until 2026-08-14, when its name path
 * was rebuilt on a real POST to the Corporations Canada site search — the GET
 * query-string parameters it had been using were inert, so the page it parsed
 * was always the empty search form. That POST returns a genuine candidate
 * pool, so it moved to `pickByName` above and no longer calls this.
 */
export function assertSingleResultMatch(
  query: string,
  returnedName: string | null | undefined,
  opts: {
    /** e.g. "Danish", "Canadian" — used in "No confident {X} registry match". */
    jurisdictionLabel: string;
    /** e.g. "cvrapi.dk", "The Corporations Canada site search". */
    sourceDescription: string;
    /** Optional trailing clause appended right after "returned an unrelated entity (...)". */
    extraClause?: string;
    /** e.g. "Provide the CVR number (8 digits) for an exact lookup." */
    disambiguationHint: string;
  },
): Exclude<MatchConfidence, "low"> {
  const { match_confidence } = classifyNameMatch(query, returnedName ?? "");
  if (match_confidence === "low") {
    const named = returnedName ? ` ("${returnedName}")` : "";
    throw new Error(
      `No confident ${opts.jurisdictionLabel} registry match for "${query}". ` +
        `${opts.sourceDescription} returned an unrelated entity${named}${opts.extraClause ?? ""}. ` +
        `${opts.disambiguationHint}`,
    );
  }
  return match_confidence;
}
