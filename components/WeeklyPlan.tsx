"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  addMeal as addMealInDays,
  addSubsection as addSubsectionInDays,
  applyPreset,
  dayTotals,
  loadWeekOverrides,
  loadWeeklyPlan,
  loadWeeklyPresets,
  pasteToAllDays as pasteToAllDaysInDays,
  removeMeal as removeMealInDays,
  removeSubsection as removeSubsectionInDays,
  removeWeeklyPreset,
  resolveWeekDays,
  saveWeekOverrides,
  saveWeeklyPreset,
  sumPlannedMeals,
  type DayPlan,
  type DayTotals,
  type WeekOverrides,
  type WeeklyPlan as WeeklyPlanData,
  type WeeklyPreset,
} from "@/lib/weekly-plan";
import { loadSavedRecipes, type SavedRecipe } from "@/lib/saved-recipes";
import { loadProfile } from "@/lib/storage";
import { DEFAULT_MACRO_COLORS, defaultProfile, type Macro, type MacroColors, type MealSlot } from "@/lib/macro";
import {
  dateForDayIndexInWeek,
  formatShortDate,
  formatWeekRangeLabel,
  mondayOfDate,
  shiftWeek,
  todayDateString,
} from "@/lib/history";
import ProgressRow from "./ProgressRow";
import HistoricalPlan from "./HistoricalPlan";

// Snapshot for the one-level "paste to all days" undo — tagged with the
// week it applies to, so navigating to a different week and back doesn't
// let Undo reach across weeks and revert one the user isn't even looking
// at anymore.
type PasteUndoSnapshot = { weekStart: string; days: DayPlan[] };

