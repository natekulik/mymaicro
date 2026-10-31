"use client";

import { useEffect, useState } from "react";
import type { SavedRecipe } from "@/lib/saved-recipes";
import { MICRO_NUTRIENTS, dailyValueLevel } from "@/lib/usda/micro-nutrients";

type View = "macros" | "micros";

// A recipe's ingredients plus its per-serving nutrition, in a pop-up with a
// Macros / Micros toggle — opened from "Show ingredients" on a planned
// recipe on the Plan page. Reads the saved recipe as it is; nothing to load.
export default function RecipeDetailsModal({ recipe, onClose }: { recipe: SavedRecipe; onClose: () => void }) {
  const [view, setView] = useState<View>("macros");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${recipe.title} ingredients`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{recipe.title}</h2>
            <p className="text-xs text-zinc-400">
              Makes {recipe.servings} serving{recipe.servings === 1 ? "" : "s"} · nutrition below is per serving
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Close ✕
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300">Ingredients</h3>
            <ul className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-300">
              {recipe.ingredients.map((ingredient, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-zinc-300 dark:text-zinc-600">•</span>
                  {ingredient}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-1 self-start rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
              {(["macros", "micros"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-3.5 py-1 text-xs font-medium transition ${
                    view === v
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                  }`}
                >
                  {v === "macros" ? "Macros" : "Micros"}
                </button>
              ))}
            </div>

            {view === "macros" ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Calories" value={recipe.nutrition.calories} unit="cals" />
                <Stat label="Protein" value={recipe.nutrition.protein} unit="g" accent="bg-rose-500" />
                <Stat label="Carbs" value={recipe.nutrition.carbs} unit="g" accent="bg-amber-500" />
                <Stat label="Fat" value={recipe.nutrition.fat} unit="g" accent="bg-sky-500" />
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-2 gap-3">
                  {MICRO_NUTRIENTS.map((def) => {
                    const value = recipe.micros[def.key] ?? null;
                    return (
                      <Stat
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
                  &ldquo;High&rdquo; / &ldquo;Low&rdquo; based on FDA Daily Values for a 2,000-calorie diet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
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
    <div className="relative flex flex-col gap-0.5 rounded-lg bg-zinc-50 p-2 dark:bg-zinc-800">
      {level && (
        <span
          className={`absolute right-1.5 top-1.5 rounded-full px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide ${
            level === "high"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
              : "bg-zinc-200 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
          }`}
        >
          {level}
        </span>
      )}
      <span className="flex items-center gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
        {accent && <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />}
        {label}
      </span>
      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        {value !== null ? Math.round(value) : "—"}
        <span className="ml-1 text-[10px] font-normal text-zinc-400">{unit}</span>
      </span>
    </div>
  );
}
