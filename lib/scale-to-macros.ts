// "Scale to my plan": given what's still unfilled in the day (or a meal),
// work out how much more of the ingredients the user picked are needed to
// fill it. Pure math + text helpers — no storage, no React.
//
// The model: each picked ingredient gets one multiplier (1 = unchanged, 2 =
// double). Every picked ingredient contributes some protein/carbs/fat per
// serving, so changing one nudges the others too (potatoes bring a little
// protein, avocado a little carbs) — which is why this solves all the
// picks together as one small system of equations rather than one macro at
// a time.

import type { Macro } from "./macro";
import type { IngredientMacroDetail, MicroTotals, NutritionMacro } from "./recipe-types";
import { parseIngredientLine } from "./usda/parse-ingredient";

export type MacroKey = keyof Macro;
export const SCALE_MACROS: MacroKey[] = ["protein", "carbs", "fat"];

// One pick: "use this ingredient to make up this macro".
export type ScalePick = { macro: MacroKey; ingredientIndex: number };

export type ScaleChange = {
  index: number;
  originalText: string;
  newText: string;
  // newQuantity / oldQuantity, after rounding the quantity for display —
  // the exact multiplier to apply to this ingredient's nutrition.
  factor: number;
};

// Whole-recipe nutrition of one ingredient, divided down to one serving.
function perServing(detail: IngredientMacroDetail, servings: number): Macro {
  return {
    protein: (detail.macros?.protein ?? 0) / servings,
    carbs: (detail.macros?.carbs ?? 0) / servings,
    fat: (detail.macros?.fat ?? 0) / servings,
  };
}

export function recipePerServing(details: IngredientMacroDetail[], servings: number): Macro & { calories: number } {
  const total = { protein: 0, carbs: 0, fat: 0, calories: 0 };
  for (const d of details) {
    total.protein += d.macros?.protein ?? 0;
    total.carbs += d.macros?.carbs ?? 0;
    total.fat += d.macros?.fat ?? 0;
    total.calories += d.macros?.calories ?? 0;
  }
  return {
    protein: total.protein / servings,
    carbs: total.carbs / servings,
    fat: total.fat / servings,
    calories: total.calories / servings,
  };
}

// An ingredient can only be scaled if it has a quantity to multiply and
// nutrition to scale along with it.
export function isScalable(detail: IngredientMacroDetail): boolean {
  if (!detail.macros || detail.needsQuantity) return false;
  // Nothing to gain from scaling salt, water, spices and the like.
  if ((detail.macros.protein ?? 0) + (detail.macros.carbs ?? 0) + (detail.macros.fat ?? 0) < 0.5) return false;
  const q = parseIngredientLine(detail.raw).quantity;
  return q !== null && q > 0;
}

// Gaussian elimination with partial pivoting for a small dense system.
function solveSquare(matrix: number[][], rhs: number[]): number[] {
  const n = rhs.length;
  const a = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const p = a[col][col];
    if (Math.abs(p) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col] / p;
      for (let c = col; c <= n; c++) a[r][c] -= f * a[col][c];
    }
  }
  return a.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

// Least-squares fit of x (one entry per picked ingredient: how much to ADD,
// as a fraction of its current amount) so that contrib · x ≈ delta, with no
// ingredient allowed below zero amount (x >= -1). With as many picks as
// macros that's an exact solve; with fewer ingredients than macros it's the
// closest fit. contrib[macro][ingredient] is per-serving grams of that
// macro from that ingredient at its current amount.
export function solveScale(contrib: number[][], delta: number[]): number[] {
  const nVars = contrib[0]?.length ?? 0;
  const x = new Array<number>(nVars).fill(0);
  const fixed = new Array<boolean>(nVars).fill(false);

  for (let pass = 0; pass <= nVars; pass++) {
    const free = x.map((_, j) => j).filter((j) => !fixed[j]);
    if (free.length === 0) break;
    const residual = delta.map((d, k) => d - contrib[k].reduce((s, c, j) => (fixed[j] ? s + c * x[j] : s), 0));
    const normal = free.map((a) =>
      free.map(
        (b) => contrib.reduce((s, row) => s + row[a] * row[b], 0) + (a === b ? 1e-9 : 0),
      ),
    );
    const rhs = free.map((a) => contrib.reduce((s, row, k) => s + row[a] * residual[k], 0));
    const sol = solveSquare(normal, rhs);
    free.forEach((j, i) => {
      x[j] = sol[i];
    });
    const tooLow = free.filter((j) => x[j] < -1);
    if (tooLow.length === 0) break;
    for (const j of tooLow) {
      x[j] = -1;
      fixed[j] = true;
    }
  }
  return x;
}

