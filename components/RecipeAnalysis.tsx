"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  IngredientMacroDetail,
  MicroTotals,
  NutritionMacro,
  RecipeResult,
  VariantOption,
} from "@/lib/recipe-types";
import { MICRO_NUTRIENTS, dailyValueLevel } from "@/lib/usda/micro-nutrients";
import { saveRecipe } from "@/lib/saved-recipes";

type Mode = "url" | "manual";
type NutrientView = "macros" | "micros";

// The everyday-relevant subset shown before the user expands to the full
// nutrient list — sized to match the 4-card macro grid it sits next to.
const CONDENSED_MICRO_KEYS = ["sodium", "fiber", "fatSaturated", "cholesterol"];

// What a variant swap or a quantity recompute overrides on a detail row —
// merged over the original for both display and total recomputation.
type Override = Partial<
  Pick<
    IngredientMacroDetail,
    | "macros"
    | "micros"
    | "grams"
    | "matchedDescription"
    | "gramsSource"
    | "needsQuantity"
    | "fdcId"
  >
>;

const RECOMPUTE_UNITS = [
  { value: "g", label: "grams" },
  { value: "oz", label: "ounces" },
  { value: "cup", label: "cups" },
  { value: "tbsp", label: "tbsp" },
  { value: "tsp", label: "tsp" },
  { value: "ml", label: "ml" },
  { value: "lb", label: "pounds" },
];

function pendingConfirmationMessage(
  quantityCount: number,
  variantCount: number,
  needsServings: boolean,
): string {
  const parts: string[] = [];
  if (needsServings) {
    parts.push(`enter how many servings this makes (above)`);
  }
  if (quantityCount > 0) {
    parts.push(`fill in the amount for ${quantityCount} ingredient${quantityCount === 1 ? "" : "s"}`);
  }
  if (variantCount > 0) {
    parts.push(`confirm the "which kind?" choice for ${variantCount} ingredient${variantCount === 1 ? "" : "s"}`);
  }
  return `Just ${parts.join(", and ")} below to see the macro and micro breakdown.`;
}

// Shared by the Macros and Micros views — each is independently "not
// ready" for its own reason (a URL recipe can have published macros ready
// immediately while its ingredient-estimated micros still need a variant
// confirmed).
function unreadyMessage(
  hasPendingConfirmation: boolean,
  needsServings: boolean,
  pendingQuantityCount: number,
  pendingVariantCount: number,
): string {
  if (hasPendingConfirmation || needsServings) {
    return pendingConfirmationMessage(pendingQuantityCount, pendingVariantCount, needsServings);
  }
  return "None of these ingredients could be matched and converted to a gram weight, so there's nothing to show here. The ingredient list below is still what was found.";
}

