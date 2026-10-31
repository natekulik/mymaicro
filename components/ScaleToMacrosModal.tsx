"use client";

import { useEffect, useMemo, useState } from "react";
import type { IngredientMacroDetail } from "@/lib/recipe-types";
import { calories, type Macro, type MacroProfile } from "@/lib/macro";
import { loadMacroPresets, type MacroPreset } from "@/lib/macro-presets";
import { loadProfile } from "@/lib/storage";
import { loadSavedRecipes, type SavedRecipe } from "@/lib/saved-recipes";
import { dayNameForDate, mondayOfDate, todayDateString } from "@/lib/history";
import {
  type DayPlan,
  loadWeekOverrides,
  loadWeeklyPlan,
  resolveWeekDays,
  sumPlannedMeals,
} from "@/lib/weekly-plan";
import {
  SCALE_MACROS,
  type MacroKey,
  type ScaleChange,
  type ScalePick,
  isScalable,
  previewScale,
  recipePerServing,
} from "@/lib/scale-to-macros";

// Everything the dialog needs to work out "what's left" — loaded from the
// user's own plan and goals (see ScaleToMacrosModal), but a plain object so
// the dialog itself has no data fetching in it.
export type ScalePlanContext = {
  profile: MacroProfile;
  presets: MacroPreset[];
  days: DayPlan[]; // the current week
  recipes: SavedRecipe[];
  todayName: string;
};

const MACRO_LABELS: Record<MacroKey, string> = { protein: "Protein", carbs: "Carbs", fat: "Fat" };

const ZERO: Macro = { protein: 0, carbs: 0, fat: 0 };

// Loads the user's goals + this week's plan, then hands off to the dialog.
export default function ScaleToMacrosModal({
  ingredients,
  servings,
  onClose,
  onApply,
}: {
  ingredients: IngredientMacroDetail[];
  servings: number;
  onClose: () => void;
  onApply: (changes: ScaleChange[]) => void;
}) {
  const [ctx, setCtx] = useState<ScalePlanContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [profile, presets, template, overrides, recipes] = await Promise.all([
          loadProfile(),
          loadMacroPresets(),
          loadWeeklyPlan(),
          loadWeekOverrides(),
          loadSavedRecipes(),
        ]);
        if (!active) return;
        const today = todayDateString();
        setCtx({
          profile,
          presets,
          days: resolveWeekDays(mondayOfDate(today), template, overrides),
          recipes,
          todayName: dayNameForDate(today),
        });
      } catch {
        if (active) setError("Couldn't load your macro goals and plan — try again.");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!ctx) {
    return (
      <Backdrop onClose={onClose}>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{error ?? "Loading your plan…"}</p>
        {error && (
          <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
            Close
          </button>
        )}
      </Backdrop>
    );
  }
  return <ScaleToMacrosDialog ctx={ctx} ingredients={ingredients} servings={servings} onClose={onClose} onApply={onApply} />;
}

const SECONDARY_BUTTON =
  "rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Scale to my macros"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        {children}
      </div>
    </div>
  );
}

const selectClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200";

