import { getUsdaDb } from "./db";
import { findFoodCandidates, type FoodCandidate, type FoodMatch } from "./match";
import { normalizeUnit, unitToBaseAmount } from "./units";
import { parseIngredientLine } from "./parse-ingredient";
import { MICRO_NUTRIENTS, type MicroTotals } from "./micro-nutrients";
import type { IngredientMacroDetail, NutritionMacro, VariantOption } from "../recipe-types";

// USDA nutrient `id` values (not the classic INFOODS numbers) — verified
// against the downloaded nutrient.csv at import time.
const NUTRIENT_IDS = { calories: 1008, protein: 1003, fat: 1004, carbs: 1005 } as const;

export type Macro = { calories: number; protein: number; carbs: number; fat: number };

export type GramsSource = "usda_portion" | "unit_conversion" | "unresolved";

export type IngredientMacroResult = {
  raw: string;
  matched: FoodMatch | null;
  matchConfidence: "high" | "low" | "none";
  grams: number | null;
  gramsSource: GramsSource;
  macros: Macro | null;
  micros: MicroTotals | null;
  needsQuantity: boolean;
  suggestedUnit: string;
  variantOptions: VariantOption[];
};

function getNutrientRows(fdcId: number): Map<number, number> {
  const db = getUsdaDb();
  const rows = db
    .prepare("SELECT nutrient_id AS nutrientId, amount FROM food_nutrients WHERE fdc_id = ?")
    .all(fdcId) as { nutrientId: number; amount: number }[];
  return new Map(rows.map((r) => [r.nutrientId, r.amount]));
}

function getMacrosPer100g(fdcId: number): Macro | null {
  const byId = getNutrientRows(fdcId);
  if (byId.size === 0) return null;

  // Some Foundation Foods entries only carry detailed micronutrient/analyte
  // panels with no rolled-up proximates at all. Energy is required — it's
  // the one figure a "complete" record essentially always has together
  // with protein/carbs/fat, so its absence is the reliable signal that
  // this record is analyte-only and the caller should fall back to the
  // next candidate rather than report a partial macro set as if complete.
  if (!byId.has(NUTRIENT_IDS.calories)) return null;

  return {
    calories: byId.get(NUTRIENT_IDS.calories) ?? 0,
    protein: byId.get(NUTRIENT_IDS.protein) ?? 0,
    carbs: byId.get(NUTRIENT_IDS.carbs) ?? 0,
    fat: byId.get(NUTRIENT_IDS.fat) ?? 0,
  };
}

// Sparse on purpose: a food genuinely missing vitamin C data (most raw
// meats, for instance) should show as "no data" downstream, not a
// misleading 0 — so only keys the food actually has a row for are
// included, unlike the four core macros above.
function getMicrosPer100g(fdcId: number): MicroTotals {
  const byId = getNutrientRows(fdcId);
  const micros: MicroTotals = {};
  for (const def of MICRO_NUTRIENTS) {
    const amount = byId.get(def.id);
    if (amount !== undefined) micros[def.key] = amount;
  }
  return micros;
}

function scaleMicros(per100g: MicroTotals, grams: number): MicroTotals {
  const factor = grams / 100;
  const scaled: MicroTotals = {};
  for (const [key, value] of Object.entries(per100g)) {
    scaled[key] = value * factor;
  }
  return scaled;
}

// USDA's own measured gram-weight for a specific ingredient + unit — the
// most accurate conversion available, since density varies a lot between
// ingredients (a cup of flour and a cup of spinach aren't close). SR Legacy
// stores the unit text in `modifier` rather than the resolved unit name, so
// both fields are checked.
function getPortions(fdcId: number) {
  const db = getUsdaDb();
  return db
    .prepare(
      "SELECT unit_name AS unitName, modifier, gram_weight AS gramWeight FROM food_portions WHERE fdc_id = ?",
    )
    .all(fdcId) as { unitName: string | null; modifier: string | null; gramWeight: number }[];
}

