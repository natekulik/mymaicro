"use client";

import { useEffect, useState } from "react";
import { loadSavedRecipes, removeSavedRecipe, type SavedRecipe } from "@/lib/saved-recipes";
import { MICRO_NUTRIENTS, dailyValueLevel } from "@/lib/usda/micro-nutrients";

export default function MyRecipes() {
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setRecipes(loadSavedRecipes());
    setLoaded(true);
  }, []);

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
          <RecipeCard key={recipe.id} recipe={recipe} onRemove={() => handleRemove(recipe.id)} />
        ))}
      </div>
    </div>
  );
}

function RecipeCard({ recipe, onRemove }: { recipe: SavedRecipe; onRemove: () => void }) {
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
        <MiniStat label="Calories" value={recipe.nutrition.calories} unit="kcal" />
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
