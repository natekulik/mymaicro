"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  MACRO_KEYS,
  fillRemainingMacro,
  lockedMacroCalories,
  type Macro,
  type MacroColors,
  type MacroProfile,
  calories,
  defaultProfile,
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
import { useUser } from "@/lib/supabase/use-user";
import MealCard from "./MealCard";
import NumberField from "./NumberField";
import ProgressRow from "./ProgressRow";
import SignUpPrompt from "./SignUpPrompt";

const MIN_MEALS = 1;
const MAX_MEALS = 8;

export default function MacroSettings() {
  const { user, loading: userLoading } = useUser();
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
  const [signUpPromptOpen, setSignUpPromptOpen] = useState(false);
  // Order the user filled in the g/lb boxes (oldest first) — only used to
  // decide which one gives way if they fill in a third.
  const [perLbOrder, setPerLbOrder] = useState<(keyof Macro)[]>([]);

  // Load once, as soon as we know whether there's a real account — guests
  // get a local-only default profile (nothing ever hits Supabase for
  // them) so they can freely explore the calculator without one.
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (userLoading || loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    (async () => {
      if (!user) {
        setProfile(defaultProfile());
        setPresets([]);
        return;
      }
      const [loadedProfile, loadedPresets] = await Promise.all([loadProfile(), loadMacroPresets()]);
      setProfile(loadedProfile);
      setPresets(loadedPresets);
    })();
  }, [userLoading, user]);

  // Autosave on every change — guests edit purely in local state, since
  // there's no account to save to (saveProfile would just throw).
  useEffect(() => {
    if (profile && user) void saveProfile(profile);
  }, [profile, user]);

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

  // The g/lb boxes the user has filled in. With two filled in, the third
  // macro is the "auto" one: its grams are whatever's left of the target
  // calories. (Never more than two — filling a third clears the oldest.)
  const lbmCalcOn = profile.leanMassCalcEnabled === true;
  const enteredPerLb = lbmCalcOn ? MACRO_KEYS.filter((k) => profile.gramsPerLb?.[k] != null) : [];
  const autoMacro = enteredPerLb.length === 2 ? (MACRO_KEYS.find((k) => !enteredPerLb.includes(k)) ?? null) : null;
  const leanBodyMass = profile.leanBodyMass && profile.leanBodyMass > 0 ? profile.leanBodyMass : null;
  const targetCalories = profile.calorieTarget ?? dailyCalories;
  const calorieGap = dailyCalories - targetCalories;
  const overTarget =
    autoMacro !== null &&
    profile.calorieTarget != null &&
    lockedMacroCalories(profile.dailyTarget, autoMacro) > profile.calorieTarget;

  // Typing grams directly: the calorie target follows whatever the macros
  // now add up to, and that macro's g/lb box no longer applies.
  function updateMacroGrams(key: keyof Macro, grams: number) {
    setProfile((p) =>
      p
        ? {
            ...p,
            dailyTarget: { ...p.dailyTarget, [key]: grams },
            calorieTarget: null,
            gramsPerLb: { ...p.gramsPerLb, [key]: null },
          }
        : p,
    );
  }

  function updateCalorieTarget(next: number) {
    setProfile((p) =>
      p
        ? {
            ...p,
            calorieTarget: next,
            dailyTarget: autoMacro ? fillRemainingMacro(p.dailyTarget, autoMacro, next) : p.dailyTarget,
          }
        : p,
    );
  }

  // New lean body mass: re-work the grams for any macro the user gave a
  // g/lb figure, then refill the auto macro. The g/lb boxes themselves are
  // left exactly as typed.
  function updateLeanBodyMass(next: number) {
    setProfile((p) => {
      if (!p) return p;
      const mass = next > 0 ? next : null;
      if (!mass || enteredPerLb.length === 0) return { ...p, leanBodyMass: mass };
      const target = p.calorieTarget ?? calories(p.dailyTarget);
      let dailyTarget = { ...p.dailyTarget };
      for (const k of enteredPerLb) dailyTarget[k] = Math.round((p.gramsPerLb?.[k] ?? 0) * mass);
      if (autoMacro) dailyTarget = fillRemainingMacro(dailyTarget, autoMacro, target);
      return { ...p, leanBodyMass: mass, calorieTarget: autoMacro ? target : p.calorieTarget, dailyTarget };
    });
  }

  // `perLb` is null when the user empties the box — the grams are left as
  // they are.
  function updateGramsPerLb(key: keyof Macro, perLb: number | null) {
    if (!leanBodyMass) return;
    if (perLb === null) {
      setProfile((p) => (p ? { ...p, gramsPerLb: { ...p.gramsPerLb, [key]: null } } : p));
      return;
    }
    // Once two others are filled in, the one entered longest ago gives way
    // and becomes the auto-filled macro.
    const others = enteredPerLb.filter((k) => k !== key);
    const kept =
      others.length === 2
        ? [...others].sort((a, b) => perLbOrder.indexOf(b) - perLbOrder.indexOf(a)).slice(0, 1)
        : others;
    const entered = [...kept, key];
    const auto = entered.length === 2 ? (MACRO_KEYS.find((k) => !entered.includes(k)) ?? null) : null;
    setPerLbOrder([...perLbOrder.filter((k) => k !== key), key]);
    setProfile((p) => {
      if (!p) return p;
      const target = p.calorieTarget ?? calories(p.dailyTarget);
      const withKey = { ...p.dailyTarget, [key]: Math.round(perLb * leanBodyMass) };
      const gramsPerLb = { ...p.gramsPerLb, [key]: perLb };
      if (!auto) return { ...p, calorieTarget: target, dailyTarget: withKey, gramsPerLb };
      return {
        ...p,
        calorieTarget: target,
        dailyTarget: fillRemainingMacro(withKey, auto, target),
        gramsPerLb: { ...gramsPerLb, [auto]: null },
      };
    });
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
    if (!user) {
      setSaveOpen(false);
      setSignUpPromptOpen(true);
      return;
    }
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
      setProfile((p) =>
        p
          ? { ...p, dailyTarget: applied.dailyTarget, meals: applied.meals, calorieTarget: null, gramsPerLb: undefined }
          : p,
      );
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <label className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-1 pr-3 pl-3 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Target
              <CalorieTargetInput value={targetCalories} onChange={updateCalorieTarget} />
              cals
            </label>
            <div
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
              title="Calories from the protein, carbs and fat below"
            >
              Macros
              <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                {dailyCalories}
              </span>
              cals
              {calorieGap !== 0 && (
                <span className="text-zinc-400">
                  ({Math.abs(calorieGap)} {calorieGap > 0 ? "over" : "under"})
                </span>
              )}
            </div>
          </div>
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

        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Macros by Lean Body Mass - Calculator
          </h3>
          <ToggleSwitch
            checked={lbmCalcOn}
            onChange={() => setProfile((p) => (p ? { ...p, leanMassCalcEnabled: !p.leanMassCalcEnabled } : p))}
            label="Macros by Lean Body Mass - Calculator"
          />
          <InfoTooltip text="Set your macros by grams per pound of lean body mass. Enter your lean mass, then the g/lb for any two macros — the third fills in to hit your target calories." />
        </div>

        {lbmCalcOn && (
        <div className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Lean body mass (lb)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                placeholder="e.g. 144"
                value={leanBodyMass ?? ""}
                onChange={(e) => updateLeanBodyMass(Number(e.target.value) || 0)}
                className="w-36 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
              />
            </label>
            <p className="min-w-48 flex-1 text-xs text-zinc-400">
              Enter grams per lb of lean body mass for any two macros and the third fills in to
              hit your target calories.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {MACRO_KEYS.map((key) => (
              <PerLbField
                key={key}
                label={`${key[0].toUpperCase()}${key.slice(1)} (g/lb)${leanBodyMass && key === autoMacro ? " · auto" : ""}`}
                color={profile.macroColors[key]}
                disabled={!leanBodyMass}
                placeholder={
                  !leanBodyMass
                    ? "Enter lean mass first"
                    : key === autoMacro
                      ? "Auto-filled"
                      : `Enter ${key} g per lb`
                }
                value={profile.gramsPerLb?.[key] ?? null}
                onChange={(v) => updateGramsPerLb(key, v)}
              />
            ))}
          </div>
          {overTarget && (
            <p className="text-xs font-medium text-rose-500">
              Your other two macros already use{" "}
              {lockedMacroCalories(profile.dailyTarget, autoMacro)} cals — more than your{" "}
              {profile.calorieTarget} cal target, so {autoMacro} is set to 0.
            </p>
          )}
        </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <NumberField
            label="Protein (g)"
            color={profile.macroColors.protein}
            value={profile.dailyTarget.protein}
            onChange={(v) => updateMacroGrams("protein", v)}
          />
          <NumberField
            label="Carbs (g)"
            color={profile.macroColors.carbs}
            value={profile.dailyTarget.carbs}
            onChange={(v) => updateMacroGrams("carbs", v)}
          />
          <NumberField
            label="Fat (g)"
            color={profile.macroColors.fat}
            value={profile.dailyTarget.fat}
            onChange={(v) => updateMacroGrams("fat", v)}
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
            <InfoTooltip text="If you want to hit specific macros per meal, fill out the meals below — you can then track against them for each meal slot from the Plan tab. Leave this off if you only care about your daily total." />
            <span className="text-xs text-zinc-400">For very specific diets only</span>
          </div>
          {profile.mealsEnabled && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-zinc-200 py-0.5 pr-1 pl-3 dark:border-zinc-800">
                <span className="whitespace-nowrap text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Number of meals
                </span>
                <button
                  type="button"
                  aria-label="Fewer meals"
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
                  aria-label="More meals"
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

      {!user && (
        <p className="text-center text-xs text-zinc-400">
          Browsing as a guest — changes here won&apos;t be saved.{" "}
          <button
            type="button"
            onClick={() => setSignUpPromptOpen(true)}
            className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Create an account
          </button>{" "}
          to keep them.
        </p>
      )}

      <SignUpPrompt
        open={signUpPromptOpen}
        onClose={() => setSignUpPromptOpen(false)}
        message="Create a free account to save your macro targets and presets so they're here next time you visit."
      />
    </div>
  );
}

// The target-calories box in the pill. Keeps the typed text in local state
// while editing so the field can be emptied (a plain number input pinned to
// 0 turns "1800" into "01800"); shows the real value again once it loses
// focus.
function CalorieTargetInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label="Target calories"
      value={draft ?? value}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(Math.max(0, Number(e.target.value) || 0));
      }}
      onBlur={() => setDraft(null)}
      className="w-16 bg-transparent text-right text-sm font-semibold text-zinc-900 outline-none [appearance:textfield] dark:text-zinc-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
    />
  );
}