function findUsdaPortionGramsPerUnit(fdcId: number, unitText: string | null): number | null {
  if (!unitText) return null;
  const needle = unitText.toLowerCase().replace(/s$/, "");
  const hit = getPortions(fdcId).find((p) => {
    const candidates = [p.unitName, p.modifier]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.toLowerCase());
    return candidates.some((c) => c.replace(/s$/, "") === needle || c.includes(needle));
  });
  return hit ? hit.gramWeight : null;
}

// For a bare count with no unit word at all ("2 eggs", "1 onion") — the
// food name itself IS the unit. USDA's first published portion for that
// food is usually its typical single-item weight (e.g. "1 large" for an
// egg), so it's a reasonable default when there's nothing more specific to
// match against.
function findDefaultPortionGrams(fdcId: number): number | null {
  const portions = getPortions(fdcId);
  return portions.length > 0 ? portions[0].gramWeight : null;
}

type GramsOutcome =
  | { grams: number; source: GramsSource; needsQuantity: false }
  | { grams: null; needsQuantity: boolean; suggestedUnit?: "oz" };

function gramsForCandidate(
  fdcId: number,
  unitText: string | null,
  quantity: number,
  hasExplicitQuantity: boolean,
): GramsOutcome {
  const unit = normalizeUnit(unitText);

  // Container units ("jar", "can", "box", "bottle", "bag", "package",
  // "pouch") vary too much in real-world size to guess responsibly, even
  // if some USDA record happens to have a portion labeled with that word —
  // that portion is for a specific product, not necessarily the one in
  // hand. Always ask rather than silently pick one — and suggest ounces,
  // since that's how jars/cans/bottles are actually labeled in the US.
  if (unit?.kind === "container") {
    return { grams: null, needsQuantity: true, suggestedUnit: "oz" };
  }

  const portionGramsPerUnit = findUsdaPortionGramsPerUnit(fdcId, unitText);
  if (portionGramsPerUnit !== null) {
    return { grams: portionGramsPerUnit * quantity, source: "usda_portion", needsQuantity: false };
  }

  if (unit && unit.kind !== "count") {
    // Mass units convert exactly. Volume units fall back to a water-like
    // density approximation (1 mL ≈ 1 g) when USDA doesn't have a measured
    // portion for this specific ingredient — flagged via `source`.
    const base = unitToBaseAmount(unit.key, quantity);
    if (base !== null) return { grams: base, source: "unit_conversion", needsQuantity: false };
  }

  if (!unitText) {
    if (!hasExplicitQuantity) {
      // A fully bare line ("parmesan cheese", "salt") — not even a
      // quantity was given, so there's nothing to scale a default portion
      // by with any confidence.
      return { grams: null, needsQuantity: true };
    }
    // No unit word, but a count was given ("2 eggs") — the food name
    // itself is the unit. Fall back to USDA's default portion for it.
    const defaultGrams = findDefaultPortionGrams(fdcId);
    if (defaultGrams !== null) {
      return { grams: defaultGrams * quantity, source: "usda_portion", needsQuantity: false };
    }
  }

  // A count unit ("clove", "slice") with no matching USDA portion can't be
  // responsibly converted to grams — no universal factor exists, so this
  // stays unresolved rather than guessing (and isn't a "needs quantity"
  // prompt, since a quantity — "3 cloves" — was already given; there's
  // just no conversion factor for it).
  return { grams: null, needsQuantity: false };
}

// USDA descriptions are conventionally "Category, modifiers..." (e.g.
// "Oil, olive, extra virgin"; "Flour, wheat, all-purpose"; "Beef, ground,
// 90% lean"). English food phrases usually put the head noun *last*
// ("olive oil" -> oil; "ground beef" -> beef; "all-purpose flour" ->
// flour). So: take the last word of the search phrase and require it to
// appear in the USDA category (the text before its first comma) — this is
// what keeps "olive oil" from matching an anchovy product just because it
// also happens to contain the words "olive" and "oil".
//
// Within that, USDA descriptions list modifiers as their own comma
// segments ("Oil, olive, salad or cooking"). Counting how many of the
// *other* search words appear as a whole segment (not just a substring)
// is what then prefers plain olive oil over an "Oil, corn, peanut, and
// olive" blend — both mention "olive" somewhere, but only the former has
// it as its own segment.
// Crude singularizer (strip a trailing "s") — just enough to line up
// "onion" against USDA's "Onions" or "olive" against "olives" without
// pulling in a real inflection library for what's a minor edge case.
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/s$/, "");
}

