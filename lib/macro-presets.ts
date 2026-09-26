// Local persistence for macro presets. Same "named, reusable snapshot"
// pattern as lib/weekly-plan.ts's WeeklyPreset — "+ Add Macro Preset" on
// Daily Macros saves the currently-set daily target + meal split under a
// name the user chooses; "My Macro Presets" then lets that snapshot be
// applied back onto the profile later.

import { newId, type Macro, type MealSlot } from "./macro";

export type MacroPreset = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
  dailyTarget: Macro;
  meals: MealSlot[];
};

const PRESETS_STORAGE_KEY = "mymaicro:macroPresets:v1";

export function loadMacroPresets(): MacroPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MacroPreset[]) : [];
  } catch {
    return [];
  }
}

function persistPresets(presets: MacroPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // Storage can fail (quota, private browsing) — losing a save isn't
    // worth crashing the page over.
  }
}

export function saveMacroPreset(name: string, dailyTarget: Macro, meals: MealSlot[]): MacroPreset {
  const preset: MacroPreset = {
    id: `macropreset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
    dailyTarget: { ...dailyTarget },
    meals: meals.map((m) => ({ ...m, macros: { ...m.macros } })),
  };
  persistPresets([preset, ...loadMacroPresets()]);
  return preset;
}

export function removeMacroPreset(id: string): void {
  persistPresets(loadMacroPresets().filter((p) => p.id !== id));
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