// A grams-per-lb box. Keeps what's being typed in local state while it's
// being edited, so a half-typed "0." isn't rewritten out from under the
// user; otherwise it shows what the user last entered (blank until then).
function PerLbField({
  label,
  color,
  value,
  disabled,
  placeholder,
  onChange,
}: {
  label: string;
  color: string;
  value: number | null;
  disabled: boolean;
  placeholder: string;
  onChange: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === null ? "" : String(value));
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.05}
        disabled={disabled}
        placeholder={placeholder}
        value={shown}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value);
          if (e.target.value === "") onChange(null);
          else if (!Number.isNaN(n) && n >= 0) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
      />
    </label>
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
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-in-out ${
        checked ? "bg-[#34C759]" : "bg-zinc-200 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// Closes on a click anywhere outside the icon/popover pair — same pattern
// used for the group popovers on My Recipes.
function useCloseOnOutsideClick<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, onClose]);
  return ref;
}

function InfoTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More info"
        className="flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[10px] font-medium text-zinc-400 transition hover:border-zinc-400 hover:text-zinc-500 dark:border-zinc-600 dark:text-zinc-500 dark:hover:border-zinc-500 dark:hover:text-zinc-400"
      >
        i
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-2 w-64 rounded-xl border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {text}
        </div>
      )}
    </div>
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
