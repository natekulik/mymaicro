// Supabase-backed persistence for the weekly meal plan. Two layers, same
// template + override pattern as lib/history.ts:
//   - `WeeklyPlan` (defaultWeeklyPlan/loadWeeklyPlan/saveWeeklyPlan) is the
//     one recurring *default template* — what a brand-new, never-customized
//     week starts from. One JSONB row per user (weekly_plan_templates).
//   - `WeekOverrides` holds each individual calendar week's own days, once
//     the user has actually edited that week — from then on that week is
//     independent of the template and of every other week. One JSONB row
//     per user (weekly_plan_week_overrides).
// Mutations are exposed as pure functions over a single week's `DayPlan[]`
// (plan in, plan out) so Weekly Plan, My Recipes, and Historical Plan can
// all share the exact same add/remove/paste logic — none of that touches
// storage, so it's unchanged from before accounts existed.

import { createClient } from "./supabase/client";
import { assertNoError, requireUserId } from "./supabase/user";
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

const LEGACY_TEMPLATE_KEY = "mymaicro:weeklyPlan:v1";
const LEGACY_WEEK_OVERRIDES_KEY = "mymaicro:weeklyPlanWeeks:v1";
const LEGACY_PRESETS_KEY = "mymaicro:weeklyPresets:v1";

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

function loadLegacyWeeklyPlan(): WeeklyPlan | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_TEMPLATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyPlan;
    if (!Array.isArray(parsed?.days) || parsed.days.length === 0) return null;
    return { days: parsed.days.map(normalizeDay) };
  } catch {
    return null;
  }
}

export async function loadWeeklyPlan(): Promise<WeeklyPlan> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("weekly_plan_templates")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  assertNoError(error);
  if (data) {
    const plan = data.data as WeeklyPlan;
    return { days: plan.days.map(normalizeDay) };
  }

  const initial = loadLegacyWeeklyPlan() ?? defaultWeeklyPlan();
  await saveWeeklyPlan(initial);
  return initial;
}

export async function saveWeeklyPlan(plan: WeeklyPlan): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase
    .from("weekly_plan_templates")
    .upsert({ user_id: userId, data: plan, updated_at: new Date().toISOString() });
  assertNoError(error);
}

// Keyed by that week's Monday, "YYYY-MM-DD" (see lib/history.ts's
// mondayOfDate) — only weeks the user has actually customized are stored
// here at all.
export type WeekOverrides = Record<string, DayPlan[]>;

function loadLegacyWeekOverrides(): WeekOverrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_WEEK_OVERRIDES_KEY);
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

export async function loadWeekOverrides(): Promise<WeekOverrides> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("weekly_plan_week_overrides")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  assertNoError(error);
  if (data) {
    const raw = data.data as WeekOverrides;
    const normalized: WeekOverrides = {};
    for (const [weekStart, days] of Object.entries(raw)) {
      normalized[weekStart] = days.map(normalizeDay);
    }
    return normalized;
  }

  const legacy = loadLegacyWeekOverrides();
  if (Object.keys(legacy).length > 0) await saveWeekOverrides(legacy);
  return legacy;
}

export async function saveWeekOverrides(overrides: WeekOverrides): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase
    .from("weekly_plan_week_overrides")
    .upsert({ user_id: userId, data: overrides, updated_at: new Date().toISOString() });
  assertNoError(error);
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
// under a name the user chooses; "My Weekly Presets" then lets that
// snapshot be dropped onto any week later via applyPreset.
export type WeeklyPreset = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  days: DayPlan[];
};

function loadLegacyWeeklyPresets(): WeeklyPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_PRESETS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WeeklyPreset[]) : [];
  } catch {
    return [];
  }
}

type PresetRow = { id: string; name: string; created_at: string; days: DayPlan[] };

function fromPresetRow(row: PresetRow): WeeklyPreset {
  return { id: row.id, name: row.name, createdAt: row.created_at, days: row.days.map(normalizeDay) };
}

export async function loadWeeklyPresets(): Promise<WeeklyPreset[]> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("weekly_presets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  assertNoError(error);

  if (data && data.length > 0) return (data as PresetRow[]).map(fromPresetRow);

  const legacy = loadLegacyWeeklyPresets();
  if (legacy.length > 0) {
    const { error: seedError } = await supabase
      .from("weekly_presets")
      .insert(legacy.map((p) => ({ id: p.id, user_id: userId, name: p.name, created_at: p.createdAt, days: p.days })));
    assertNoError(seedError);
  }
  return legacy;
}

export async function saveWeeklyPreset(name: string, days: DayPlan[]): Promise<WeeklyPreset> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const preset: WeeklyPreset = {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    days: cloneDays(days),
  };
  const { error } = await supabase
    .from("weekly_presets")
    .insert({ id: preset.id, user_id: userId, name: preset.name, created_at: preset.createdAt, days: preset.days });
  assertNoError(error);
  return preset;
}

export async function removeWeeklyPreset(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase.from("weekly_presets").delete().eq("id", id).eq("user_id", userId);
  assertNoError(error);
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
