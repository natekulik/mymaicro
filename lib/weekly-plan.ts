// Local persistence for the weekly meal plan. Two layers, same
// template + override pattern as lib/history.ts:
//   - `WeeklyPlan` (defaultWeeklyPlan/loadWeeklyPlan/saveWeeklyPlan) is the
//     one recurring *default template* — what a brand-new, never-customized
//     week starts from.
//   - `WeekOverrides` holds each individual calendar week's own days, once
//     the user has actually edited that week — from then on that week is
//     independent of the template and of every other week.
// Mutations are exposed as pure functions over a single week's `DayPlan[]`
// (plan in, plan out) so Weekly Plan, My Recipes, and Historical Plan can
// all share the exact same add/remove/paste logic.

import type { SavedRecipe } from "./saved-recipes";

export type PlannedMeal = {
  id: string;
  recipeId: string;
  subsection: string;
};

export type DayPlan = {
  day: string;
  subsections: string[];
  meals: PlannedMeal[];
  // Which Daily Macros preset (lib/macro-presets.ts) this day's goals should
  // be measured against — null means "whatever's currently active on Daily
  // Macros" (the default, and the only option before this existed).
  macroPresetId: string | null;
};

export type WeeklyPlan = {
  days: DayPlan[];
};

export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DEFAULT_SUBSECTIONS = ["Breakfast", "Lunch", "Snack", "Dinner"];

const TEMPLATE_STORAGE_KEY = "mymaicro:weeklyPlan:v1";
const WEEK_OVERRIDES_STORAGE_KEY = "mymaicro:weeklyPlanWeeks:v1";

export function defaultWeeklyPlan(): WeeklyPlan {
  return {
    days: DAY_NAMES.map((day) => ({
      day,
      subsections: [...DEFAULT_SUBSECTIONS],
      meals: [],
      macroPresetId: null,
    })),
  };
}

// Days saved before macro presets existed won't have this field — fill it
// in rather than let every reader handle `undefined`.
function normalizeDay(day: DayPlan): DayPlan {
  return { ...day, macroPresetId: day.macroPresetId ?? null };
}

export function loadWeeklyPlan(): WeeklyPlan {
  if (typeof window === "undefined") return defaultWeeklyPlan();
  try {
    const raw = window.localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (!raw) return defaultWeeklyPlan();
    const parsed = JSON.parse(raw) as WeeklyPlan;
    if (!Array.isArray(parsed?.days) || parsed.days.length === 0) return defaultWeeklyPlan();
    return { days: parsed.days.map(normalizeDay) };
  } catch {
    return defaultWeeklyPlan();
  }
}

export function saveWeeklyPlan(plan: WeeklyPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Storage can fail (quota, private browsing) — losing autosave isn't
    // worth crashing the page over.
  }
}

// Keyed by that week's Monday, "YYYY-MM-DD" (see lib/history.ts's
// mondayOfDate) — only weeks the user has actually customized are stored
// here at all.
export type WeekOverrides = Record<string, DayPlan[]>;

export function loadWeekOverrides(): WeekOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(WEEK_OVERRIDES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WeekOverrides;
    if (!parsed || typeof parsed !== "object") return {};
    const normalized: WeekOverrides = {};
    for (const [weekStart, days] of Object.entries(parsed)) {
      normalized[weekStart] = days.map(normalizeDay);
    }
    return normalized;
  } catch {
    return {};
  }
}

export function saveWeekOverrides(overrides: WeekOverrides): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WEEK_OVERRIDES_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Storage can fail (quota, private browsing) — losing autosave isn't
    // worth crashing the page over.
  }
}

function cloneDays(days: DayPlan[]): DayPlan[] {
  return days.map((d) => ({
    ...d,
    subsections: [...d.subsections],
    meals: d.meals.map((m) => ({ ...m })),
    macroPresetId: d.macroPresetId ?? null,
  }));
}

// The days to show/edit for a given week — that week's own override if it's
// been customized, otherwise a fresh copy of the default template (never
// the template's own array, so editing the result can't mutate it).
export function resolveWeekDays(weekStart: string, template: WeeklyPlan, overrides: WeekOverrides): DayPlan[] {
  const override = overrides[weekStart];
  if (override) return override;
  return cloneDays(template.days);
}

let idCounter = 0;
function newMealId(): string {
  idCounter += 1;
  return `planned-${Date.now()}-${idCounter}`;
}

function hasMeal(day: DayPlan, subsection: string, recipeId: string): boolean {
  return day.meals.some((m) => m.subsection === subsection && m.recipeId === recipeId);
}

// A no-op if that recipe is already planned for this exact day + subsection
// — a recipe can only appear once per meal slot per day.
export function addMeal(days: DayPlan[], day: string, subsection: string, recipeId: string): DayPlan[] {
  return days.map((d) =>
    d.day === day && !hasMeal(d, subsection, recipeId)
      ? { ...d, meals: [...d.meals, { id: newMealId(), recipeId, subsection }] }
      : d,
  );
}