function searchWordsOf(searchName: string): string[] {
  return searchName.toLowerCase().split(/\s+/).filter(Boolean).map(normalizeWord);
}

function segmentsOf(description: string): string[] {
  return description.toLowerCase().split(",").map((s) => s.trim());
}

function headWordOf(searchName: string): string | null {
  const words = searchWordsOf(searchName);
  return words[words.length - 1] ?? null;
}

// Tier 3: the category IS the head word, nothing else ("Onion, raw" for
// "onion"). Tier 2: some other segment stands alone as exactly the head
// word — USDA often names things "<generic classifier>, <actual food>,
// ..." ("Alcoholic beverage, wine, cooking", "Snacks, popcorn, ..."), so
// the head noun for a search like "rice wine" (head word "wine") lands in
// the second segment, not the first, and still deserves strong credit.
// Tier 1: the category merely contains it as one of several words ("Onion
// rings, breaded..." for "onion") — a much weaker signal, since it's very
// often a different food entirely. Tier 0: no match.
function headTierOf(description: string, headWord: string | null): 0 | 1 | 2 | 3 {
  if (!headWord) return 0;
  const segments = segmentsOf(description);
  const category = segments[0] ?? "";
  const categoryWords = category.split(/\s+/).filter(Boolean).map(normalizeWord);
  if (categoryWords.length === 1 && categoryWords[0] === headWord) return 3;
  for (const segment of segments.slice(1)) {
    const segmentWords = segment.split(/\s+/).filter(Boolean).map(normalizeWord);
    if (segmentWords.length === 1 && segmentWords[0] === headWord) return 2;
  }
  if (categoryWords.includes(headWord)) return 1;
  return 0;
}

function rankCandidates(candidates: FoodCandidate[], searchName: string): FoodCandidate[] {
  const words = searchWordsOf(searchName);
  const headWord = headWordOf(searchName);
  if (!headWord) return candidates;

  return candidates
    .map((c, i) => {
      const headTier = headTierOf(c.match.description, headWord);
      const segments = segmentsOf(c.match.description);
      const exactSegmentMatches = words.filter((w) =>
        segments.some((seg) => normalizeWord(seg) === w),
      ).length;
      return { c, i, headTier, exactSegmentMatches };
    })
    .sort(
      (a, b) =>
        // `i` (original candidate order) is what encodes source priority —
        // foundation before sr_legacy, exact-term match before loose OR
        // fallback — so it has to win any tie below headTier/segment
        // matches, or a "simpler description" tiebreak could otherwise
        // reach past a good foundation match into a worse sr_legacy one.
        b.headTier - a.headTier || b.exactSegmentMatches - a.exactSegmentMatches || a.i - b.i,
    )
    .map((s) => s.c);
}

const FAT_VARIANCE_THRESHOLD_G = 5; // per 100g — a swing big enough to matter
// Generous enough that a real family (ground beef has 7 distinct USDA
// lean/fat levels: 70, 75, 80, 90, 93, 95, 97 — no 85%) never gets
// truncated in a way that could drop the one actually being used for the
// current total.
const MAX_VARIANT_OPTIONS = 12;

// Matches the *composition* descriptor USDA uses for fat/lean variants —
// "70% lean meat / 30% fat", "3.25% milkfat", "reduced fat", "skim",
// "nonfat", "lowfat". Deliberately does NOT match things like "grass-fed",
// "sheep", or "dried" — those are a different animal source or processing
// method, not a fat-content choice, and must not be grouped as if they
// were.
const COMPOSITION_PATTERN = /(\d+(\.\d+)?\s?%|\blean\b|\bfat\b|\bskim\b|\bwhole\b|\breduced\b|\blow.?fat\b|\bnonfat\b|\bfat.?free\b|\bmilkfat\b)/i;

