// Shared between the two analyze-recipe API routes, the recompute-ingredient
// route, and the frontend.

import type { MicroTotals } from "./usda/micro-nutrients";

export type { MicroTotals };

export type NutritionMacro = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

// A sibling match with a meaningfully different macro profile ("80% lean /
// 20% fat" vs "96% lean / 4% fat" ground beef) — surfaced so the user can
// pick the right one instead of the app silently guessing. `macros` and
// `micros` are pre-scaled to the ingredient's actual grams, so the frontend
// can swap them straight into the running total with no extra math.
export type VariantOption = {
  fdcId: number;
  label: string;
  description: string;
  macros: NutritionMacro;
  micros: MicroTotals;
};

export type IngredientMacroDetail = {
  raw: string;
  fdcId: number | null;
  matchedDescription: string | null;
  matchSource: "foundation" | "sr_legacy" | "branded" | null;
  matchConfidence: "high" | "low" | "none";
  grams: number | null;
  gramsSource: "usda_portion" | "unit_conversion" | "unresolved";
  // This ingredient's own absolute macro/micro contribution (not divided
  // by servings) — lets the frontend recompute the per-serving total
  // locally whenever a variant or quantity override changes. `micros` is
  // sparse — a key is present only if this food actually has data for it.
  macros: NutritionMacro | null;
  micros: MicroTotals | null;
  // True when the amount is too vague to convert responsibly (a "jar" or
  // "can" — real sizes vary too much — or no quantity/unit given at all).
  needsQuantity: boolean;
  // Best default unit to pre-select in the "how much did you use?" prompt
  // — "oz" for container units (that's how jars/cans/bottles are actually
  // labeled), "g" otherwise.
  suggestedUnit: string;
  variantOptions: VariantOption[];
};

export type RecipeResult = {
  title: string;
  sourceUrl: string | null;
  servings: number | null;
  ingredients: string[];
  // As published by the recipe source (URL flow only — schema.org
  // nutrition data). Preferred over estimatedNutrition when present.
  nutrition: NutritionMacro | null;
  // A handful of micros schema.org/Recipe's nutrition block can carry
  // (sodium, cholesterol, fiber, sugar, saturated/trans fat) — only
  // populated alongside `nutrition`, and only for the keys the source
  // actually published.
  publishedMicros: MicroTotals | null;
  // Computed from the USDA ingredient database when the source doesn't
  // publish its own nutrition facts (or for manual entry, which never has
  // a source to publish anything).
  estimatedNutrition: NutritionMacro | null;
  estimatedMicros: MicroTotals;
  ingredientDetails: IngredientMacroDetail[];
};
