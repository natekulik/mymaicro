"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  addSubsection as addSubsectionToPlan,
  dayTotals,
  loadWeeklyPlan,
  pasteToAllDays as pasteToAllDaysInPlan,
  removeMeal as removeMealFromPlan,
  removeSubsection as removeSubsectionFromPlan,
  saveWeeklyPlan,
  sumPlannedMeals,
  type DayPlan,
  type DayTotals,
  type WeeklyPlan as WeeklyPlanData,
} from "@/lib/weekly-plan";
import { loadSavedRecipes, type SavedRecipe } from "@/lib/saved-recipes";
import { loadProfile } from "@/lib/storage";
import { DEFAULT_MACRO_COLORS, defaultProfile, type Macro, type MacroColors, type MealSlot } from "@/lib/macro";
import { dayNameForDate, todayDateString } from "@/lib/history";
import ProgressRow from "./ProgressRow";

export default function WeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlanData | null>(null);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  // Same macro colors the user picked on Daily Macros ("Choose colors"),
  // so protein/carbs/fat read consistently across both pages.
  const [macroColors, setMacroColors] = useState<MacroColors>(DEFAULT_MACRO_COLORS);
  // The same daily protein/carbs/fat target from Daily Macros — what the
  // per-day progress bars below measure a day's planned meals against.
  const [dailyTarget, setDailyTarget] = useState<Macro>(defaultProfile().dailyTarget);
  // Daily Macros' own named meal slots (Breakfast/Lunch/Dinner/...), each
  // with its own macro target — matched by name against a subsection here
  // so expanding e.g. "Breakfast" can compare against the same "Breakfast"
  // target set on Daily Macros.
  const [mealTargets, setMealTargets] = useState<MealSlot[]>(defaultProfile().meals);
  // Which day's subsections are expanded below the day strip — clicking a
  // day pill toggles it open/closed; only one day is open at a time.
  const [openDay, setOpenDay] = useState<string | null>(null);
  // Two-click confirm for the destructive "paste to all days" action — a
  // first click arms that day, a second click on the *same* day executes
  // it; clicking a different day's paste button just re-arms that one
  // instead, so nothing ever pastes by accident.
  const [pasteArmedDay, setPasteArmedDay] = useState<string | null>(null);
  // A one-level undo for "paste to all days" — the whole plan exactly as
  // it was the instant before that paste ran. Cleared the moment anything
  // else changes the plan (another paste, an add/remove), so Undo never
  // silently reverts edits made after it that the user might not expect it
  // to touch.
  const [pasteUndoSnapshot, setPasteUndoSnapshot] = useState<WeeklyPlanData | null>(null);
  // Which day-of-week name is "today" right now — drives the small "Today"
  // badge on the matching pill. Starts null (rather than guessing) since
  // the real date isn't known until the client mounts.
  const [todayName, setTodayName] = useState<string | null>(null);

  useEffect(() => {
    setPlan(loadWeeklyPlan());
    setRecipes(loadSavedRecipes());
    const profile = loadProfile();
    setMacroColors(profile?.macroColors ?? DEFAULT_MACRO_COLORS);
    setDailyTarget(profile?.dailyTarget ?? defaultProfile().dailyTarget);
    setMealTargets(profile?.meals ?? defaultProfile().meals);
    setTodayName(dayNameForDate(todayDateString()));
  }, []);

  useEffect(() => {
    if (plan) saveWeeklyPlan(plan);
  }, [plan]);

  function handlePasteClick(day: string) {
    if (pasteArmedDay === day) {
      setPlan((prev) => {
        if (!prev) return prev;
        setPasteUndoSnapshot(prev);
        return pasteToAllDaysInPlan(prev, day);
      });
      setPasteArmedDay(null);
    } else {
      setPasteArmedDay(day);
    }
  }

  function handleUndoPaste() {
    if (!pasteUndoSnapshot) return;
    setPlan(pasteUndoSnapshot);
    setPasteUndoSnapshot(null);
  }

  // Any plan edit other than the paste itself invalidates the paste undo —
  // wraps the mutation setters below so Undo can never revert edits made
  // after it that the user wouldn't expect it to touch.
  function mutatePlan(updater: (prev: WeeklyPlanData) => WeeklyPlanData) {
    setPlan((prev) => (prev ? updater(prev) : prev));
    setPasteUndoSnapshot(null);
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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
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

      <div className="grid grid-cols-4 gap-2 pt-3 sm:grid-cols-7">
        {plan.days.map((day) => {
          const totals = dayTotals(day, recipes);
          const isOpen = openDay === day.day;
          const isToday = todayName === day.day;
          return (
            <div key={day.day} className="relative">
              {isToday && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white shadow-sm">
                  Today
                </span>
              )}
              <button
                type="button"
                onClick={() => setOpenDay(isOpen ? null : day.day)}
                className={`flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition ${
                  isOpen
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                } ${isToday ? "ring-1 ring-orange-400" : ""}`}
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
            </div>
          );
        })}
      </div>

      {openDayPlan && (
        <DayDetail
          key={openDayPlan.day}
          day={openDayPlan}
          recipes={recipes}
          totals={dayTotals(openDayPlan, recipes)}
          dailyTarget={dailyTarget}
          mealTargets={mealTargets}
          macroColors={macroColors}
          pasteArmed={pasteArmedDay === openDayPlan.day}
          canUndoPaste={pasteUndoSnapshot !== null}
          onClose={() => setOpenDay(null)}
          onPasteClick={() => handlePasteClick(openDayPlan.day)}
          onUndoPaste={handleUndoPaste}
          onAddSubsection={(name) => mutatePlan((prev) => addSubsectionToPlan(prev, openDayPlan.day, name))}
          onRemoveSubsection={(subsection) =>
            mutatePlan((prev) => removeSubsectionFromPlan(prev, openDayPlan.day, subsection))
          }
          onRemoveMeal={(mealId) => mutatePlan((prev) => removeMealFromPlan(prev, openDayPlan.day, mealId))}
        />
      )}
    </div>
  );
}

