// Supabase-backed persistence for macro presets — one row per preset in
// the macro_presets table (see supabase/schema.sql). "+ Add Macro Preset"
// on Daily Macros saves the currently-set daily target + meal split under
// a name the user chooses; "My Macro Presets" then lets that snapshot be
// applied back onto the profile later.

import { createClient } from "./supabase/client";
import { assertNoError, requireUserId } from "./supabase/user";
import { newId, type Macro, type MealSlot } from "./macro";

export type MacroPreset = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  dailyTarget: Macro;
  meals: MealSlot[];
};

const LEGACY_STORAGE_KEY = "mymaicro:macroPresets:v1";

function loadLegacyPresets(): MacroPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MacroPreset[]) : [];
  } catch {
    return [];
  }
}

type PresetRow = {
  id: string;
  name: string;
  created_at: string;
  daily_target: Macro;
  meals: MealSlot[];
};

function fromRow(row: PresetRow): MacroPreset {
  return { id: row.id, name: row.name, createdAt: row.created_at, dailyTarget: row.daily_target, meals: row.meals };
}

export async function loadMacroPresets(): Promise<MacroPreset[]> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("macro_presets")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  assertNoError(error);

  if (data && data.length > 0) return (data as PresetRow[]).map(fromRow);

  const legacy = loadLegacyPresets();
  if (legacy.length > 0) {
    const { error: seedError } = await supabase.from("macro_presets").insert(
      legacy.map((p) => ({
        id: p.id,
        user_id: userId,
        name: p.name,
        created_at: p.createdAt,
        daily_target: p.dailyTarget,
        meals: p.meals,
      })),
    );
    assertNoError(seedError);
  }
  return legacy;
}

export async function saveMacroPreset(name: string, dailyTarget: Macro, meals: MealSlot[]): Promise<MacroPreset> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const preset: MacroPreset = {
    id: `macropreset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    dailyTarget: { ...dailyTarget },
    meals: meals.map((m) => ({ ...m, macros: { ...m.macros } })),
  };
  const { error } = await supabase.from("macro_presets").insert({
    id: preset.id,
    user_id: userId,
    name: preset.name,
    created_at: preset.createdAt,
    daily_target: preset.dailyTarget,
    meals: preset.meals,
  });
  assertNoError(error);
  return preset;
}

export async function removeMacroPreset(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase.from("macro_presets").delete().eq("id", id).eq("user_id", userId);
  assertNoError(error);
}

// The daily target + meals to drop onto the profile when applying a preset
// — a fresh copy with new meal ids, so editing the applied copy later (or
// applying the same preset a second time) never collides with the preset's
// own stored copy.
export function applyMacroPreset(preset: MacroPreset): { dailyTarget: Macro; meals: MealSlot[] } {
  return {
    dailyTarget: { ...preset.dailyTarget },
    meals: preset.meals.map((m) => ({ id: newId(), name: m.name, macros: { ...m.macros } })),
  };
}
