"use client";

import { useEffect, useState, type FormEvent } from "react";
import { loadSavedRecipes, removeSavedRecipe, type SavedRecipe } from "@/lib/saved-recipes";
import { MICRO_NUTRIENTS, dailyValueLevel } from "@/lib/usda/micro-nutrients";
import {
  DAY_NAMES,
  addMeal,
  addMealToAllDays,
  loadWeeklyPlan,
  removeMeal,
  saveWeeklyPlan,
  type WeeklyPlan,
} from "@/lib/weekly-plan";

// Sentinel value for the "All days" option in the day picker — distinct
// from any real day name.
const ALL_DAYS_VALUE = "__all__";

export default function MyRecipes() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);

  useEffect(() => {
    setRecipes(loadSavedRecipes());
    setPlan(loadWeeklyPlan());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (plan) saveWeeklyPlan(plan);
  }, [plan]);

  function handleRemove(id: string) {
    removeSavedRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          My recipes
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Recipes saved from Macro &amp; Micro analysis, with their per-serving breakdown.
        </p>
      </header>

      {loaded && recipes.length === 0 && (
        <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Nothing saved yet — analyze a recipe and use &quot;Add to My Recipes&quot; once its
          breakdown is ready to keep it here.
        </p>
      )}

      <div className="flex flex-col gap-4">
        {recipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onRemove={() => handleRemove(recipe.id)}
            plan={plan}
            onAddMeal={(day, subsection) =>
              setPlan((prev) => (prev ? addMeal(prev, day, subsection, recipe.id) : prev))
            }
            onAddMealAllDays={(subsection) =>
              setPlan((prev) => (prev ? addMealToAllDays(prev, subsection, recipe.id) : prev))
            }
            onRemoveMeal={(day, mealId) =>
              setPlan((prev) => (prev ? removeMeal(prev, day, mealId) : prev))
            }
          />
        ))}
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  onRemove,
  plan,
  onAddMeal,
  onAddMealAllDays,
  onRemoveMeal,
}: {
  recipe: SavedRecipe;
  onRemove: () => void;
  plan: WeeklyPlan | null;
  onAddMeal: (day: string, subsection: string) => void;
  onAddMealAllDays: (subsection: string) => void;
  onRemoveMeal: (day: string, mealId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            {recipe.title}
          </h2>
          {recipe.sourceUrl && (
            <a
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              View source
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-xs text-zinc-400">
            Makes {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Calories" value={recipe.nutrition.calories} unit="cals" />
        <MiniStat label="Protein" value={recipe.nutrition.protein} unit="g" accent="bg-rose-500" />
        <MiniStat label="Carbs" value={recipe.nutrition.carbs} unit="g" accent="bg-amber-500" />
        <MiniStat label="Fat" value={recipe.nutrition.fat} unit="g" accent="bg-sky-500" />
      </div>
      <p className="text-xs text-zinc-400">Per serving.</p>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="inline-flex items-center gap-1 self-start rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {expanded ? "Hide details" : "Show ingredients & micros"}
      </button>

      {plan && (
        <AddToPlanControl
          recipeId={recipe.id}
          plan={plan}
          onAdd={onAddMeal}
          onAddAllDays={onAddMealAllDays}
          onRemove={onRemoveMeal}
        />
      )}

      {expanded && (
        <div className="flex flex-col gap-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Ingredients
            </h3>
            <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
              {recipe.ingredients.map((ingredient, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-zinc-300 dark:text-zinc-600">•</span>
                  {ingredient}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Micros (per serving)
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {MICRO_NUTRIENTS.map((def) => {
                const value = recipe.micros[def.key] ?? null;
                return (
                  <MiniStat
                    key={def.key}
                    label={def.label}
                    value={value}
                    unit={def.unit}
                    level={value !== null ? dailyValueLevel(def.key, value) : null}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-right text-[10px] leading-tight text-zinc-400">
              &ldquo;High&rdquo; / &ldquo;Low&rdquo; based on FDA Daily Values for a 2,000-calorie
              diet.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function AddToPlanControl({
  recipeId,
  plan,
  onAdd,
  onAddAllDays,
  onRemove,
}: {
  recipeId: string;
  plan: WeeklyPlan;
  onAdd: (day: string, subsection: string) => void;
  onAddAllDays: (subsection: string) => void;
  onRemove: (day: string, mealId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<string>(DAY_NAMES[0]);
  const dayPlan = plan.days.find((d) => d.day === day);
  // "All days" mode has no single day's subsection list to draw from, so it
  // offers the union of every day's subsections — addAllDays skips any day
  // that doesn't actually have the chosen one.
  const allSubsections = Array.from(new Set(plan.days.flatMap((d) => d.subsections)));
  const isAllDays = day === ALL_DAYS_VALUE;
  const subsectionOptions = isAllDays ? allSubsections : (dayPlan?.subsections ?? []);
  const [subsection, setSubsection] = useState(subsectionOptions[0] ?? "");

  const assignments = plan.days.flatMap((d) =>
    d.meals
      .filter((m) => m.recipeId === recipeId)
      .map((m) => ({ day: d.day, subsection: m.subsection, mealId: m.id })),
  );

  // Already on the day+subsection currently selected — only meaningful for
  // a single day (in "All days" mode it's always a partial fill at worst,
  // never fully blocked, so the button stays enabled there).
  const alreadyOnDay =
    !isAllDays && !!dayPlan?.meals.some((m) => m.subsection === subsection && m.recipeId === recipeId);

  function handleDayChange(nextDay: string) {
    setDay(nextDay);
    const nextOptions =
      nextDay === ALL_DAYS_VALUE
        ? allSubsections
        : (plan.days.find((d) => d.day === nextDay)?.subsections ?? []);
    setSubsection(nextOptions[0] ?? "");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subsection) return;
    if (isAllDays) {
      onAddAllDays(subsection);
    } else {
      if (alreadyOnDay) return;
      onAdd(day, subsection);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 self-start rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        + Add to Weekly Plan
      </button>

      {assignments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {assignments.map((a) => (
            <span
              key={a.mealId}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            >
              {a.day} · {a.subsection}
              <button
                type="button"
                onClick={() => onRemove(a.day, a.mealId)}
                className="text-emerald-500 transition hover:text-emerald-700 dark:hover:text-emerald-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {open && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800"
        >
          <select
            value={day}
            onChange={(e) => handleDayChange(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value={ALL_DAYS_VALUE}>All days</option>
            {DAY_NAMES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={subsection}
            onChange={(e) => setSubsection(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {subsectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!subsection || alreadyOnDay}
            className="rounded-md bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            {alreadyOnDay ? "Already added" : "Add"}
          </button>
        </form>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
  accent,
  level,
}: {
  label: string;
  value: number | null;
  unit: string;
  accent?: string;
  level?: "low" | "high" | null;
}) {
  return (
    <div className="relative flex flex-col gap-1 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
      {level && (
        <span
          className={`absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            level === "high"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
              : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
          }`}
        >
          {level}
        </span>
      )}
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {accent && <span className={`h-2 w-2 rounded-full ${accent}`} />}
        {label}
      </span>
      <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        {value !== null ? Math.round(value) : "—"}
        <span className="ml-1 text-xs font-normal text-zinc-400">{unit}</span>
      </span>
    </div>
  );
}