// Splits off the one segment (after the category) that encodes the
// fat/composition level, if any — e.g. "Beef, ground, 80% lean meat / 20%
// fat, raw" -> { rest: "beef,ground,raw", hasComposition: true }. Two
// descriptions are true "same product, different fat level" siblings only
// if their `rest` is identical: that's what keeps "Milk, whole, ..." and
// "Milk, sheep, fluid" from being treated as the same product's variants —
// "sheep" isn't a composition word, so it never gets stripped, and the
// two `rest` strings stay different.
function stripCompositionSegment(description: string): { rest: string; hasComposition: boolean } {
  const segments = segmentsOf(description);
  const idx = segments.findIndex((seg, i) => i > 0 && COMPOSITION_PATTERN.test(seg));
  if (idx === -1) return { rest: segments.join(","), hasComposition: false };
  return { rest: segments.filter((_, i) => i !== idx).join(","), hasComposition: true };
}

function variantLabel(description: string): string {
  const idx = description.indexOf(",");
  return idx === -1 ? description : description.slice(idx + 1).trim();
}

type VariantFamily = { members: { candidate: FoodCandidate; per100g: Macro }[] };

// Finds the largest cluster of top-tier-category candidates that are
// identical apart from their fat/composition segment, with a fat swing big
// enough to actually matter — e.g. every "Beef, ground, N% lean meat / M%
// fat, raw" entry. Returns null if no such cluster exists, which is the
// common case (most ingredients — flour, garlic, onion — have exactly one
// obvious match and no "which version" question to ask).
function findVariantFamily(candidates: FoodCandidate[], searchName: string): VariantFamily | null {
  const headWord = headWordOf(searchName);
  if (!headWord) return null;

  const topTier = candidates.filter((c) => headTierOf(c.match.description, headWord) === 3);
  const withMacros = topTier
    .map((c) => ({ candidate: c, per100g: getMacrosPer100g(c.match.fdcId) }))
    .filter((x): x is { candidate: FoodCandidate; per100g: Macro } => x.per100g !== null);

  const groups = new Map<string, { candidate: FoodCandidate; per100g: Macro }[]>();
  for (const item of withMacros) {
    const { rest, hasComposition } = stripCompositionSegment(item.candidate.match.description);
    if (!hasComposition) continue;
    const list = groups.get(rest) ?? [];
    list.push(item);
    groups.set(rest, list);
  }

  let best: { candidate: FoodCandidate; per100g: Macro }[] | null = null;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const fats = group.map((g) => g.per100g.fat);
    if (Math.max(...fats) - Math.min(...fats) < FAT_VARIANCE_THRESHOLD_G) continue;
    if (!best || group.length > best.length) best = group;
  }
  return best ? { members: best } : null;
}

function variantOptionsFrom(family: VariantFamily, grams: number): VariantOption[] {
  const factor = grams / 100;
  // Leanest first: ascending fat is exactly descending lean% (they're
  // complementary — 97% lean/3% fat has the least fat of the bunch), so
  // sorting on the number we already have avoids parsing "lean" back out
  // of the label text. If the widest-spread family has more than we show,
  // sorting before slicing keeps the two extremes rather than an arbitrary
  // middle chunk.
  const sorted = [...family.members].sort((a, b) => a.per100g.fat - b.per100g.fat);

  const seenFat = new Set<number>();
  const options: VariantOption[] = [];
  for (const { candidate, per100g } of sorted) {
    const fatRounded = Math.round(per100g.fat);
    // Foundation and SR Legacy sometimes both carry an entry at the same
    // composition (e.g. two separate "95% lean" records) — collapse those
    // rather than let a duplicate crowd out a genuinely different option.
    if (seenFat.has(fatRounded)) continue;
    seenFat.add(fatRounded);
    options.push({
      fdcId: candidate.match.fdcId,
      description: candidate.match.description,
      label: variantLabel(candidate.match.description),
      macros: {
        calories: per100g.calories * factor,
        protein: per100g.protein * factor,
        carbs: per100g.carbs * factor,
        fat: per100g.fat * factor,
      },
      micros: scaleMicros(getMicrosPer100g(candidate.match.fdcId), grams),
    });
    if (options.length >= MAX_VARIANT_OPTIONS) break;
  }
  return options;
}

