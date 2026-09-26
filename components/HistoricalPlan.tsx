"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  loadWeeklyPlan,
  sumPlannedMeals,
  type DayTotals,
  type PlannedMeal,
  type WeeklyPlan as WeeklyPlanData,
} from "@/lib/weekly-plan";
import {
  addMealToHistoryDay,
  addSubsectionToHistoryDay,
  formatDate,
  formatDisplayDate,
  loadHistoryLog,
  removeMealFromHistoryDay,
  removeSubsectionFromHistoryDay,
  resolveHistoryDay,
  saveHistoryLog,
  todayDateString,
  type HistoryDay,
  type HistoryLog,
} from "@/lib/history";
import { loadSavedRecipes, type SavedRecipe } from "@/lib/saved-recipes";
import { loadProfile } from "@/lib/storage";
import { DEFAULT_MACRO_COLORS, defaultProfile, type Macro, type MacroColors } from "@/lib/macro";
import ProgressRow from "./ProgressRow";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function HistoricalPlan() {
  const [weeklyPlan, setWeeklyPlan] = useState<WeeklyPlanData | null>(null);
  const [historyLog, setHistoryLog] = useState<HistoryLog | null>(null);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [macroColors, setMacroColors] = useState<MacroColors>(DEFAULT_MACRO_COLORS);
  const [dailyTarget, setDailyTarget] = useState<Macro>(defaultProfile().dailyTarget);
  const [today, setToday] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null); // 0-11
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setWeeklyPlan(loadWeeklyPlan());
    setHistoryLog(loadHistoryLog());
    setRecipes(loadSavedRecipes());
    const profile = loadProfile();
    setMacroColors(profile?.macroColors ?? DEFAULT_MACRO_COLORS);
    setDailyTarget(profile?.dailyTarget ?? defaultProfile().dailyTarget);
    const now = new Date();
    setToday(todayDateString());
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  }, []);

  useEffect(() => {
    if (historyLog) saveHistoryLog(historyLog);
  }, [historyLog]);

  const ready = weeklyPlan && historyLog && today !== null && year !== null && month !== null;

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading your history…
      </div>
    );
  }

  function changeYear(delta: number) {
    setYear((y) => (y === null ? y : y + delta));
    setSelectedDate(null);
  }

  function changeMonth(delta: number) {
    setMonth((m) => {
      if (m === null) return m;
      let nextMonth = m + delta;
      setYear((y) => {
        if (y === null) return y;
        if (nextMonth < 0) return y - 1;
        if (nextMonth > 11) return y + 1;
        return y;
      });
      nextMonth = ((nextMonth % 12) + 12) % 12;
      return nextMonth;
    });
    setSelectedDate(null);
  }

  function mutateHistory(updater: (log: HistoryLog) => HistoryLog) {
    setHistoryLog((prev) => (prev ? updater(prev) : prev));
  }

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday = 0

  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedDay = selectedDate ? resolveHistoryDay(historyLog, selectedDate, weeklyPlan) : null;
  const selectedTotals = selectedDay ? sumPlannedMeals(selectedDay.meals, recipes) : null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Historical plan
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          See what was actually planned on past days, sourced from your Weekly Plan. Click a day
          to view or edit it.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 rounded-full border border-zinc-200 px-1 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => changeYear(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            −
          </button>
          <span className="w-12 text-center text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
            {year}
          </span>
          <button
            type="button"
            onClick={() => changeYear(1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            +
          </button>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-zinc-200 px-1 dark:border-zinc-800">
          <button
            type="button"
            onClick={() => changeMonth(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            −
          </button>
          <span className="w-24 text-center text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {MONTH_NAMES[month]}
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
          {WEEKDAY_HEADERS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((dayNum, i) => {
            if (dayNum === null) return <div key={i} />;
            const dateStr = formatDate(year, month, dayNum);
            const isFuture = dateStr > today;
            const isToday = dateStr === today;
            const isSelected = selectedDate === dateStr;
            const dayData = !isFuture ? resolveHistoryDay(historyLog, dateStr, weeklyPlan) : null;
            const totals = dayData ? sumPlannedMeals(dayData.meals, recipes) : null;
            return (
              <button
                key={i}
                type="button"
                disabled={isFuture}
                onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-2 text-center transition ${
                  isFuture
                    ? "cursor-default border-transparent text-zinc-300 dark:text-zinc-700"
                    : isSelected
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800"
                } ${isToday && !isSelected ? "ring-1 ring-inset ring-orange-400" : ""}`}
              >
                <span className="text-xs font-bold">{dayNum}</span>
                {totals && (
                  <span
                    className={`text-[9px] ${isSelected ? "text-zinc-300 dark:text-zinc-600" : "text-zinc-400"}`}
                  >
                    {Math.round(totals.calories)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && selectedDay && (
        <HistoryDayDetail
          date={selectedDate}
          day={selectedDay}
          totals={selectedTotals}
          dailyTarget={dailyTarget}
          macroColors={macroColors}
          recipes={recipes}
          onClose={() => setSelectedDate(null)}
          onAddSubsection={(name) =>
            mutateHistory((log) => addSubsectionToHistoryDay(log, selectedDate, selectedDay, name))
          }
          onRemoveSubsection={(subsection) =>
            mutateHistory((log) =>
              removeSubsectionFromHistoryDay(log, selectedDate, selectedDay, subsection),
            )
          }
          onAddMeal={(subsection, recipeId) =>
            mutateHistory((log) =>
              addMealToHistoryDay(log, selectedDate, selectedDay, subsection, recipeId),
            )
          }
          onRemoveMeal={(mealId) =>
            mutateHistory((log) => removeMealFromHistoryDay(log, selectedDate, selectedDay, mealId))
          }
        />
      )}
    </div>
  );
}

function HistoryDayDetail({
  date,
  day,
  totals,
  dailyTarget,
  macroColors,
  recipes,
  onClose,
  onAddSubsection,
  onRemoveSubsection,
  onAddMeal,
  onRemoveMeal,
}: {
  date: string;
  day: HistoryDay;
  totals: DayTotals;
  dailyTarget: Macro;
  macroColors: MacroColors;
  recipes: SavedRecipe[];
  onClose: () => void;
  onAddSubsection: (name: string) => void;
  onRemoveSubsection: (subsection: string) => void;
  onAddMeal: (subsection: string, recipeId: string) => void;
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
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {formatDisplayDate(date)}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Close
        </button>
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
        {day.subsections.map((subsection) => (
          <HistorySubsection
            key={subsection}
            subsection={subsection}
            meals={day.meals.filter((m) => m.subsection === subsection)}
            recipes={recipes}
            onRemoveSubsection={() => onRemoveSubsection(subsection)}
            onAddMeal={(recipeId) => onAddMeal(subsection, recipeId)}
            onRemoveMeal={onRemoveMeal}
          />
        ))}
        {day.subsections.length === 0 && (
          <p className="text-xs text-zinc-400">
            No meals for this date — add one below.
          </p>
        )}
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

function HistorySubsection({
  subsection,
  meals,
  recipes,
  onRemoveSubsection,
  onAddMeal,
  onRemoveMeal,
}: {
  subsection: string;
  meals: PlannedMeal[];
  recipes: SavedRecipe[];
  onRemoveSubsection: () => void;
  onAddMeal: (recipeId: string) => void;
  onRemoveMeal: (mealId: string) => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [pickedRecipeId, setPickedRecipeId] = useState(recipes[0]?.id ?? "");

  function handleAdd() {
    if (!pickedRecipeId) return;
    onAddMeal(pickedRecipeId);
    setAddOpen(false);
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">{subsection}</h3>
        <button
          type="button"
          onClick={onRemoveSubsection}
          className="text-xs text-zinc-400 transition hover:text-rose-500"
        >
          Remove
        </button>
      </div>
      {meals.length === 0 ? (
        <p className="text-xs text-zinc-400">Nothing logged.</p>
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
      {recipes.length > 0 &&
        (addOpen ? (
          <div className="flex items-center gap-1.5">
            <select
              value={pickedRecipeId}
              onChange={(e) => setPickedRecipeId(e.target.value)}
              className="flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleAdd}
              className="rounded-md bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            >
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="self-start text-xs font-medium text-zinc-500 underline decoration-dotted hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            + Add recipe
          </button>
        ))}
    </div>
  );
}
