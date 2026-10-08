"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  type Macro,
  type MacroColors,
  type MacroProfile,
  calories,
  macroMatchStatus,
  newId,
  splitEvenly,
  sumMacros,
} from "@/lib/macro";
import {
  applyMacroPreset,
  loadMacroPresets,
  removeMacroPreset,
  saveMacroPreset,
  type MacroPreset,
} from "@/lib/macro-presets";
import { loadProfile, saveProfile } from "@/lib/storage";
import MealCard from "./MealCard";
import NumberField from "./NumberField";
import ProgressRow from "./ProgressRow";

const MIN_MEALS = 1;
const MAX_MEALS = 8;

export default function MacroSettings() {
  const [profile, setProfile] = useState<MacroProfile | null>(null);
  const [colorsOpen, setColorsOpen] = useState(false);
  // Saved macro presets ("+ Add Macro Preset" / "My Macro Presets") —
  // reusable daily target + meal-split snapshots, same save/apply pattern
  // as Plan's weekly presets.
  const [presets, setPresets] = useState<MacroPreset[]>([]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  // Two-click confirm for applying a preset, keyed by preset id.
  const [presetArmedId, setPresetArmedId] = useState<string | null>(null);

  // Load once on mount.
  useEffect(() => {
    (async () => {
      const [loadedProfile, loadedPresets] = await Promise.all([loadProfile(), loadMacroPresets()]);
      setProfile(loadedProfile);
      setPresets(loadedPresets);
    })();
  }, []);

  // Autosave on every change.
  useEffect(() => {
    if (profile) void saveProfile(profile);
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
  const macroStatus = macroMatchStatus(mealTotals, profile.dailyTarget);

  function updateDailyTarget(next: Macro) {
    setProfile((p) => (p ? { ...p, dailyTarget: next } : p));
  }

  function updateMacroColor(key: keyof MacroColors, value: string) {
    setProfile((p) => (p ? { ...p, macroColors: { ...p.macroColors, [key]: value } } : p));
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

  function toggleMealsEnabled() {
    setProfile((p) => (p ? { ...p, mealsEnabled: !p.mealsEnabled } : p));
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

  async function handleSavePreset(name: string) {
    if (!profile) return;
    const preset = await saveMacroPreset(name, profile.dailyTarget, profile.meals);
    setPresets((prev) => [preset, ...prev]);
    setSaveOpen(false);
  }

  async function handleDeletePreset(id: string) {
    await removeMacroPreset(id);
    setPresets((prev) => prev.filter((p) => p.id !== id));
    if (presetArmedId === id) setPresetArmedId(null);
  }

  function handleApplyPresetClick(preset: MacroPreset) {
    if (presetArmedId === preset.id) {
      const applied = applyMacroPreset(preset);
      setProfile((p) => (p ? { ...p, dailyTarget: applied.dailyTarget, meals: applied.meals } : p));
      setPresetArmedId(null);
    } else {
      setPresetArmedId(preset.id);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Daily macros
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Set your daily macro targets, then split them across however many meals you eat.
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
            + Add Macro Preset
          </button>
          <button
            type="button"
            onClick={() => {
              setPresetsOpen((o) => !o);
              setSaveOpen(false);
            }}
            className="whitespace-nowrap rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            My Macro Presets{presets.length > 0 ? ` (${presets.length})` : ""}
          </button>
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

      {/* Daily target */}
      <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Daily target</h2>
            <button
              type="button"
              onClick={() => setColorsOpen((o) => !o)}
              className="rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Choose colors
            </button>
          </div>
          <span className="text-sm font-medium text-zinc-400">{dailyCalories} cals</span>
        </div>

        {colorsOpen && (
          <div className="flex flex-wrap items-center gap-4 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
            <ColorPickerField
              label="Protein"
              value={profile.macroColors.protein}
              onChange={(v) => updateMacroColor("protein", v)}
            />
            <ColorPickerField
              label="Carbs"
              value={profile.macroColors.carbs}
              onChange={(v) => updateMacroColor("carbs", v)}
            />
            <ColorPickerField
              label="Fat"
              value={profile.macroColors.fat}
              onChange={(v) => updateMacroColor("fat", v)}
            />
            <p className="text-xs text-zinc-400">
              These colors also show up on your Maicro Plan.
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <NumberField
            label="Protein (g)"
            color={profile.macroColors.protein}
            value={profile.dailyTarget.protein}
            onChange={(v) => updateDailyTarget({ ...profile.dailyTarget, protein: v })}
          />
          <NumberField
            label="Carbs (g)"
            color={profile.macroColors.carbs}
            value={profile.dailyTarget.carbs}
            onChange={(v) => updateDailyTarget({ ...profile.dailyTarget, carbs: v })}
          />
          <NumberField
            label="Fat (g)"
            color={profile.macroColors.fat}
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
              Macro Specific Meals
            </h2>
            <ToggleSwitch
              checked={profile.mealsEnabled}
              onChange={toggleMealsEnabled}
              label="Macro specific meals"
            />
          </div>
          {profile.mealsEnabled && (
            <div className="flex items-center gap-3">
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
              <button
                type="button"
                onClick={autoSplit}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Auto-split evenly
              </button>
            </div>
          )}
        </div>

        {profile.mealsEnabled ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {profile.meals.map((meal) => (
              <MealCard
                key={meal.id}
                name={meal.name}
                macros={meal.macros}
                macroColors={profile.macroColors}
                macroStatus={macroStatus}
                onNameChange={(name) => updateMeal(meal.id, { name })}
                onMacrosChange={(macros) => updateMeal(meal.id, { macros })}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-zinc-200 p-4 text-xs text-zinc-400 dark:border-zinc-700">
            Off — only your daily target above is tracked. Turn this on if you want to split it
            across specific meals instead.
          </p>
        )}
      </section>

      {/* Summary */}
      {profile.mealsEnabled && (
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
              {mealCalories} / {dailyCalories} cals
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <ProgressRow
              label="Protein"
              unit="g"
              actual={mealTotals.protein}
              target={profile.dailyTarget.protein}
              color={profile.macroColors.protein}
            />
            <ProgressRow
              label="Carbs"
              unit="g"
              actual={mealTotals.carbs}
              target={profile.dailyTarget.carbs}
              color={profile.macroColors.carbs}
            />
            <ProgressRow
              label="Fat"
              unit="g"
              actual={mealTotals.fat}
              target={profile.dailyTarget.fat}
              color={profile.macroColors.fat}
            />
          </div>
        </section>
      )}

      <p className="text-center text-xs text-zinc-400">
        Saved locally in this browser for now — accounts &amp; sync come next.
      </p>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${
        checked ? "bg-zinc-900 dark:bg-zinc-50" : "bg-zinc-200 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform dark:bg-zinc-900 ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ColorPickerField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-7 cursor-pointer rounded-md border border-zinc-200 bg-transparent p-0 dark:border-zinc-700"
      />
      {label}
    </label>
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
        Save your current daily target and meal split as a reusable preset you can apply again
        later from &quot;My Macro Presets&quot;.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="text"
          autoFocus
          placeholder="Preset name (e.g. Cutting)"
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
  presets: MacroPreset[];
  armedId: string | null;
  onApply: (preset: MacroPreset) => void;
  onDelete: (id: string) => void;
}) {
  if (presets.length === 0) {
    return (
      <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-400 dark:bg-zinc-800">
        No presets saved yet — use &quot;+ Add Macro Preset&quot; to save your current targets
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
                {armed ? "Click again to confirm" : "Apply preset"}
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