export function resolveIngredientMacros(rawLine: string): IngredientMacroResult {
  const parsed = parseIngredientLine(rawLine);
  const rawCandidates = findFoodCandidates(parsed.searchName);
  const rankedCandidates = rankCandidates(rawCandidates, parsed.searchName);
  const quantity = parsed.quantity ?? 1;
  const hasExplicitQuantity = parsed.quantity !== null;

  const family = findVariantFamily(rankedCandidates, parsed.searchName);

  // When a composition family exists (ground beef's lean/fat% siblings),
  // try its members first — a plain "80% lean" match is a better default
  // than an unrelated candidate (e.g. "grass-fed") that happens to rank
  // higher on text relevance alone but isn't part of any fat-content
  // choice at all.
  let candidates = rankedCandidates;
  if (family) {
    const familyIds = new Set(family.members.map((m) => m.candidate.match.fdcId));
    candidates = [
      ...rankedCandidates.filter((c) => familyIds.has(c.match.fdcId)),
      ...rankedCandidates.filter((c) => !familyIds.has(c.match.fdcId)),
    ];
  }

  let bestUnusable:
    | { match: FoodMatch; confidence: "high" | "low"; needsQuantity: boolean; suggestedUnit: string }
    | null = null;

  for (const candidate of candidates) {
    const per100g = getMacrosPer100g(candidate.match.fdcId);
    if (!per100g) continue; // no usable proximate data — try the next candidate

    const outcome = gramsForCandidate(
      candidate.match.fdcId,
      parsed.unitText,
      quantity,
      hasExplicitQuantity,
    );
    if (outcome.grams === null) {
      // A real ingredient match, but no way to responsibly convert its
      // quantity to grams — remember it so we can at least report which
      // ingredient it matched, but keep looking in case a later candidate
      // (e.g. one with a matching USDA portion) can actually be converted.
      if (!bestUnusable) {
        bestUnusable = {
          match: candidate.match,
          confidence: candidate.confidence,
          needsQuantity: outcome.needsQuantity,
          suggestedUnit: outcome.suggestedUnit ?? "g",
        };
      }
      continue;
    }

    const factor = outcome.grams / 100;
    return {
      raw: rawLine,
      matched: candidate.match,
      matchConfidence: candidate.confidence,
      grams: outcome.grams,
      gramsSource: outcome.source,
      needsQuantity: false,
      suggestedUnit: "g",
      macros: {
        calories: per100g.calories * factor,
        protein: per100g.protein * factor,
        carbs: per100g.carbs * factor,
        fat: per100g.fat * factor,
      },
      micros: scaleMicros(getMicrosPer100g(candidate.match.fdcId), outcome.grams),
      variantOptions: family ? variantOptionsFrom(family, outcome.grams) : [],
    };
  }

  if (bestUnusable) {
    return {
      raw: rawLine,
      matched: bestUnusable.match,
      matchConfidence: bestUnusable.confidence,
      grams: null,
      gramsSource: "unresolved",
      needsQuantity: bestUnusable.needsQuantity,
      suggestedUnit: bestUnusable.suggestedUnit,
      macros: null,
      micros: null,
      variantOptions: [],
    };
  }

  return {
    raw: rawLine,
    matched: null,
    matchConfidence: "none",
    grams: null,
    gramsSource: "unresolved",
    needsQuantity: false,
    suggestedUnit: "g",
    macros: null,
    micros: null,
    variantOptions: [],
  };
}

export type RecipeMacroEstimate = {
  perServing: Macro | null;
  perServingMicros: MicroTotals;
  ingredientResults: IngredientMacroResult[];
};

