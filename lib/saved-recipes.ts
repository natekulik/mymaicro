// Local persistence for recipes saved from Macro & Micro Analysis — same
// pattern as lib/storage.ts (the Daily Macros profile): a snapshot of the
// final, already-confirmed numbers, not the live analyze state, so nothing
// here needs the matching/variant/quantity machinery replayed later.

import type { MicroTotals, NutritionMacro } from "./recipe-types";

export type SavedRecipe = {
  id: string;
  title: string;
  sourceUrl: string | null;
  servings: number;
  nutrition: NutritionMacro; // per serving
  micros: MicroTotals; // per serving
  ingredients: string[];
  savedAt: string; // ISO timestamp
};

const STORAGE_KEY = "mymaicro:savedRecipes:v1";

export function loadSavedRecipes(): SavedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRecipe[]) : [];
  } catch {
    return [];
  }
}

function persist(recipes: SavedRecipe[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
  } catch {
    // Storage can fail (quota, private browsing) — losing a save isn't
    // worth crashing the page over.
  }
}

export function saveRecipe(recipe: Omit<SavedRecipe, "id" | "savedAt">): SavedRecipe {
  const saved: SavedRecipe = {
    ...recipe,
    id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  persist([saved, ...loadSavedRecipes()]);
  return saved;
}

export function removeSavedRecipe(id: string): void {
  persist(loadSavedRecipes().filter((r) => r.id !== id));
}

// Overwrites an existing saved recipe in place (same id, so its position
// in Weekly Plan meal assignments — which reference recipes by id — stays
// intact), bumping savedAt to reflect the edit. Returns null if the recipe
// no longer exists (e.g. removed in another tab).
export function updateSavedRecipe(
  id: string,
  patch: Omit<SavedRecipe, "id" | "savedAt">,
): SavedRecipe | null {
  const recipes = loadSavedRecipes();
  const idx = recipes.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const updated: SavedRecipe = { ...patch, id, savedAt: new Date().toISOString() };
  const next = [...recipes];
  next[idx] = updated;
  persist(next);
  return updated;
}