function ScaleToMacrosDialog({
  ctx,
  ingredients,
  servings,
  onClose,
  onApply,
}: {
  ctx: ScalePlanContext;
  ingredients: IngredientMacroDetail[];
  servings: number;
  onClose: () => void;
  onApply: (changes: ScaleChange[]) => void;
}) {
  const { profile, presets, days, recipes, todayName } = ctx;
  const initialDay = days.some((d) => d.day === todayName) ? todayName : (days[0]?.day ?? "");
  const [dayName, setDayName] = useState(initialDay);
  // "" = the whole rest of the day; otherwise the name of one meal.
  const [mealName, setMealName] = useState("");
  // macro -> index of the ingredient picked to make it up ("" = none)
  const [picked, setPicked] = useState<Record<MacroKey, string>>({ protein: "", carbs: "", fat: "" });

  const day = days.find((d) => d.day === dayName);
  const mealGoals = profile.mealsEnabled ? profile.meals : [];
  const mealOptions = (day?.subsections ?? []).filter((s) => mealGoals.some((m) => m.name === s));

  // What one serving of this recipe should come to: the day's goal (or the
  // chosen meal's goal) minus whatever's already planned there.
  const remaining: Macro = useMemo(() => {
    if (!day) return ZERO;
    const meal = mealName ? mealGoals.find((m) => m.name === mealName) : null;
    if (meal && mealOptions.includes(mealName)) {
      const planned = sumPlannedMeals(day.meals.filter((m) => m.subsection === mealName), recipes);
      return {
        protein: meal.macros.protein - (planned?.protein ?? 0),
        carbs: meal.macros.carbs - (planned?.carbs ?? 0),
        fat: meal.macros.fat - (planned?.fat ?? 0),
      };
    }
    const preset = day.macroPresetId ? presets.find((p) => p.id === day.macroPresetId) : null;
    const target = preset?.dailyTarget ?? profile.dailyTarget;
    const planned = sumPlannedMeals(day.meals, recipes);
    return {
      protein: target.protein - (planned?.protein ?? 0),
      carbs: target.carbs - (planned?.carbs ?? 0),
      fat: target.fat - (planned?.fat ?? 0),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, mealName, recipes, presets, profile]);

  const current = useMemo(() => recipePerServing(ingredients, servings), [ingredients, servings]);
  const gap: Macro = {
    protein: remaining.protein - current.protein,
    carbs: remaining.carbs - current.carbs,
    fat: remaining.fat - current.fat,
  };

  const scalable = ingredients.map((d, i) => ({ d, i })).filter(({ d }) => isScalable(d));
  const picks: ScalePick[] = SCALE_MACROS.filter((m) => picked[m] !== "").map((m) => ({
    macro: m,
    ingredientIndex: Number(picked[m]),
  }));
  const preview = useMemo(
    () => previewScale(ingredients, servings, gap, picks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ingredients, servings, remaining.protein, remaining.carbs, remaining.fat, picked],
  );

  const goalLabel = mealName ? `${dayName}'s ${mealName}` : dayName;
  const bigJumps = preview.changes.filter((c) => c.factor > 4 || c.factor < 0.1);

  function changeDay(next: string) {
    setDayName(next);
    setMealName("");
  }

  return (
    <Backdrop onClose={onClose}>
      <div>
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Scale to my macros</h2>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Pick the ingredients to scale, and one serving of this recipe is resized to fill what&apos;s left of your
          plan.
        </p>
      </div>

      <div className={`grid gap-3 ${mealOptions.length > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Which day?</span>
          <select value={dayName} onChange={(e) => changeDay(e.target.value)} className={selectClass}>
            {days.map((d) => (
              <option key={d.day} value={d.day}>
                {d.day}
                {d.day === todayName ? " (today)" : ""}
              </option>
            ))}
          </select>
        </label>
        {mealOptions.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Which meal?</span>
            <select value={mealName} onChange={(e) => setMealName(e.target.value)} className={selectClass}>
              <option value="">Rest of the day</option>
              {mealOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-700">
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">What to scale</span>
        {scalable.length === 0 && (
          <p className="text-xs text-zinc-400">None of this recipe&apos;s ingredients have an amount that can be scaled.</p>
        )}
        {SCALE_MACROS.map((macro) => {
          const needed = Math.round(gap[macro]);
          return (
            <div key={macro} className="grid grid-cols-[6.5rem_1fr] items-center gap-2">
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: profile.macroColors[macro] }} />
                  {MACRO_LABELS[macro]}
                </span>
                <span className="text-[11px] text-zinc-400">
                  {needed === 0 ? "on target" : needed > 0 ? `needs +${needed}g` : `${-needed}g over`}
                </span>
              </div>
              <select
                value={picked[macro]}
                onChange={(e) => setPicked((p) => ({ ...p, [macro]: e.target.value }))}
                disabled={scalable.length === 0}
                className={selectClass}
                aria-label={`Ingredient to scale for ${MACRO_LABELS[macro].toLowerCase()}`}
              >
                <option value="">Leave alone</option>
                {scalable.map(({ d, i }) => (
                  <option key={i} value={i}>
                    {d.raw}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>

      {preview.changes.length > 0 && (
        <div className="flex flex-col gap-1 rounded-xl bg-zinc-50 p-3 text-sm dark:bg-zinc-800">
          {preview.changes.map((c) => (
            <div key={c.index} className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-zinc-500 dark:text-zinc-400">{c.originalText}</span>
              <span className="text-zinc-400">→</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">{c.newText}</span>
              <span className="text-xs text-zinc-400">
                ({c.factor >= 1 ? "+" : "−"}
                {Math.round(Math.abs(c.factor - 1) * 100)}%)
              </span>
            </div>
          ))}
          {bigJumps.length > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              That&apos;s a big change from the original amount — double-check it still makes sense for the recipe.
            </p>
          )}
        </div>
      )}

      <div>
        <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-xs">
          <span />
          <span className="text-center font-medium text-zinc-400">Now</span>
          <span className="text-center font-medium text-zinc-400">After</span>
          <span className="text-center font-medium text-zinc-400">Goal</span>
          {SCALE_MACROS.map((macro) => (
            <Row
              key={macro}
              label={MACRO_LABELS[macro]}
              now={current[macro]}
              after={preview.after[macro]}
              goal={remaining[macro]}
              unit="g"
              showMiss={picked[macro] !== ""}
            />
          ))}
          <Row
            label="Calories"
            now={current.calories}
            after={preview.after.calories}
            goal={calories(remaining)}
            unit=""
            showMiss={false}
          />
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          Goal is what&apos;s left of {goalLabel} after your other planned meals, for one serving. Macros you leave
          alone can move a little too, since the scaled ingredients carry some of each.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
          Cancel
        </button>
        <button
          type="button"
          disabled={preview.changes.length === 0}
          onClick={() => onApply(preview.changes)}
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Apply scaling
        </button>
      </div>
    </Backdrop>
  );
}

function Row({
  label,
  now,
  after,
  goal,
  unit,
  showMiss,
}: {
  label: string;
  now: number;
  after: number;
  goal: number;
  unit: string;
  showMiss: boolean;
}) {
  const miss = Math.round(after - goal);
  return (
    <>
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-center tabular-nums text-zinc-700 dark:text-zinc-200">
        {Math.round(now)}
        {unit}
      </span>
      <span className="text-center font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
        {Math.round(after)}
        {unit}
        {showMiss && Math.abs(miss) > 1 && (
          <span className="ml-1 font-normal text-amber-700 dark:text-amber-400">
            ({miss > 0 ? "+" : "−"}
            {Math.abs(miss)})
          </span>
        )}
      </span>
      <span className="text-center tabular-nums text-zinc-500 dark:text-zinc-400">
        {Math.round(goal)}
        {unit}
      </span>
    </>
  );
}