function formatQuantity(q: number): string {
  return String(Number(q.toFixed(2)));
}

function roundQuantity(q: number, unit: string | null): number {
  const u = unit?.toLowerCase() ?? "";
  if (u === "g" || u === "gram" || u === "grams" || u === "ml" || u === "milliliter" || u === "milliliters") {
    return q >= 10 ? Math.round(q) : Number(q.toFixed(1));
  }
  return Number(q.toFixed(2));
}

// Millilitres per one of the volume units a recipe line can use.
const VOLUME_UNIT_ML: Record<string, number> = {
  cup: 236.588,
  cups: 236.588,
  tablespoon: 14.787,
  tablespoons: 14.787,
  tbsp: 14.787,
  teaspoon: 4.929,
  teaspoons: 4.929,
  tsp: 4.929,
  milliliter: 1,
  milliliters: 1,
  ml: 1,
  liter: 1000,
  liters: 1000,
  l: 1000,
};

// Whether an ingredient is a liquid that's better shown in millilitres than
// grams. Judged from the matched USDA food's name (its first comma segment,
// so "Oil, olive" counts but "Fish, tuna, canned in oil" doesn't), or from
// the recipe line itself using a metric volume unit.
function isLiquid(detail: IngredientMacroDetail, unit: string | null): boolean {
  const u = unit?.toLowerCase() ?? "";
  if (u === "ml" || u === "milliliter" || u === "milliliters" || u === "l" || u === "liter" || u === "liters") return true;
  const description = (detail.matchedDescription ?? "").toLowerCase();
  const first = description.split(",")[0].trim();
  if (/\b(chocolate|bar|cheese|powder|dried|candy|candies|cookie|cake|bread|pudding|ice cream|yogurt|chip|chips|jerky)\b/.test(first)) {
    return false;
  }
  if (/\b(milk|juice|broth|stock|water|vinegar|wine|beer|coffee|tea|buttermilk|kefir|soda|cider|bouillon|soup|beverage|beverages|extract)\b/.test(first)) {
    return true;
  }
  if (/^(?!.* in ).*\boil$/.test(first)) return true;
  return /cream, fluid|whipping cream|heavy cream|half and half/.test(description);
}

// Millilitres per gram for a liquid — taken from the recipe line's own
// volume unit when it has one ("1 cup milk" = 244 g = 236.6 ml), otherwise
// close to water (oils are a bit lighter).
function mlPerGram(detail: IngredientMacroDetail, quantity: number, unit: string | null): number {
  const unitMl = VOLUME_UNIT_ML[unit?.toLowerCase() ?? ""];
  if (unitMl && detail.grams && detail.grams > 0) return (quantity * unitMl) / detail.grams;
  const first = (detail.matchedDescription ?? "").toLowerCase().split(",")[0];
  return /\boil\b/.test(first) ? 1 / 0.92 : 1;
}

// Drops size words so "medium potato, diced" reads "potato, diced" once the
// amount is given in grams instead.
function tidyName(name: string): string {
  const [head, ...rest] = name.split(",");
  const cleaned = head.replace(/\b(small|medium|large)\b/gi, "").replace(/\s+/g, " ").trim();
  return [cleaned || head.trim(), ...rest.map((r) => r.trim())].join(", ");
}

