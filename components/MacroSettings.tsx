"use client";

import { useEffect, useState } from "react";
import {
  type Macro,
  type MacroProfile,
  calories,
  defaultProfile,
  newId,
  splitEvenly,
  sumMacros,
} from "@/lib/macro";
import { loadProfile, saveProfile } from "@/lib/storage";
import MealCard from "./MealCard";
import NumberField from "./NumberField";
import ProgressRow from "./ProgressRow";

const MIN_MEALS = 1;
const MAX_MEALS = 8;

export default function MacroSettings() {
  const [profile, setProfile] = useState<MacroProfile | null>(null);

  // Load once on mount — localStorage doesn't exist during server render.
  useEffect(() => {
    setProfile(loadProfile() ?? defaultProfile());
  }, []);

  // Autosave on every change.
  useEffect(() => {
    if (profile) saveProfile(profile);
  }, [profile]);

  if (!profile) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">
        Loading your macros…
      </div>
    );
  }

  const mealTotals = sumMacros(profile.meals);
  const dailyCalories = calories(profile.dailyTarget);
  const mealCalories = calories(mealTotals);

  function updateDailyTarget(next: Macro) {
    setProfile((p) => (p ? { ...p, dailyTarget: next } : p));
  }

  function updateMealCount(count: number) {
    setProfile((p) => {
      if (!p) return p;
      const clamped = Math.max(MIN_MEALS, Math.min(MAX_MEALS, count));
      const meals = [...p.meals];
      while (meals.length < clamped) {
        meals.push({
          id: newId(),
          name: `Meal ${meals.length + 1}`,
          macros: { protein: 0, carbs: 0, fat: 0 },
        });
      }
      while (meals.length > clamped) {
        meals.pop();
      }
      return { ...p, meals };
    });
  }

  function autoSplit() {
    setProfile((p) => (p ? { ...p, meals: splitEvenly(p.dailyTarget, p.meals.length) } : p));
  }

  function updateMeal(id: string, patch: Partial<{ name: string; macros: Macro }>) {
    setProfile((p) =>
      p
        ? {
            ...p,
            meals: p.meals.map((m) => (m.id === id ? { ...m, ...patch } : m)),
          }
        : p,
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Daily macros
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Set your daily macro targets, then split them across however many meals you eat.
        </p>
      </header>

      {/* Daily target */}
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Daily target</h2>
          <span className="text-sm font-medium text-zinc-400">{dailyCalories} kcal</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <NumberField
            label="Protein (g)"
            accent="bg-rose-500"
            value={profile.dailyTarget.protein}
            onChange={(v) => updateDailyTarget({ ...profile.dailyTarget, protein: v })}
          />
          <NumberField
            label="Carbs (g)"
            accent="bg-amber-500"
            value={profile.dailyTarget.carbs}
            onChange={(v) => updateDailyTarget({ ...profile.dailyTarget, carbs: v })}
          />
          <NumberField
            label="Fat (g)"
            accent="bg-sky-500"
            value={profile.dailyTarget.fat}
            onChange={(v) => updateDailyTarget({ ...profile.dailyTarget, fat: v })}
          />
        </div>
      </section>

      {/* Meals */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Meals per day
            </h2>
            <div className="flex items-center gap-2 rounded-full border border-zinc-200 px-1 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => updateMealCount(profile.meals.length - 1)}
                disabled={profile.meals.length <= MIN_MEALS}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >
                −
              </button>
              <span className="w-4 text-center text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-50">
                {profile.meals.length}
              </span>
              <button
                type="button"
                onClick={() => updateMealCount(profile.meals.length + 1)}
                disabled={profile.meals.length >= MAX_MEALS}
                className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={autoSplit}
            className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Auto-split evenly
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {profile.meals.map((meal) => (
            <MealCard
              key={meal.id}
              name={meal.name}
              macros={meal.macros}
              onNameChange={(name) => updateMeal(meal.id, { name })}
              onMacrosChange={(macros) => updateMeal(meal.id, { macros })}
            />
          ))}
        </div>
      </section>

      {/* Summary */}
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Meals vs. daily target
          </h2>
          <span
            className={`text-xs font-medium ${
              mealCalories > dailyCalories ? "text-rose-500" : "text-zinc-400"
            }`}
          >
            {mealCalories} / {dailyCalories} kcal
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <ProgressRow
            label="Protein"
            unit="g"
            actual={mealTotals.protein}
            target={profile.dailyTarget.protein}
            barClass="bg-rose-500"
          />
          <ProgressRow
            label="Carbs"
            unit="g"
            actual={mealTotals.carbs}
            target={profile.dailyTarget.carbs}
            barClass="bg-amber-500"
          />
          <ProgressRow
            label="Fat"
            unit="g"
            actual={mealTotals.fat}
            target={profile.dailyTarget.fat}
            barClass="bg-sky-500"
          />
        </div>
      </section>

      <p className="text-center text-xs text-zinc-400">
        Saved locally in this browser for now — accounts &amp; sync come next.
      </p>
    </div>
  );
}
