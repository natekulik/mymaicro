// Local persistence for the weekly meal plan — same pattern as
// lib/storage.ts (the Daily Macros profile) and lib/saved-recipes.ts.
// Plan mutations are exposed as pure functions (plan in, plan out) so both
// the Weekly Plan tab and the My Recipes tab can share the exact same
// add/remove/paste logic instead of reimplementing it twice.

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

const STORAGE_KEY = "mymaicro:weeklyPlan:v1";

export function defaultWeeklyPlan(): WeeklyPlan {
  return {
    days: DAY_NAMES.map((day) => ({ day, subsections: [...DEFAULT_SUBSECTIONS], meals: [] })),
  };
}

export function loadWeeklyPlan(): WeeklyPlan {
  if (typeof window === "undefined") return defaultWeeklyPlan();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWeeklyPlan();
    const parsed = JSON.parse(raw) as WeeklyPlan;
    if (!Array.isArray(parsed?.days) || parsed.days.length === 0) return defaultWeeklyPlan();
    return parsed;
  } catch {
    return defaultWeeklyPlan();
  }
}

export function saveWeeklyPlan(plan: WeeklyPlan): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {
    // Storage can fail (quota, private browsing) — losing autosave isn't
    // worth crashing the page over.
  }
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
export function addMeal(plan: WeeklyPlan, day: string, subsection: string, recipeId: string): WeeklyPlan {
  return {
    days: plan.days.map((d) =>
      d.day === day && !hasMeal(d, subsection, recipeId)
        ? { ...d, meals: [...d.meals, { id: newMealId(), recipeId, subsection }] }
        : d,
    ),
  };
}

// Adds the recipe to the given subsection on every day that actually has
// that subsection — skipping a day entirely if it doesn't have this
// subsection (nothing to attach the meal to) or already has this recipe
// there (same one-per-slot rule as addMeal, just applied per day).
export function addMealToAllDays(plan: WeeklyPlan, subsection: string, recipeId: string): WeeklyPlan {
  return {
    days: plan.days.map((d) =>
      d.subsections.includes(subsection) && !hasMeal(d, subsection, recipeId)
        ? { ...d, meals: [...d.meals, { id: newMealId(), recipeId, subsection }] }
        : d,
    ),
  };
}

export function removeMeal(plan: WeeklyPlan, day: string, mealId: string): WeeklyPlan {
  return {
    days: plan.days.map((d) =>
      d.day === day ? { ...d, meals: d.meals.filter((m) => m.id !== mealId) } : d,
    ),
  };
}

export function addSubsection(plan: WeeklyPlan, day: string, name: string): WeeklyPlan {
  const trimmed = name.trim();
  if (!trimmed) return plan;
  return {
    days: plan.days.map((d) =>
      d.day === day && !d.subsections.includes(trimmed)
        ? { ...d, subsections: [...d.subsections, trimmed] }
        : d,
    ),
  };
}

// Removing a subsection also drops any meals already planned under it —
// there's nowhere left for them to belong.
export function removeSubsection(plan: WeeklyPlan, day: string, subsection: string): WeeklyPlan {
  return {
    days: plan.days.map((d) =>
      d.day === day
        ? {
            ...d,
            subsections: d.subsections.filter((s) => s !== subsection),
            meals: d.meals.filter((m) => m.subsection !== subsection),
          }
        : d,
    ),
  };
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

// Overwrites every other day's subsections + meals with the source day's —
// meals get fresh ids so removing a pasted copy later never collides with
// the source day's own entries.
export function pasteToAllDays(plan: WeeklyPlan, sourceDay: string): WeeklyPlan {
  const source = plan.days.find((d) => d.day === sourceDay);
  if (!source) return plan;
  return {
    days: plan.days.map((d) =>
      d.day === sourceDay
        ? d
        : {
            day: d.day,
            subsections: [...source.subsections],
            meals: source.meals.map((m) => ({ ...m, id: newMealId() })),
          },
    ),
  };
}