// Adds the recipe to the given subsection on every day (of this one week)
// that actually has that subsection — skipping a day entirely if it
// doesn't have this subsection (nothing to attach the meal to) or already
// has this recipe there (same one-per-slot rule as addMeal).
export function addMealToAllDays(days: DayPlan[], subsection: string, recipeId: string): DayPlan[] {
  return days.map((d) =>
    d.subsections.includes(subsection) && !hasMeal(d, subsection, recipeId)
      ? { ...d, meals: [...d.meals, { id: newMealId(), recipeId, subsection }] }
      : d,
  );
}

export function removeMeal(days: DayPlan[], day: string, mealId: string): DayPlan[] {
  return days.map((d) => (d.day === day ? { ...d, meals: d.meals.filter((m) => m.id !== mealId) } : d));
}

export function addSubsection(days: DayPlan[], day: string, name: string): DayPlan[] {
  const trimmed = name.trim();
  if (!trimmed) return days;
  return days.map((d) =>
    d.day === day && !d.subsections.includes(trimmed)
      ? { ...d, subsections: [...d.subsections, trimmed] }
      : d,
  );
}

// Removing a subsection also drops any meals already planned under it —
// there's nowhere left for them to belong.
export function removeSubsection(days: DayPlan[], day: string, subsection: string): DayPlan[] {
  return days.map((d) =>
    d.day === day
      ? {
          ...d,
          subsections: d.subsections.filter((s) => s !== subsection),
          meals: d.meals.filter((m) => m.subsection !== subsection),
        }
      : d,
  );
}

// Which Daily Macros preset (or null for "whatever's active there") a
// single day's goals should be measured against.
export function setDayMacroPreset(days: DayPlan[], day: string, macroPresetId: string | null): DayPlan[] {
  return days.map((d) => (d.day === day ? { ...d, macroPresetId } : d));
}

// Overwrites every other day (of this one week) with the source day's
// subsections + meals + macro preset selection — meals get fresh ids so
// removing a pasted copy later never collides with the source day's own
// entries.
export function pasteToAllDays(days: DayPlan[], sourceDay: string): DayPlan[] {
  const source = days.find((d) => d.day === sourceDay);
  if (!source) return days;
  return days.map((d) =>
    d.day === sourceDay
      ? d
      : {
          day: d.day,
          subsections: [...source.subsections],
          meals: source.meals.map((m) => ({ ...m, id: newMealId() })),
          macroPresetId: source.macroPresetId,
        },
  );
}

// A named, reusable snapshot of a full week — "Add Weekly Preset" on
// Weekly Plan saves whatever's filled out for the currently-viewed week
// under a name the user chooses; "My Presets" then lets that snapshot be
// dropped onto any week later via applyPreset.
export type WeeklyPreset = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  days: DayPlan[];
};

const PRESETS_STORAGE_KEY = "mymaicro:weeklyPresets:v1";

export function loadWeeklyPresets(): WeeklyPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WeeklyPreset[]) : [];
  } catch {
    return [];
  }
}

function persistPresets(presets: WeeklyPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage can fail (quota, private browsing) — losing a save isn't
    // worth crashing the page over.
  }
}

export function saveWeeklyPreset(name: string, days: DayPlan[]): WeeklyPreset {
  const preset: WeeklyPreset = {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    days: cloneDays(days),
  };
  persistPresets([preset, ...loadWeeklyPresets()]);
  return preset;
}

export function removeWeeklyPreset(id: string): void {
  persistPresets(loadWeeklyPresets().filter((p) => p.id !== id));
}

// The days to drop onto a week when applying a preset — a fresh copy with
// new meal ids, so editing the applied copy later (or applying the same
// preset a second time) never collides with the preset's own stored copy.
export function applyPreset(preset: WeeklyPreset): DayPlan[] {
  return preset.days.map((d) => ({
    day: d.day,
    subsections: [...d.subsections],
    meals: d.meals.map((m) => ({ ...m, id: newMealId() })),
    macroPresetId: d.macroPresetId ?? null,
  }));
}

export type DayTotals = { calories: number; protein: number; carbs: number; fat: number } | null;

// Sums the per-serving nutrition of a set of planned meals against the
// saved recipes they point to — null (rather than all-zero) when none of
// them resolve to anything, so callers can show "—" instead of a
// misleading "0 cals". Shared by Weekly Plan's whole-day and per-subsection
// totals and by Historical Plan's per-date totals.
export function sumPlannedMeals(meals: PlannedMeal[], recipes: SavedRecipe[]): DayTotals {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let any = false;
  for (const meal of meals) {
    const recipe = recipes.find((r) => r.id === meal.recipeId);
    if (!recipe) continue;
    any = true;
    calories += recipe.nutrition.calories ?? 0;
    protein += recipe.nutrition.protein ?? 0;
    carbs += recipe.nutrition.carbs ?? 0;
    fat += recipe.nutrition.fat ?? 0;
  }
  return any ? { calories, protein, carbs, fat } : null;
}

export function dayTotals(day: DayPlan, recipes: SavedRecipe[]): DayTotals {
  return sumPlannedMeals(day.meals, recipes);
}
