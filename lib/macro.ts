// Core macro types + pure logic. Deliberately framework-agnostic and free of
// side effects so this same shape can move from localStorage (today) to a
// real Postgres-backed API later without changing the math.

export type Macro = {
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
};

export type MealSlot = {
  id: string;
  name: string;
  macros: Macro;
};

// User-customizable accent colors for the three macros, as raw CSS color
// values (not Tailwind classes) — a user can pick any color, and Tailwind's
// JIT compiler can only ever render classes it saw literally in source, so
// arbitrary picked colors have to be applied via inline style instead.
export type MacroColors = {
  protein: string;
  carbs: string;
  fat: string;
};

export const DEFAULT_MACRO_COLORS: MacroColors = {
  protein: "#f43f5e", // rose-500
  carbs: "#f59e0b", // amber-500
  fat: "#0ea5e9", // sky-500
};

export type MacroProfile = {
  dailyTarget: Macro;
  meals: MealSlot[];
  // Whether Daily Macros shows/uses per-meal targets at all — off means
  // the user only cares about the daily total, not how it's split across
  // meals. `meals` itself is left untouched while off, so turning this
  // back on restores whatever split was last set up rather than losing it.
  mealsEnabled: boolean;
  macroColors: MacroColors;
  // Optional calorie goal + lean body mass (lb) that drive the "grams per
  // lb of lean body mass" helpers on Daily Macros. Both are optional so
  // profiles saved before this existed load unchanged; a missing
  // calorieTarget just means "whatever the macros add up to".
  calorieTarget?: number | null;
  leanBodyMass?: number | null;
  // Whether the grams-per-lb calculator is shown (and active) on Daily
  // Macros; off by default.
  leanMassCalcEnabled?: boolean;
  // What the user typed into each "grams per lb of lean body mass" box —
  // only ever set by the user, never worked out from the gram targets. The
  // auto-filled macro has no entry.
  gramsPerLb?: Partial<Record<keyof Macro, number | null>>;
};

export function emptyMacro(): Macro {
  return { protein: 0, carbs: 0, fat: 0 };
}

export const MACRO_KEYS: (keyof Macro)[] = ["protein", "carbs", "fat"];
export const CALORIES_PER_GRAM: Record<keyof Macro, number> = { protein: 4, carbs: 4, fat: 9 };

// Sets `auto` to whatever grams make the day land on `targetCalories`,
// given the other two macros as they are. Never goes below 0 grams.
export function fillRemainingMacro(macros: Macro, auto: keyof Macro, targetCalories: number): Macro {
  const lockedCalories = lockedMacroCalories(macros, auto);
  const grams = Math.max(0, Math.round((targetCalories - lockedCalories) / CALORIES_PER_GRAM[auto]));
  return { ...macros, [auto]: grams };
}

// Calories from every macro except `auto`.
export function lockedMacroCalories(macros: Macro, auto: keyof Macro): number {
  return MACRO_KEYS.reduce((sum, key) => (key === auto ? sum : sum + macros[key] * CALORIES_PER_GRAM[key]), 0);
}

// Standard Atwater factors: 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat.
export function calories(m: Macro): number {
  return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);
}

export function sumMacros(meals: MealSlot[]): Macro {
  return meals.reduce<Macro>(
    (acc, meal) => ({
      protein: acc.protein + meal.macros.protein,
      carbs: acc.carbs + meal.macros.carbs,
      fat: acc.fat + meal.macros.fat,
    }),
    emptyMacro(),
  );
}

// Per-macro "does the day's meal total exactly hit the daily target" flag —
// "match" only for an exact hit, "mismatch" for either under OR over, since
// the target is precise rather than a range.
export type MatchStatus = "match" | "mismatch";
export type MacroMatchStatus = Record<keyof Macro, MatchStatus>;

export function macroMatchStatus(actual: Macro, target: Macro): MacroMatchStatus {
  const status = (a: number, t: number): MatchStatus => (a === t ? "match" : "mismatch");
  return {
    protein: status(actual.protein, target.protein),
    carbs: status(actual.carbs, target.carbs),
    fat: status(actual.fat, target.fat),
  };
}

let idCounter = 0;
export function newId(): string {
  idCounter += 1;
  return `meal-${Date.now()}-${idCounter}`;
}

const DEFAULT_MEAL_NAMES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack",
  "Snack 2",
  "Snack 3",
  "Snack 4",
  "Snack 5",
];

// Splits a daily target evenly across `count` meals. Any rounding remainder
// is assigned to the last meal so the meals always sum back to exactly the
// daily target.
export function splitEvenly(daily: Macro, count: number): MealSlot[] {
  const meals: MealSlot[] = [];
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    meals.push({
      id: newId(),
      name: DEFAULT_MEAL_NAMES[i] ?? `Meal ${i + 1}`,
      macros: {
        protein: portion(daily.protein, count, i, isLast),
        carbs: portion(daily.carbs, count, i, isLast),
        fat: portion(daily.fat, count, i, isLast),
      },
    });
  }
  return meals;
}

function portion(total: number, count: number, index: number, isLast: boolean): number {
  const base = Math.floor(total / count);
  if (!isLast) return base;
  return total - base * (count - 1);
}

export function defaultProfile(): MacroProfile {
  const dailyTarget: Macro = { protein: 150, carbs: 200, fat: 65 };
  return {
    dailyTarget,
    meals: splitEvenly(dailyTarget, 3),
    mealsEnabled: true,
    macroColors: { ...DEFAULT_MACRO_COLORS },
  };
}