function DayDetail({
  day,
  recipes,
  totals,
  dailyTarget,
  mealTargets,
  macroColors,
  pasteArmed,
  canUndoPaste,
  onClose,
  onPasteClick,
  onUndoPaste,
  onAddSubsection,
  onRemoveSubsection,
  onRemoveMeal,
}: {
  day: DayPlan;
  recipes: SavedRecipe[];
  totals: DayTotals;
  dailyTarget: Macro;
  mealTargets: MealSlot[];
  macroColors: MacroColors;
  pasteArmed: boolean;
  canUndoPaste: boolean;
  onClose: () => void;
  onPasteClick: () => void;
  onUndoPaste: () => void;
  onAddSubsection: (name: string) => void;
  onRemoveSubsection: (subsection: string) => void;
  onRemoveMeal: (mealId: string) => void;
}) {
  const [newSubsection, setNewSubsection] = useState("");
  // Which subsection's macro-alignment breakdown is expanded — clicking a
  // subsection's name toggles it; only one open at a time, same accordion
  // pattern as the day strip above.
  const [expandedSubsection, setExpandedSubsection] = useState<string | null>(null);

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
          {canUndoPaste && (
            <button
              type="button"
              onClick={onUndoPaste}
              className="whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Undo
            </button>
          )}
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

      <div className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
        <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
          Macro goals for this day
        </span>
        <ProgressRow
          label="Protein"
          unit="g"
          actual={totals?.protein ?? 0}
          target={dailyTarget.protein}
          color={macroColors.protein}
          flagOverTarget={false}
        />
        <ProgressRow
          label="Carbs"
          unit="g"
          actual={totals?.carbs ?? 0}
          target={dailyTarget.carbs}
          color={macroColors.carbs}
          flagOverTarget={false}
        />
        <ProgressRow
          label="Fat"
          unit="g"
          actual={totals?.fat ?? 0}
          target={dailyTarget.fat}
          color={macroColors.fat}
          flagOverTarget={false}
        />
      </div>

      <div className="flex flex-col gap-3">
        {day.subsections.map((subsection) => {
          const meals = day.meals.filter((m) => m.subsection === subsection);
          const subsectionActual = sumPlannedMeals(meals, recipes);
          const mealTarget = mealTargets.find((m) => m.name === subsection);
          const isExpanded = expandedSubsection === subsection;
          return (
            <div
              key={subsection}
              className="flex flex-col gap-1.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800"
            >
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setExpandedSubsection(isExpanded ? null : subsection)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
                >
                  {subsection}
                  <svg
                    className={`h-3 w-3 text-zinc-400 transition ${isExpanded ? "rotate-180" : ""}`}
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2.5 4.5L6 8l3.5-3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveSubsection(subsection)}
                  className="text-xs text-zinc-400 transition hover:text-rose-500"
                >
                  Remove
                </button>
              </div>

              {isExpanded && (
                <div className="flex flex-col gap-2 rounded-lg bg-white p-2.5 dark:bg-zinc-900">
                  {mealTarget ? (
                    <>
                      <span className="text-[11px] text-zinc-400">
                        Planned here vs. &quot;{mealTarget.name}&quot;&apos;s goal on Daily Macros
                      </span>
                      <ProgressRow
                        label="Protein"
                        unit="g"
                        actual={subsectionActual?.protein ?? 0}
                        target={mealTarget.macros.protein}
                        color={macroColors.protein}
                        flagOverTarget={false}
                      />
                      <ProgressRow
                        label="Carbs"
                        unit="g"
                        actual={subsectionActual?.carbs ?? 0}
                        target={mealTarget.macros.carbs}
                        color={macroColors.carbs}
                        flagOverTarget={false}
                      />
                      <ProgressRow
                        label="Fat"
                        unit="g"
                        actual={subsectionActual?.fat ?? 0}
                        target={mealTarget.macros.fat}
                        color={macroColors.fat}
                        flagOverTarget={false}
                      />
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-400">
                      No meal named &quot;{subsection}&quot; on Daily Macros, so there&apos;s no goal
                      to compare against — rename one there to match, or this subsection here.
                    </span>
                  )}
                </div>
              )}

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