export default function WeeklyPlan() {
  const [template, setTemplate] = useState<WeeklyPlanData | null>(null);
  const [weekOverrides, setWeekOverrides] = useState<WeekOverrides | null>(null);
  // Monday ("YYYY-MM-DD") of whichever week is currently being viewed —
  // starts at this week's Monday once the client mounts.
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [today, setToday] = useState<string | null>(null);
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
  const [pasteUndoSnapshot, setPasteUndoSnapshot] = useState<PasteUndoSnapshot | null>(null);
  // Saved weekly presets ("Add Weekly Preset" / "My Presets") — reusable
  // full-week snapshots the user can drop onto whatever week they're
  // viewing. Applying one shares the same undo mechanism as "paste to all
  // days" below, since both fully replace the current week's days.
  const [presets, setPresets] = useState<WeeklyPreset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  // Two-click confirm for applying a preset, keyed by preset id — same
  // arm/confirm pattern as pasteArmedDay above.
  const [presetArmedId, setPresetArmedId] = useState<string | null>(null);
  // Which way the week-nav content should slide in on its next render —
  // set right before weekStart changes, paired with `key={weekStart}` on
  // the label/grid below so React remounts a fresh element for the CSS
  // animation to play against each time.
  const [slideDirection, setSlideDirection] = useState<"next" | "prev" | null>(null);

  useEffect(() => {
    setTemplate(loadWeeklyPlan());
    setWeekOverrides(loadWeekOverrides());
    setPresets(loadWeeklyPresets());
    setRecipes(loadSavedRecipes());
    const profile = loadProfile();
    setMacroColors(profile?.macroColors ?? DEFAULT_MACRO_COLORS);
    setDailyTarget(profile?.dailyTarget ?? defaultProfile().dailyTarget);
    setMealTargets(profile?.meals ?? defaultProfile().meals);
    const todayStr = todayDateString();
    setToday(todayStr);
    setWeekStart(mondayOfDate(todayStr));
  }, []);

  useEffect(() => {
    if (weekOverrides) saveWeekOverrides(weekOverrides);
  }, [weekOverrides]);

  const ready = template !== null && weekOverrides !== null && weekStart !== null && today !== null;

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading your weekly plan…
      </div>
    );
  }

  const weekDays = resolveWeekDays(weekStart, template, weekOverrides);

  function changeWeek(delta: number) {
    setSlideDirection(delta > 0 ? "next" : "prev");
    setWeekStart((prev) => (prev ? shiftWeek(prev, delta) : prev));
    setOpenDay(null);
    setPasteArmedDay(null);
  }

  function jumpToToday() {
    // Nested functions don't inherit the `ready` narrowing above (TS can't
    // prove they're only called once state is populated) — they're only
    // ever wired to JSX that itself only renders once `ready` is true, so
    // the assertions here are safe.
    const target = mondayOfDate(today!);
    setSlideDirection(target > weekStart! ? "next" : target < weekStart! ? "prev" : null);
    setWeekStart(target);
    setOpenDay(null);
    setPasteArmedDay(null);
  }

  // Any plan edit other than the paste itself invalidates the paste undo —
  // wraps the mutation setters below so Undo can never revert edits made
  // after it that the user wouldn't expect it to touch.
  function mutateWeek(updater: (days: DayPlan[]) => DayPlan[]) {
    const nextDays = updater(weekDays);
    setWeekOverrides((prev) => ({ ...(prev ?? {}), [weekStart!]: nextDays }));
    setPasteUndoSnapshot(null);
  }

  function handlePasteClick(day: string) {
    if (pasteArmedDay === day) {
      setPasteUndoSnapshot({ weekStart: weekStart!, days: weekDays });
      setWeekOverrides((prev) => ({ ...(prev ?? {}), [weekStart!]: pasteToAllDaysInDays(weekDays, day) }));
      setPasteArmedDay(null);
      setPresetArmedId(null);
    } else {
      setPasteArmedDay(day);
    }
  }

  function handleUndoPaste() {
    if (!pasteUndoSnapshot || pasteUndoSnapshot.weekStart !== weekStart) return;
    setWeekOverrides((prev) => ({ ...(prev ?? {}), [weekStart]: pasteUndoSnapshot.days }));
    setPasteUndoSnapshot(null);
  }

  function handleSavePreset(name: string) {
    const preset = saveWeeklyPreset(name, weekDays);
    setPresets((prev) => [preset, ...prev]);
    setSaveOpen(false);
  }

  function handleDeletePreset(id: string) {
    removeWeeklyPreset(id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (presetArmedId === id) setPresetArmedId(null);
  }

  function handleApplyPresetClick(preset: WeeklyPreset) {
    if (presetArmedId === preset.id) {
      setPasteUndoSnapshot({ weekStart: weekStart!, days: weekDays });
      setWeekOverrides((prev) => ({ ...(prev ?? {}), [weekStart!]: applyPreset(preset) }));
      setPresetArmedId(null);
      setPasteArmedDay(null);
    } else {
      setPresetArmedId(preset.id);
    }
  }

  const openDayPlan = weekDays.find((d) => d.day === openDay) ?? null;
  const isCurrentWeek = weekStart === mondayOfDate(today);
  const canUndoPaste = pasteUndoSnapshot !== null && pasteUndoSnapshot.weekStart === weekStart;
  const slideClass =
    slideDirection === "next"
      ? "animate-week-slide-next"
      : slideDirection === "prev"
        ? "animate-week-slide-prev"
        : "";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Maicro Plan
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Plan out what you&apos;re eating each day — each week is its own plan. Add recipes to a
          day and subsection from <span className="font-medium text-zinc-600 dark:text-zinc-300">My Recipes</span>{" "}
          (this week) or directly below (any week), then click a day to see or edit it.
        </p>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSaveOpen((o) => !o);
              setPresetsOpen(false);
            }}
            className="whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            + Add Weekly Preset
          </button>
          <button
            type="button"
            onClick={() => {
              setPresetsOpen((o) => !o);
              setSaveOpen(false);
            }}
            className="whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            My Presets{presets.length > 0 ? ` (${presets.length})` : ""}
          </button>
          {canUndoPaste && (
            <button
              type="button"
              onClick={handleUndoPaste}
              className="whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Undo
            </button>
          )}
        </div>

        {saveOpen && <SavePresetPanel onSave={handleSavePreset} onCancel={() => setSaveOpen(false)} />}
        {presetsOpen && (
          <PresetListPanel
            presets={presets}
            armedId={presetArmedId}
            onApply={handleApplyPresetClick}
            onDelete={handleDeletePreset}
          />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div key={`label-${weekStart}`} className={`flex items-center justify-center gap-3 ${slideClass}`}>
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Week of {formatWeekRangeLabel(weekStart)}
          </span>
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={jumpToToday}
              className="text-xs font-medium text-orange-600 underline decoration-dotted transition hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
            >
              Jump to this week
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => changeWeek(-1)}
            aria-label="Previous week"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ‹
          </button>
          <div key={`grid-${weekStart}`} className={`grid flex-1 grid-cols-4 gap-2 sm:grid-cols-7 ${slideClass}`}>
            {weekDays.map((day, index) => {
              const totals = dayTotals(day, recipes);
              const isOpen = openDay === day.day;
              const pillDate = dateForDayIndexInWeek(weekStart, index);
              const isToday = pillDate === today;
              return (
                <div key={day.day} className="flex flex-col items-center gap-1">
                  <span
                    className={`text-[10px] font-semibold ${
                      isToday ? "text-orange-500" : "text-zinc-400 dark:text-zinc-500"
                    }`}
                  >
                    {isToday ? "Today" : formatShortDate(pillDate)}
                  </span>
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
                    <span
                      className={`text-xs font-bold ${totals ? "" : isOpen ? "text-zinc-400 dark:text-zinc-500" : "text-zinc-400"}`}
                    >
                      {totals ? `${Math.round(totals.calories)} cals` : "—"}
                    </span>
                    {totals && (
                      <span className="whitespace-nowrap text-[10px] font-semibold">
                        <span style={{ color: macroColors.protein }}>{Math.round(totals.protein)}p</span>
                        <span className={isOpen ? "text-zinc-400" : "text-zinc-300 dark:text-zinc-600"}>
                          {" "}
                          ·{" "}
                        </span>
                        <span style={{ color: macroColors.carbs }}>{Math.round(totals.carbs)}c</span>
                        <span className={isOpen ? "text-zinc-400" : "text-zinc-300 dark:text-zinc-600"}>
                          {" "}
                          ·{" "}
                        </span>
                        <span style={{ color: macroColors.fat }}>{Math.round(totals.fat)}f</span>
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => changeWeek(1)}
            aria-label="Next week"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            ›
          </button>
        </div>
      </div>

      {openDayPlan && (
        <DayDetail
          key={`${weekStart}-${openDayPlan.day}`}
          day={openDayPlan}
          recipes={recipes}
          totals={dayTotals(openDayPlan, recipes)}
          dailyTarget={dailyTarget}
          mealTargets={mealTargets}
          macroColors={macroColors}
          pasteArmed={pasteArmedDay === openDayPlan.day}
          canUndoPaste={canUndoPaste}
          onClose={() => setOpenDay(null)}
          onPasteClick={() => handlePasteClick(openDayPlan.day)}
          onUndoPaste={handleUndoPaste}
          onAddSubsection={(name) => mutateWeek((days) => addSubsectionInDays(days, openDayPlan.day, name))}
          onRemoveSubsection={(subsection) =>
            mutateWeek((days) => removeSubsectionInDays(days, openDayPlan.day, subsection))
          }
          onAddMeal={(subsection, recipeId) =>
            mutateWeek((days) => addMealInDays(days, openDayPlan.day, subsection, recipeId))
          }
          onRemoveMeal={(mealId) => mutateWeek((days) => removeMealInDays(days, openDayPlan.day, mealId))}
        />
      )}

      <section className="flex flex-col gap-4 border-t border-zinc-200 pt-8 dark:border-zinc-800">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Maicro Calendar
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            See what was actually planned on past days, sourced from your Maicro Plan above. Click
            a day to view or edit it.
          </p>
        </div>
        <HistoricalPlan
          template={template}
          weekOverrides={weekOverrides}
          recipes={recipes}
          macroColors={macroColors}
          dailyTarget={dailyTarget}
        />
      </section>
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
  onAddMeal,
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
  onAddMeal: (subsection: string, recipeId: string) => void;
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

              {recipes.length > 0 && (
                <AddRecipeControl recipes={recipes} onAdd={(recipeId) => onAddMeal(subsection, recipeId)} />
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

function AddRecipeControl({
  recipes,
  onAdd,
}: {
  recipes: SavedRecipe[];
  onAdd: (recipeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");

  function handleAdd() {
    if (!recipeId) return;
    onAdd(recipeId);
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="self-start text-xs font-medium text-zinc-500 underline decoration-dotted hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        + Add recipe
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={recipeId}
        onChange={(e) => setRecipeId(e.target.value)}
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
  );
}

function SavePresetPanel({
  onSave,
  onCancel,
}: {
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800"
    >
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Save this week&apos;s full plan — every day, meal, and recipe — as a reusable preset you
        can drop into any week later from &quot;My Presets&quot;.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          autoFocus
          placeholder="Preset name (e.g. Typical week)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:focus:border-zinc-600"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="whitespace-nowrap rounded-md bg-zinc-700 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="whitespace-nowrap rounded-md border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function PresetListPanel({
  presets,
  armedId,
  onApply,
  onDelete,
}: {
  presets: WeeklyPreset[];
  armedId: string | null;
  onApply: (preset: WeeklyPreset) => void;
  onDelete: (id: string) => void;
}) {
  if (presets.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-400 dark:bg-zinc-800">
        No presets saved yet — use &quot;+ Add Weekly Preset&quot; to save this week&apos;s plan
        for reuse.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
      {presets.map((preset) => {
        const armed = armedId === preset.id;
        return (
          <div
            key={preset.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 dark:bg-zinc-900"
          >
            <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
              {preset.name}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => onApply(preset)}
                className={`whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                  armed
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {armed ? "Click again to confirm" : "Add to current week"}
              </button>
              <button
                type="button"
                onClick={() => onDelete(preset.id)}
                className="text-xs text-zinc-400 transition hover:text-rose-500"
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