// Resolves every ingredient line, sums them, and divides by servings to get
// a per-serving estimate. Ingredients that couldn't be matched or converted
// are simply excluded from the total (rather than failing the whole
// estimate) — ingredientResults lets the caller show which lines that was
// true for, so the numbers are shown as what they are: a partial estimate
// from what could be resolved, not a guarantee every ingredient counted.
export function estimateRecipeMacros(
  ingredients: string[],
  servings: number | null,
): RecipeMacroEstimate {
  const ingredientResults = ingredients.map(resolveIngredientMacros);
  const resolvedCount = ingredientResults.filter((r) => r.macros !== null).length;

  if (resolvedCount === 0) {
    return { perServing: null, perServingMicros: {}, ingredientResults };
  }

  const divisor = servings && servings > 0 ? servings : 1;
  const total = sumMacros(ingredientResults);
  const totalMicros = sumMicros(ingredientResults);
  const perServingMicros: MicroTotals = {};
  for (const [key, value] of Object.entries(totalMicros)) {
    perServingMicros[key] = value / divisor;
  }

  return {
    perServing: {
      calories: total.calories / divisor,
      protein: total.protein / divisor,
      carbs: total.carbs / divisor,
      fat: total.fat / divisor,
    },
    perServingMicros,
    ingredientResults,
  };
}

export type RecipeMacroEstimateApi = {
  estimatedNutrition: NutritionMacro | null;
  estimatedMicros: MicroTotals;
  ingredientDetails: IngredientMacroDetail[];
};

// Same as estimateRecipeMacros, shaped for the API response — using the
// exported (not internal) result types.
export function estimateRecipeMacrosForApi(
  ingredients: string[],
  servings: number | null,
): RecipeMacroEstimateApi {
  const { perServing, perServingMicros, ingredientResults } = estimateRecipeMacros(
    ingredients,
    servings,
  );

  const ingredientDetails: IngredientMacroDetail[] = ingredientResults.map((r) => ({
    raw: r.raw,
    fdcId: r.matched?.fdcId ?? null,
    matchedDescription: r.matched?.description ?? null,
    matchSource: r.matched?.source ?? null,
    matchConfidence: r.matchConfidence,
    grams: r.grams,
    gramsSource: r.gramsSource,
    macros: r.macros,
    micros: r.micros,
    needsQuantity: r.needsQuantity,
    suggestedUnit: r.suggestedUnit,
    variantOptions: r.variantOptions,
  }));

  return {
    estimatedNutrition: perServing,
    estimatedMicros: perServingMicros,
    ingredientDetails,
  };
}

// Used by /api/recompute-ingredient: given a food already identified by its
// USDA id and a user-supplied quantity + unit (from a controlled dropdown,
// so never a vague container word), compute that ingredient's absolute
// macro contribution.
export function resolveKnownFoodMacros(
  fdcId: number,
  quantity: number,
  unitText: string | null,
): { grams: number; macros: Macro; micros: MicroTotals } | { error: string } {
  const per100g = getMacrosPer100g(fdcId);
  if (!per100g) return { error: "This food doesn't have usable nutrition data." };

  const outcome = gramsForCandidate(fdcId, unitText, quantity, true);
  if (outcome.grams === null) {
    return { error: "Couldn't convert that amount — try a different unit (grams or ounces always work)." };
  }

  const factor = outcome.grams / 100;
  return {
    grams: outcome.grams,
    macros: {
      calories: per100g.calories * factor,
      protein: per100g.protein * factor,
      carbs: per100g.carbs * factor,
      fat: per100g.fat * factor,
    },
    micros: scaleMicros(getMicrosPer100g(fdcId), outcome.grams),
  };
}

export function sumMicros(results: IngredientMacroResult[]): MicroTotals {
  const total: MicroTotals = {};
  for (const r of results) {
    if (!r.micros) continue;
    for (const [key, value] of Object.entries(r.micros)) {
      total[key] = (total[key] ?? 0) + value;
    }
  }
  return total;
}

export function sumMacros(results: IngredientMacroResult[]): Macro {
  return results.reduce<Macro>(
    (acc, r) => {
      if (!r.macros) return acc;
      return {
        calories: acc.calories + r.macros.calories,
        protein: acc.protein + r.macros.protein,
        carbs: acc.carbs + r.macros.carbs,
        fat: acc.fat + r.macros.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