// Rewrites an ingredient line for a scaled amount. Ingredients with a known
// weight are written in grams — or millilitres for liquids — e.g. "1 medium
// potato" x 2.3 -> "398 g potato"; anything without one keeps its own unit
// with the quantity multiplied. The returned factor is the one actually
// applied after rounding the displayed amount, so the nutrition scaled by it
// matches the text the user sees. Null if there's nothing to scale.
export function scaleIngredientText(
  detail: IngredientMacroDetail,
  factor: number,
): { text: string; factor: number } | null {
  const parsed = parseIngredientLine(detail.raw);
  if (parsed.quantity === null || parsed.quantity <= 0) return null;

  if (detail.grams && detail.grams > 0) {
    const newGrams = detail.grams * factor;
    const name = tidyName(parsed.name);
    if (isLiquid(detail, parsed.unitText)) {
      const newMl = roundQuantity(newGrams * mlPerGram(detail, parsed.quantity, parsed.unitText), "ml");
      if (newMl <= 0) return null;
      const oldMl = detail.grams * mlPerGram(detail, parsed.quantity, parsed.unitText);
      return { text: `${formatQuantity(newMl)} ml ${name}`, factor: newMl / oldMl };
    }
    const rounded = roundQuantity(newGrams, "g");
    if (rounded <= 0) return null;
    return { text: `${formatQuantity(rounded)} g ${name}`, factor: rounded / detail.grams };
  }

  const newQuantity = roundQuantity(parsed.quantity * factor, parsed.unitText);
  if (newQuantity <= 0) return null;
  const text = [formatQuantity(newQuantity), parsed.unitText, parsed.name].filter(Boolean).join(" ");
  return { text, factor: newQuantity / parsed.quantity };
}

export type ScalePreview = {
  changes: ScaleChange[];
  // The recipe's per-serving macros once those changes are in.
  after: Macro & { calories: number };
  // Picked ingredients that couldn't be scaled (no quantity to multiply).
  unscalable: number[];
};

// What scaling the picked ingredients would do, given how much each macro
// still needs to change by (`gap`, per serving: positive = needs more).
export function previewScale(
  details: IngredientMacroDetail[],
  servings: number,
  gap: Macro,
  picks: ScalePick[],
): ScalePreview {
  const current = recipePerServing(details, servings);
  const usable = picks.filter((p) => isScalable(details[p.ingredientIndex]));
  const unscalable = picks.filter((p) => !isScalable(details[p.ingredientIndex])).map((p) => p.ingredientIndex);

  const macros = Array.from(new Set(usable.map((p) => p.macro)));
  const ingredients = Array.from(new Set(usable.map((p) => p.ingredientIndex)));
  if (macros.length === 0 || ingredients.length === 0) {
    return { changes: [], after: current, unscalable };
  }

  const contrib = macros.map((m) => ingredients.map((i) => perServing(details[i], servings)[m]));
  const x = solveScale(
    contrib,
    macros.map((m) => gap[m]),
  );

  const changes: ScaleChange[] = [];
  const after = { ...current };
  ingredients.forEach((index, v) => {
    const wanted = Math.max(0, 1 + x[v]);
    const scaled = scaleIngredientText(details[index], wanted);
    // Rounding the quantity can land on "no change" — skip those.
    if (!scaled || Math.abs(scaled.factor - 1) < 1e-9) return;
    changes.push({ index, originalText: details[index].raw, newText: scaled.text, factor: scaled.factor });
    const own = perServing(details[index], servings);
    const calories = (details[index].macros?.calories ?? 0) / servings;
    after.protein += own.protein * (scaled.factor - 1);
    after.carbs += own.carbs * (scaled.factor - 1);
    after.fat += own.fat * (scaled.factor - 1);
    after.calories += calories * (scaled.factor - 1);
  });

  return { changes, after, unscalable };
}

// The recipe as it stands once `changes` are applied: its ingredient lines,
// and per-serving nutrition / micros recomputed from the scaled ingredients.
// Used to save a scaled copy of a recipe.
export function applyScaleToDetails(
  details: IngredientMacroDetail[],
  changes: ScaleChange[],
  servings: number,
): { ingredients: string[]; nutrition: NutritionMacro; micros: MicroTotals } {
  const byIndex = new Map(changes.map((c) => [c.index, c]));
  const total = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const micros: MicroTotals = {};

  const ingredients = details.map((d, i) => {
    const change = byIndex.get(i);
    const factor = change?.factor ?? 1;
    total.calories += (d.macros?.calories ?? 0) * factor;
    total.protein += (d.macros?.protein ?? 0) * factor;
    total.carbs += (d.macros?.carbs ?? 0) * factor;
    total.fat += (d.macros?.fat ?? 0) * factor;
    for (const [key, value] of Object.entries(d.micros ?? {})) {
      if (typeof value === "number") micros[key] = (micros[key] ?? 0) + value * factor;
    }
    return change?.newText ?? d.raw;
  });

  for (const key of Object.keys(micros)) micros[key] /= servings;
  return {
    ingredients,
    nutrition: {
      calories: total.calories / servings,
      protein: total.protein / servings,
      carbs: total.carbs / servings,
      fat: total.fat / servings,
    },
    micros,
  };
}
