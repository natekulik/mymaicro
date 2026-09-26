"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  addSubsection as addSubsectionToPlan,
  loadWeeklyPlan,
  pasteToAllDays as pasteToAllDaysInPlan,
  removeMeal as removeMealFromPlan,
  removeSubsection as removeSubsectionFromPlan,
  saveWeeklyPlan,
  type DayPlan,
  type WeeklyPlan as WeeklyPlanData,
} from "@/lib/weekly-plan";
import { loadSavedRecipes, type SavedRecipe } from "@/lib/saved-recipes";
import { loadProfile } from "@/lib/storage";
import { DEFAULT_MACRO_COLORS, type MacroColors } from "@/lib/macro";

type DayTotals = { calories: number; protein: number; carbs: number; fat: number } | null;

// Sums the per-serving nutrition of every recipe planned for a day — null
// (rather than all-zero) when nothing's planned yet, so the pill can show
// "—" instead of a misleading "0 cals".
function dayTotals(day: DayPlan, recipes: SavedRecipe[]): DayTotals {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let any = false;
  for (const meal of day.meals) {
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

export default function WeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlanData | null>(null);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  // Same macro colors the user picked on Daily Macros ("Choose colors"),
  // so protein/carbs/fat read consistently across both pages.
  const [macroColors, setMacroColors] = useState<MacroColors>(DEFAULT_MACRO_COLORS);
  // Which day's subsections are expanded below the day strip — clicking a
  // day pill toggles it open/closed; only one day is open at a time.
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Two-click confirm for the destructive "paste to all days" action — a
  // first click arms that day, a second click on the *same* day executes
  // it; clicking a different day's paste button just re-arms that one
  // instead, so nothing ever pastes by accident.
  const [pasteArmedDay, setPasteArmedDay] = useState<string | null>(null);

  useEffect(() => {
    setPlan(loadWeeklyPlan());
    setRecipes(loadSavedRecipes());
    setMacroColors(loadProfile()?.macroColors ?? DEFAULT_MACRO_COLORS);
  }, []);

  useEffect(() => {
    if (plan) saveWeeklyPlan(plan);
  }, [plan]);

  function handlePasteClick(day: string) {
    if (pasteArmedDay === day) {
      setPlan((prev) => (prev ? pasteToAllDaysInPlan(prev, day) : prev));
      setPasteArmedDay(null);
    } else {
      setPasteArmedDay(day);
    }
  }

  if (!plan) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading your weekly plan…
      </div>
    );
  }

  const openDayPlan = plan.days.find((d) => d.day === openDay) ?? null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Weekly plan
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Plan out what you&apos;re eating each day. Add recipes to a day and subsection from{" "}
          <span className="font-medium text-zinc-600 dark:text-zinc-300">My Recipes</span>, then
          click a day below to see or edit it.
        </p>
      </header>

      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {plan.days.map((day) => {
          const totals = dayTotals(day, recipes);
          const isOpen = openDay === day.day;
          return (
            <button
              key={day.day}
              type="button"
              onClick={() => setOpenDay(isOpen ? null : day.day)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition ${
                isOpen
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              }`}
            >
              <span className="text-sm font-bold">{day.day.slice(0, 3)}</span>
              <span className={`text-xs font-bold ${totals ? "" : isOpen ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-400"}`}>
                {totals ? `${Math.round(totals.calories)} cals` : "—"}
              </span>
              {totals && (
                <span className="whitespace-nowrap text-[10px] font-semibold">
                  <span style={{ color: macroColors.protein }}>{Math.round(totals.protein)}p</span>
                  <span className={isOpen ? "text-zinc-400" : "text-zinc-300 dark:text-zinc-600"}> · </span>
                  <span style={{ color: macroColors.carbs }}>{Math.round(totals.carbs)}c</span>
                  <span className={isOpen ? "text-zinc-400" : "text-zinc-300 dark:text-zinc-600"}> · </span>
                  <span style={{ color: macroColors.fat }}>{Math.round(totals.fat)}f</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {openDayPlan && (
        <DayDetail
          day={openDayPlan}
          recipes={recipes}
          pasteArmed={pasteArmedDay === openDayPlan.day}
          onClose={() => setOpenDay(null)}
          onPasteClick={() => handlePasteClick(openDayPlan.day)}
          onAddSubsection={(name) =>
            setPlan((prev) => (prev ? addSubsectionToPlan(prev, openDayPlan.day, name) : prev))
          }
          onRemoveSubsection={(subsection) =>
            setPlan((prev) => (prev ? removeSubsectionFromPlan(prev, openDayPlan.day, subsection) : prev))
          }
          onRemoveMeal={(mealId) =>
            setPlan((prev) => (prev ? removeMealFromPlan(prev, openDayPlan.day, mealId) : prev))
          }
        />
      )}
    </div>
  );
}

function DayDetail({
  day,
  recipes,
  pasteArmed,
  onClose,
  onPasteClick,
  onAddSubsection,
  onRemoveSubsection,
  onRemoveMeal,
}: {
  day: DayPlan;
  recipes: SavedRecipe[];
  pasteArmed: boolean;
  onClose: () => void;
  onPasteClick: () => void;
  onAddSubsection: (name: string) => void;
  onRemoveSubsection: (subsection: string) => void;
  onRemoveMeal: (mealId: string) => void;
}) {
  const [newSubsection, setNewSubsection] = useState("");

  function handleAddSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newSubsection.trim()) return;
    onAddSubsection(newSubsection);
    setNewSubsection("");
  }

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{day.day}</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onPasteClick}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              pasteArmed
                ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {pasteArmed ? "Click again to confirm" : "Paste to all days"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {day.subsections.map((subsection) => {
          const meals = day.meals.filter((m) => m.subsection === subsection);
          return (
            <div
              key={subsection}
              className="flex flex-col gap-1.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {subsection}
                </h3>
                <button
                  type="button"
                  onClick={() => onRemoveSubsection(subsection)}
                  className="text-xs text-zinc-400 transition hover:text-rose-500"
                >
                  Remove
                </button>
              </div>
              {meals.length === 0 ? (
                <p className="text-xs text-zinc-400">Nothing planned yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {meals.map((meal) => {
                    const recipe = recipes.find((r) => r.id === meal.recipeId);
                    return (
                      <li
                        key={meal.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300"
                      >
                        <span className="truncate">
                          {recipe ? recipe.title : "Recipe no longer available"}
                          {recipe && recipe.nutrition.calories != null && (
                            <span className="ml-1.5 text-zinc-400">
                              {Math.round(recipe.nutrition.calories)} cals
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveMeal(meal.id)}
                          className="shrink-0 text-zinc-400 transition hover:text-rose-500"
                        >
                          ×
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <form onSubmit={handleAddSubmit} className="flex items-center gap-1.5">
        <input
          type="text"
          placeholder="Add a meal (e.g. Post-workout)"
          value={newSubsection}
          onChange={(e) => setNewSubsection(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-zinc-600"
        />
        <button
          type="submit"
          className="whitespace-nowrap rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + Add meal
        </button>
      </form>
    </section>
  );
}
