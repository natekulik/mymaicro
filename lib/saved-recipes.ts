// Supabase-backed persistence for recipes saved from Macro & Micro
// Analysis — one row per recipe in the saved_recipes table (see
// supabase/schema.sql). A snapshot of the final, already-confirmed
// numbers, not the live analyze state, so nothing here needs the
// matching/variant/quantity machinery replayed later.

import { createClient } from "./supabase/client";
import { requireUserId } from "./supabase/user";
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

const LEGACY_STORAGE_KEY = "mymaicro:savedRecipes:v1";

function loadLegacyRecipes(): SavedRecipe[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedRecipe[]) : [];
  } catch {
    return [];
  }
}

type RecipeRow = {
  id: string;
  title: string;
  source_url: string | null;
  servings: number;
  nutrition: NutritionMacro;
  micros: MicroTotals;
  ingredients: string[];
  saved_at: string;
};

function fromRow(row: RecipeRow): SavedRecipe {
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url,
    servings: row.servings,
    nutrition: row.nutrition,
    micros: row.micros,
    ingredients: row.ingredients,
    savedAt: row.saved_at,
  };
}

function toRow(recipe: SavedRecipe, userId: string) {
  return {
    id: recipe.id,
    user_id: userId,
    title: recipe.title,
    source_url: recipe.sourceUrl,
    servings: recipe.servings,
    nutrition: recipe.nutrition,
    micros: recipe.micros,
    ingredients: recipe.ingredients,
    saved_at: recipe.savedAt,
  };
}

export async function loadSavedRecipes(): Promise<SavedRecipe[]> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data } = await supabase
    .from("saved_recipes")
    .select("*")
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (data && data.length > 0) return (data as RecipeRow[]).map(fromRow);

  const legacy = loadLegacyRecipes();
  if (legacy.length > 0) {
    await supabase.from("saved_recipes").insert(legacy.map((r) => toRow(r, userId)));
  }
  return legacy;
}

export async function saveRecipe(recipe: Omit<SavedRecipe, "id" | "savedAt">): Promise<SavedRecipe> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const saved: SavedRecipe = {
    ...recipe,
    id: `recipe-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
  };
  await supabase.from("saved_recipes").insert(toRow(saved, userId));
  return saved;
}

export async function removeSavedRecipe(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  await supabase.from("saved_recipes").delete().eq("id", id).eq("user_id", userId);
}

// Overwrites an existing saved recipe in place (same id, so its position
// in Weekly Plan meal assignments — which reference recipes by id — stays
// intact), bumping savedAt to reflect the edit. Returns null if the recipe
// no longer exists (e.g. removed in another tab).
export async function updateSavedRecipe(
  id: string,
  patch: Omit<SavedRecipe, "id" | "savedAt">,
): Promise<SavedRecipe | null> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const updated: SavedRecipe = { ...patch, id, savedAt: new Date().toISOString() };
  const { data } = await supabase
    .from("saved_recipes")
    .update(toRow(updated, userId))
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (!data || data.length === 0) return null;
  return updated;
}
