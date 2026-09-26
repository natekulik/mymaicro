import { getUsdaDb } from "./db";

export type FoodSource = "foundation" | "sr_legacy";

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
const SOURCE_PRIORITY: FoodSource[] = ["foundation", "sr_legacy"];
// Wide enough that the category-tier re-ranking in resolve.ts (which picks
// the best of these, not just the top bm25 hit) has real candidates to
// work with — plain "Onions, raw" can rank outside bm25's top 5 for the
// query "onion" even though it's clearly the best match.
const CANDIDATES_PER_QUERY = 20;

// Returns ranked candidates across foundation (exact, then loose match) and
// sr_legacy (exact, then loose match), in that priority order. The caller
// (resolve.ts) picks the first candidate that actually has usable macro
// nutrient data — text relevance alone isn't enough to accept a match.
export function findFoodCandidates(query: string): FoodCandidate[] {
  const andQuery = toFtsQuery(query, "AND");
  const orQuery = toFtsQuery(query, "OR");
  const candidates: FoodCandidate[] = [];

  if (andQuery) {
    for (const source of SOURCE_PRIORITY) {
      for (const match of search(andQuery, source)) {
        candidates.push({ match, confidence: "high" });
      }
    }
  }
  if (orQuery) {
    for (const source of SOURCE_PRIORITY) {
      for (const match of search(orQuery, source)) {
        candidates.push({ match, confidence: "low" });
      }
    }
  }
  return candidates;
}

function search(ftsQuery: string, source: FoodSource): MatchRow[] {
  const db = getUsdaDb();
  return db
    .prepare(
      `SELECT f.fdc_id AS fdcId, f.description AS description, f.source AS source
       FROM foods_fts fts JOIN foods f ON f.fdc_id = fts.rowid
       WHERE foods_fts MATCH ? AND f.source = ?
       ORDER BY rank LIMIT ?`,
    )
    .all(ftsQuery, source, CANDIDATES_PER_QUERY) as MatchRow[];
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