export default function RecipeAnalysis() {
  const [mode, setMode] = useState<Mode>("url");

  const [url, setUrl] = useState("");

  const [manualTitle, setManualTitle] = useState("");
  const [manualText, setManualText] = useState("");
  const [manualServings, setManualServings] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipeResult | null>(null);
  const [overrides, setOverrides] = useState<Record<number, Override>>({});
  // Keyed by ingredient index — true once the user has explicitly clicked
  // Confirm on that ingredient's "Which kind?" picker for whatever's
  // currently selected. Starts false even for the auto-picked default, and
  // flips back to false the moment the selection changes again.
  const [confirmedVariants, setConfirmedVariants] = useState<Record<number, boolean>>({});
  const [nutrientView, setNutrientView] = useState<NutrientView>("macros");
  // The single source of truth for "how many servings" from this point on
  // — seeded from whatever the source/form provided, but always editable
  // right in the results, since that's the one number every per-serving
  // figure on this page depends on.
  const [servingsInput, setServingsInput] = useState("");
  // True right after "Add to My Recipes" is clicked for the current
  // result — just for the button's brief "Saved ✓" feedback.
  const [justSaved, setJustSaved] = useState(false);

  const effectiveServings = servingsInput.trim() ? Number(servingsInput) : null;
  const hasValidServings = effectiveServings !== null && effectiveServings > 0;

  async function runAnalyze(endpoint: string, payload: unknown) {
    setLoading(true);
    setError(null);
    setResult(null);
    setOverrides({});
    setConfirmedVariants({});
    setNutrientView("macros");
    setServingsInput("");
    setJustSaved(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as RecipeResult & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Something went wrong analyzing that.");
        return;
      }
      setResult(data);
      setServingsInput(data.servings && data.servings > 0 ? String(data.servings) : "");
    } catch {
      setError("Something went wrong reaching the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleUrlSubmit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    runAnalyze("/api/analyze-recipe", { url });
  }

  function handleManualSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manualText.trim()) return;
    runAnalyze("/api/analyze-recipe-manual", {
      title: manualTitle,
      text: manualText,
      servings: manualServings ? Number(manualServings) : undefined,
    });
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setResult(null);
    setOverrides({});
    setConfirmedVariants({});
    setNutrientView("macros");
    setServingsInput("");
    setJustSaved(false);
  }

  const isEstimated = result ? !result.nutrition && !!result.estimatedNutrition : false;

  const effectiveDetails = useMemo<IngredientMacroDetail[]>(() => {
    if (!result) return [];
    return result.ingredientDetails.map((d, i) => ({ ...d, ...overrides[i] }));
  }, [result, overrides]);

  // Recomputed locally from effectiveDetails whenever an override changes,
  // so picking a variant or filling in a quantity updates the totals
  // immediately with no extra round trip.
  const nutrition = useMemo<NutritionMacro | null>(() => {
    if (!result) return null;
    if (result.nutrition) return result.nutrition; // schema.org nutrition is already per-serving
    if (!isEstimated || !hasValidServings) return null;

    const resolved = effectiveDetails.filter((d) => d.macros !== null);
    if (resolved.length === 0) return null;

    const total = resolved.reduce(
      (acc, d) => ({
        calories: acc.calories + (d.macros!.calories ?? 0),
        protein: acc.protein + (d.macros!.protein ?? 0),
        carbs: acc.carbs + (d.macros!.carbs ?? 0),
        fat: acc.fat + (d.macros!.fat ?? 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
    return {
      calories: total.calories / effectiveServings!,
      protein: total.protein / effectiveServings!,
      carbs: total.carbs / effectiveServings!,
      fat: total.fat / effectiveServings!,
    };
  }, [result, effectiveDetails, isEstimated, hasValidServings, effectiveServings]);

  // Micros always come from ingredient matching against USDA data — even
  // for a URL recipe whose macros were published by the source, since
  // sites rarely publish more than a handful of micro fields (see
  // PUBLISHED_MICRO_FIELDS server-side). Same reactive-recompute pattern
  // as `nutrition` above, so switching a variant or filling in a quantity
  // updates the micros view too.
  const micros = useMemo<MicroTotals | null>(() => {
    if (!result || !hasValidServings) return null;

    const resolved = effectiveDetails.filter((d) => d.micros !== null);
    if (resolved.length === 0) return null;

    const total: MicroTotals = {};
    for (const d of resolved) {
      for (const [key, value] of Object.entries(d.micros!)) {
        total[key] = (total[key] ?? 0) + value;
      }
    }
    const perServing: MicroTotals = {};
    for (const [key, value] of Object.entries(total)) {
      perServing[key] = value / effectiveServings!;
    }
    return perServing;
  }, [result, effectiveDetails, hasValidServings, effectiveServings]);

  const matchedCount = effectiveDetails.filter((d) => d.macros !== null).length;
  // Don't show a breakdown that's silently missing whatever's in the
  // still-unfilled "needs amount" boxes, or still reflecting a "which
  // kind?" choice the user hasn't explicitly confirmed yet — wait until
  // both are resolved before producing a number at all. These apply to
  // micros regardless of whether macros were published, since micros are
  // always estimated from the ingredient list.
  const pendingQuantityCount = effectiveDetails.filter((d) => d.needsQuantity).length;
  const pendingVariantCount = effectiveDetails.filter(
    (d, i) => d.variantOptions.length > 0 && !confirmedVariants[i],
  ).length;
  const hasPendingConfirmation = pendingQuantityCount > 0 || pendingVariantCount > 0;
  // Only worth prompting for servings if there's actually something to
  // divide once it's filled in — otherwise the "none matched" message
  // below is the honest one. Not tied to macro-publish status: micros
  // need servings even when macros were already published.
  const needsServings = !hasValidServings && matchedCount > 0;
  // Macros: published bypasses the confirm/servings gate entirely (it's
  // already a finished, per-serving number from the source). Estimated
  // macros need the same gate micros always need.
  const macrosReady = nutrition !== null && !(isEstimated && hasPendingConfirmation);
  const microsReady = micros !== null && !hasPendingConfirmation;
  const canShowToggle = macrosReady || microsReady || hasPendingConfirmation || needsServings;

  function applyVariant(index: number, variant: VariantOption) {
    setOverrides((prev) => ({
      ...prev,
      [index]: {
        macros: variant.macros,
        micros: variant.micros,
        matchedDescription: variant.description,
        fdcId: variant.fdcId,
      },
    }));
    // Any change to the selection — including switching back to what was
    // already confirmed — requires a fresh confirm before it counts again.
    setConfirmedVariants((prev) => ({ ...prev, [index]: false }));
  }

  function confirmVariant(index: number) {
    setConfirmedVariants((prev) => ({ ...prev, [index]: true }));
  }

  function applyQuantity(index: number, grams: number, macros: NutritionMacro, micros: MicroTotals) {
    setOverrides((prev) => ({
      ...prev,
      [index]: { macros, micros, grams, needsQuantity: false, gramsSource: "unit_conversion" },
    }));
  }

  // Only callable once both macrosReady and microsReady are true (see the
  // disabled prop on the button below), so everything here is always a
  // real value — this snapshots the final, already-confirmed numbers
  // rather than the live analyze state.
  function handleSaveRecipe() {
    if (!result || !nutrition || !micros || !effectiveServings) return;
    saveRecipe({
      title: result.title,
      sourceUrl: result.sourceUrl,
      servings: effectiveServings,
      nutrition,
      micros,
      ingredients: result.ingredients,
    });
    setJustSaved(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Macro &amp; Micro analysis
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {mode === "url"
            ? "Paste a link to a recipe to pull its ingredients and per-serving macros and micros."
            : "Type or paste in a recipe's ingredients to estimate its per-serving macro and micro breakdown from USDA food data."}
        </p>
      </header>

      <div className="flex items-center gap-1 self-start rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => switchMode("url")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            mode === "url"
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Recipe URL
        </button>
        <button
          type="button"
          onClick={() => switchMode("manual")}
          className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
            mode === "manual"
              ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          Manual Entry
        </button>
      </div>

      {mode === "url" ? (
        <form
          onSubmit={handleUrlSubmit}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Recipe URL</span>
            <input
              type="url"
              required
              placeholder="https://example.com/spaghetti-recipe"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
            />
          </label>
          <button
            type="submit"
            disabled={loading}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "Analyzing…" : "Analyze"}
          </button>
          <SaveRecipeButton disabled={!(macrosReady && microsReady)} saved={justSaved} onClick={handleSaveRecipe} />
        </form>
      ) : (
        <form
          onSubmit={handleManualSubmit}
          className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Recipe name (optional)
              </span>
              <input
                type="text"
                placeholder="Grandma's spaghetti"
                value={manualTitle}
                onChange={(e) => setManualTitle(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
              />
            </label>
            <label className="flex w-full flex-col gap-1 sm:w-32">
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Servings (optional)
              </span>
              <input
                type="number"
                min={1}
                placeholder="4"
                value={manualServings}
                onChange={(e) => setManualServings(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Ingredients &amp; recipe text
            </span>
            <textarea
              required
              rows={6}
              placeholder={"2 cups flour\n1 tsp salt\n3 eggs\n..."}
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {loading ? "Analyzing…" : "Analyze"}
            </button>
            <SaveRecipeButton disabled={!(macrosReady && microsReady)} saved={justSaved} onClick={handleSaveRecipe} />
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                  {result.title}
                </h2>
                {result.sourceUrl && (
                  <a
                    href={result.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
                  >
                    View source
                  </a>
                )}
              </div>
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-zinc-400">
                Makes
                <input
                  type="number"
                  min={1}
                  placeholder="?"
                  value={servingsInput}
                  onChange={(e) => setServingsInput(e.target.value)}
                  className={`w-12 rounded-md border bg-white px-1.5 py-0.5 text-center text-xs text-zinc-700 outline-none dark:bg-zinc-900 dark:text-zinc-200 ${
                    needsServings
                      ? "border-amber-300 dark:border-amber-800"
                      : "border-zinc-200 dark:border-zinc-700"
                  }`}
                />
                serving{effectiveServings === 1 ? "" : "s"}
              </label>
            </div>

            {canShowToggle && (
              <div className="flex items-center gap-1 self-start rounded-full border border-zinc-200 p-1 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => setNutrientView("macros")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    nutrientView === "macros"
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  Macros
                </button>
                <button
                  type="button"
                  onClick={() => setNutrientView("micros")}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    nutrientView === "micros"
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  }`}
                >
                  Micros
                </button>
              </div>
            )}

            {nutrientView === "macros" ? (
              macrosReady ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MacroStat label="Calories" value={nutrition!.calories} unit="kcal" />
                  <MacroStat label="Protein" value={nutrition!.protein} unit="g" accent="bg-rose-500" />
                  <MacroStat label="Carbs" value={nutrition!.carbs} unit="g" accent="bg-amber-500" />
                  <MacroStat label="Fat" value={nutrition!.fat} unit="g" accent="bg-sky-500" />
                </div>
              ) : (
                <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                  {unreadyMessage(hasPendingConfirmation, needsServings, pendingQuantityCount, pendingVariantCount)}
                </p>
              )
            ) : microsReady ? (
              <MicrosView micros={micros} />
            ) : (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                {unreadyMessage(hasPendingConfirmation, needsServings, pendingQuantityCount, pendingVariantCount)}
              </p>
            )}

            {nutrientView === "macros" && macrosReady && (
              <p className="text-xs text-zinc-400">
                {isEstimated
                  ? `Per serving, estimated from ${matchedCount} of ${result.ingredientDetails.length} ingredients (USDA food data) — see the breakdown below.`
                  : "Per serving, as published by the source."}
              </p>
            )}
            {nutrientView === "micros" && microsReady && (
              <p className="text-xs text-zinc-400">
                {`Per serving, estimated from ${matchedCount} of ${result.ingredientDetails.length} ingredients (USDA food data) — see the breakdown below.`}
              </p>
            )}
          </section>

          {effectiveDetails.length > 0 && (
            <IngredientBreakdown
              details={effectiveDetails}
              confirmedVariants={confirmedVariants}
              onVariantChange={applyVariant}
              onVariantConfirm={confirmVariant}
              onQuantityResolved={applyQuantity}
            />
          )}

          {result.ingredients.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Ingredients
              </h3>
              <ul className="flex flex-col gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
                {result.ingredients.map((ingredient, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                    {ingredient}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SaveRecipeButton({
  disabled,
  saved,
  onClick,
}: {
  disabled: boolean;
  saved: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Finish the macro and micro breakdown above to save this recipe" : undefined}
      className="whitespace-nowrap rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {saved ? "Saved to My Recipes ✓" : "Add to My Recipes"}
    </button>
  );
}

function MacroStat({
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
  // Only ever set for micros (see MicrosView) — macro cards never pass
  // this, so their appearance is unchanged.
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

function MicrosView({ micros }: { micros: MicroTotals | null }) {
  const [expanded, setExpanded] = useState(false);
  const values = micros ?? {};
  const condensed = MICRO_NUTRIENTS.filter((def) => CONDENSED_MICRO_KEYS.includes(def.key));
  const visible = expanded ? MICRO_NUTRIENTS : condensed;

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${
          expanded ? "max-h-72 overflow-y-auto pr-1" : ""
        }`}
      >
        {visible.map((def) => {
          const value = values[def.key] ?? null;
          return (
            <MacroStat
              key={def.key}
              label={def.label}
              value={value}
              unit={def.unit}
              level={value !== null ? dailyValueLevel(def.key, value) : null}
            />
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          {expanded ? "Minimize" : `Show all ${MICRO_NUTRIENTS.length} nutrients`}
        </button>
        <p className="text-right text-[10px] leading-tight text-zinc-400">
          “High” / “Low” based on FDA Daily Values for a 2,000-calorie diet.
        </p>
      </div>
    </div>
  );
}

function IngredientBreakdown({
  details,
  confirmedVariants,
  onVariantChange,
  onVariantConfirm,
  onQuantityResolved,
}: {
  details: IngredientMacroDetail[];
  confirmedVariants: Record<number, boolean>;
  onVariantChange: (index: number, variant: VariantOption) => void;
  onVariantConfirm: (index: number) => void;
  onQuantityResolved: (index: number, grams: number, macros: NutritionMacro, micros: MicroTotals) => void;
}) {
  const matched = details.filter((d) => d.grams !== null).length;

  // Attention-needed ingredients (an unfilled amount, or an unconfirmed
  // "which kind?") float to the top; everything else stays in the order it
  // was pulled from the recipe. `i` is always the *original* index — it's
  // what the confirm/change/resolve callbacks below are keyed on — so only
  // the display order changes here, nothing about how those callbacks
  // address a specific ingredient.
  const ordered = details
    .map((d, i) => ({ d, i }))
    .sort((a, b) => Number(needsAttention(b.d, b.i)) - Number(needsAttention(a.d, a.i)));

  function needsAttention(d: IngredientMacroDetail, i: number): boolean {
    return d.needsQuantity || (d.variantOptions.length > 0 && !confirmedVariants[i]);
  }

  return (
    <details
      open
      id="ingredient-breakdown"
      className="group rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <summary className="cursor-pointer list-none text-sm font-semibold text-zinc-900 marker:content-none dark:text-zinc-50">
        <span className="inline-flex items-center gap-1.5">
          How this was calculated
          <span className="text-xs font-normal text-zinc-400">
            ({matched}/{details.length} ingredients matched)
          </span>
          <svg
            className="h-3.5 w-3.5 text-zinc-400 transition group-open:rotate-180"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M2.5 4.5L6 8l3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>
      <ul className="mt-3 flex flex-col gap-3 text-xs">
        {ordered.map(({ d, i }) => (
          <li
            key={i}
            className="flex flex-col gap-1.5 border-t border-zinc-100 pt-3 first:border-t-0 first:pt-0 dark:border-zinc-800"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="text-zinc-600 dark:text-zinc-300">{d.raw}</span>
              <StatusBadge detail={d} />
            </div>
            {d.matchedDescription && !d.needsQuantity && (
              <span className="text-zinc-400">
                matched: {d.matchedDescription}
                {d.grams !== null && <> — {Math.round(d.grams)}g</>}
                {d.matchSource &&
                  ` (${d.matchSource === "foundation" ? "USDA Foundation" : "USDA SR Legacy"})`}
              </span>
            )}

            {d.variantOptions.length > 0 && (
              <VariantPicker
                detail={d}
                confirmed={!!confirmedVariants[i]}
                onChange={(variant) => onVariantChange(i, variant)}
                onConfirm={() => onVariantConfirm(i)}
              />
            )}

            {d.needsQuantity && (
              <QuantityPrompt
                detail={d}
                onResolved={(grams, macros, micros) => onQuantityResolved(i, grams, macros, micros)}
              />
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function StatusBadge({ detail }: { detail: IngredientMacroDetail }) {
  if (detail.needsQuantity) {
    return (
      <span className="whitespace-nowrap font-medium text-amber-600 dark:text-amber-400">
        needs amount
      </span>
    );
  }
  if (detail.grams !== null) {
    const label = detail.gramsSource === "usda_portion" ? "matched" : "matched (converted)";
    const tone =
      detail.matchConfidence === "low"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";
    return <span className={`whitespace-nowrap font-medium ${tone}`}>{label}</span>;
  }
  if (detail.matchedDescription) {
    return (
      <span className="whitespace-nowrap font-medium text-amber-600 dark:text-amber-400">
        found, no quantity
      </span>
    );
  }
  return <span className="whitespace-nowrap font-medium text-zinc-400">no match</span>;
}

function VariantPicker({
  detail,
  confirmed,
  onChange,
  onConfirm,
}: {
  detail: IngredientMacroDetail;
  confirmed: boolean;
  onChange: (variant: VariantOption) => void;
  onConfirm: () => void;
}) {
  // Prefer matching by fdcId (the reliable identifier); description is
  // only a fallback in case a variant swap ever puts the two out of sync.
  const currentFdcId =
    detail.variantOptions.find((v) => v.fdcId === detail.fdcId)?.fdcId ??
    detail.variantOptions.find((v) => v.description === detail.matchedDescription)?.fdcId ??
    detail.variantOptions[0]?.fdcId;

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg px-2.5 py-2 transition-colors ${
        confirmed ? "bg-zinc-50 dark:bg-zinc-800" : "bg-amber-50 dark:bg-amber-950/40"
      }`}
    >
      <label className="flex items-center gap-2 text-xs">
        <span
          className={`whitespace-nowrap font-medium ${
            confirmed ? "text-zinc-500 dark:text-zinc-400" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          Which kind?
        </span>
        <select
          value={currentFdcId}
          onChange={(e) => {
            const variant = detail.variantOptions.find((v) => v.fdcId === Number(e.target.value));
            if (variant) onChange(variant);
          }}
          className={`flex-1 rounded-md border bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:bg-zinc-900 dark:text-zinc-200 ${
            confirmed
              ? "border-zinc-200 dark:border-zinc-700"
              : "border-amber-200 dark:border-amber-900"
          }`}
        >
          {detail.variantOptions.map((v) => (
            <option key={v.fdcId} value={v.fdcId}>
              {v.label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirmed}
          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:cursor-default disabled:bg-emerald-600 disabled:opacity-100 dark:bg-amber-500 dark:hover:bg-amber-600 dark:disabled:bg-emerald-600"
        >
          {confirmed ? "Confirmed ✓" : "Confirm"}
        </button>
        {!confirmed && (
          <span className="text-amber-600 dark:text-amber-400">
            Confirm to include this ingredient in the totals.
          </span>
        )}
      </div>
    </div>
  );
}

function QuantityPrompt({
  detail,
  onResolved,
}: {
  detail: IngredientMacroDetail;
  onResolved: (grams: number, macros: NutritionMacro, micros: MicroTotals) => void;
}) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState(detail.suggestedUnit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const quantity = Number(amount);
    if (!detail.fdcId || !quantity || quantity <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recompute-ingredient", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fdcId: detail.fdcId, quantity, unit }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Couldn't compute that amount.");
        return;
      }
      onResolved(data.grams, data.macros, data.micros ?? {});
    } catch {
      setError("Something went wrong reaching the server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 dark:bg-amber-950/40">
      <div className="flex items-center gap-2 text-xs">
        <span className="whitespace-nowrap font-medium text-amber-700 dark:text-amber-400">
          {detail.matchedDescription ? "How much did you use?" : "What is this?"}
        </span>
        {detail.matchedDescription && (
          <span className="truncate text-amber-600/70 dark:text-amber-400/60">
            ({detail.matchedDescription})
          </span>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          step="any"
          required
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-amber-900 dark:bg-zinc-900 dark:text-zinc-200"
        />
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-amber-900 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {RECOMPUTE_UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading || !detail.fdcId}
          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:opacity-50 dark:bg-amber-500 dark:hover:bg-amber-600"
        >
          {loading ? "…" : "Update"}
        </button>
      </div>
      {!detail.fdcId && (
        <span className="text-amber-600 dark:text-amber-400">
          No matching food found for this ingredient — nothing to compute yet.
        </span>
      )}
      {error && <span className="text-rose-600 dark:text-rose-400">{error}</span>}
    </form>
  );
}
