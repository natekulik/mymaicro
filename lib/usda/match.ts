import { d1Query } from "./d1";

export type FoodSource = "foundation" | "sr_legacy" | "branded";

export type FoodMatch = {
  fdcId: number;
  description: string;
  source: FoodSource;
};

export type FoodCandidate = { match: FoodMatch; confidence: "high" | "low" };

type MatchRow = { fdcId: number; description: string; source: FoodSource };

// Foundation Foods is the smaller, more recently lab-analyzed dataset —
// search it first. SR Legacy is the older but far broader fallback (most
// generic ingredients live here, and it has complete proximate/macro data
// for essentially everything — some Foundation Foods entries only carry
// detailed micronutrient analyte panels with no rolled-up macros, which is
// why the caller needs more than one candidate to fall back through).
// Branded goes last — a recipe ingredient line is almost always generic
// ("olive oil", not "Wesson Vegetable Oil 1 GAL"), so a clean generic match
// should win by default; branded only matters when a recipe actually names
// a specific product, which is exactly when it'll out-rank a weak generic
// candidate anyway via the relevance re-ranking below.
const SOURCE_PRIORITY: FoodSource[] = ["foundation", "sr_legacy", "branded"];
// Wide enough that the category-tier re-ranking in resolve.ts (which picks
// the best of these, not just the top bm25 hit) has real candidates to
// work with — plain "Onions, raw" can rank outside bm25's top 5 for the
// query "onion" even though it's clearly the best match.
const CANDIDATES_PER_QUERY = 20;

// Returns ranked candidates across foundation (exact, then loose match),
// sr_legacy, and branded (same order), in that priority order. The caller
// (resolve.ts) picks the first candidate that actually has usable macro
// nutrient data — text relevance alone isn't enough to accept a match.
//
// D1 serializes query EXECUTION on a given database even when many
// requests are fired concurrently (confirmed by benchmarking: firing N
// FTS queries in parallel takes ~N times a single query's cost, not one
// query's worth of wall time) — so the lever that actually matters is
// minimizing the TOTAL COUNT of statements per request, not round-trip
// parallelism. Each of AND/OR mode is one round trip (a UNION ALL across
// all three sources, each already ORDER BY rank LIMIT N inside its own
// branch) — D1 also caps compound SELECTs at 5 terms, which 3 sources
// fits comfortably under.
// Below this many AND-mode hits, the OR (loose) search is also worth
// running — resolve.ts only ever falls through to "low" confidence
// candidates when the "high" confidence ones didn't have usable macro
// data (rare: mostly analyte-only Foundation Foods records), but that
// case does need OR-mode candidates to fall back to.
const MIN_HIGH_CONFIDENCE_HITS = 3;

export async function findFoodCandidates(query: string): Promise<FoodCandidate[]> {
  const andQuery = toFtsQuery(query, "AND");
  const orQuery = toFtsQuery(query, "OR");

  const andRows = andQuery ? await searchAllSources(andQuery) : [];
  // Skipping the OR search in the common case (a strict match already
  // found plenty) is the single biggest lever on latency here — see the
  // note above findFoodCandidates: D1 serializes query execution, so
  // every statement NOT issued is time saved, not just a round trip.
  const orRows =
    orQuery && andRows.length < MIN_HIGH_CONFIDENCE_HITS ? await searchAllSources(orQuery) : [];

  const candidates: FoodCandidate[] = [];
  for (const match of andRows) candidates.push({ match, confidence: "high" });
  for (const match of orRows) candidates.push({ match, confidence: "low" });
  return candidates;
}

async function searchAllSources(ftsQuery: string): Promise<MatchRow[]> {
  const sql = SOURCE_PRIORITY.map(
    () =>
      `SELECT * FROM (
         SELECT f.fdc_id AS fdcId, f.description AS description, f.source AS source
         FROM foods_fts fts JOIN foods f ON f.fdc_id = fts.rowid
         WHERE foods_fts MATCH ? AND f.source = ?
         ORDER BY rank LIMIT ?
       )`,
  ).join(" UNION ALL ");

  const params = SOURCE_PRIORITY.flatMap((source) => [ftsQuery, source, CANDIDATES_PER_QUERY]);
  return d1Query<MatchRow>(sql, params);
}

// FTS5's default tokenizer does exact-token matching with no stemming, so
// a search for "onion" will NEVER match a document that only contains
// "onions" — and USDA descriptions are inconsistently singular/plural
// ("Onions, raw" vs "Garlic, raw"). Rather than reindex with a stemming
// tokenizer, each search term is expanded to its likely plural/singular
// counterpart and OR'd together, while different terms stay AND'd (or
// OR'd, in loose mode) against each other.
function wordVariants(word: string): string[] {
  const variants = new Set([word]);
  if (word.endsWith("ies") && word.length > 3) {
    variants.add(word.slice(0, -3) + "y");
  } else if (word.endsWith("y") && word.length > 1 && !"aeiou".includes(word[word.length - 2])) {
    variants.add(word.slice(0, -1) + "ies");
  }
  if (word.endsWith("s") && word.length > 1) {
    variants.add(word.slice(0, -1));
  } else {
    variants.add(`${word}s`);
  }
  return [...variants];
}

// FTS5 needs terms escaped/quoted so punctuation in ingredient text
// ("all-purpose", "1/2") can't break MATCH syntax.
function toFtsQuery(text: string, mode: "AND" | "OR"): string {
  const terms = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (terms.length === 0) return "";
  const groups = terms.map((term) => {
    const variants = wordVariants(term).map((v) => `"${v}"`);
    return variants.length > 1 ? `(${variants.join(" OR ")})` : variants[0];
  });
  // FTS5 only allows implicit (space-separated) AND between bare terms —
  // two parenthesized groups juxtaposed like that is a syntax error, so AND
  // mode needs the operator spelled out explicitly.
  return groups.join(mode === "AND" ? " AND " : " OR ");
}
