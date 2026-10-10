"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import AccountRequiredPage from "./AccountRequiredPage";
import { loadSavedRecipes, removeSavedRecipe, type SavedRecipe } from "@/lib/saved-recipes";
import { useUser } from "@/lib/supabase/use-user";
import { MICRO_NUTRIENTS, dailyValueLevel } from "@/lib/usda/micro-nutrients";
import {
  DAY_NAMES,
  addMeal,
  addMealToAllDays,
  loadWeekOverrides,
  loadWeeklyPlan,
  resolveWeekDays,
  saveWeekOverrides,
  type DayPlan,
  type WeekOverrides,
  type WeeklyPlan,
} from "@/lib/weekly-plan";
import { mondayOfDate, todayDateString } from "@/lib/history";
import {
  addRecipeGroup,
  addRecipeToGroup,
  loadRecipeGroupAssignments,
  loadRecipeGroups,
  removeRecipeFromGroup,
  saveRecipeGroupAssignments,
  type RecipeGroup,
  type RecipeGroupAssignments,
} from "@/lib/recipe-groups";

// Sentinel value for the "All days" option in the day picker — distinct
// from any real day name.
const ALL_DAYS_VALUE = "__all__";

// Closes a popover (the group search dropdown, "+ Add Group") on a click
// anywhere outside it — the toggle button that opens it lives inside the
// same ref'd element, so clicking that to open/close it is never
// mistaken for an "outside" click.
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

export default function MyRecipes() {
  const { user, loading: userLoading } = useUser();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [template, setTemplate] = useState<WeeklyPlan | null>(null);
  const [weekOverrides, setWeekOverrides] = useState<WeekOverrides | null>(null);
  // The quick-add here always targets the current calendar week — to plan
  // a different week, use Weekly Plan's own week navigation and add
  // recipes from there instead.
  const [currentWeekStart, setCurrentWeekStart] = useState<string | null>(null);
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<RecipeGroupAssignments | null>(null);
  // Which group's pill is active as a filter — null shows every recipe.
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // This whole page is about saved data — a guest has none, so there's
  // nothing useful to load. The account-required early return below
  // (after all hooks, per the rules of hooks) replaces the rest of the
  // page entirely for guests, rather than rendering it against fake
  // local state that would vanish on refresh anyway.
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (userLoading || loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    (async () => {
      if (!user) {
        setLoaded(true);
        return;
      }
      const [loadedRecipes, loadedTemplate, loadedOverrides, loadedGroups, loadedAssignments] = await Promise.all([
        loadSavedRecipes(),
        loadWeeklyPlan(),
        loadWeekOverrides(),
        loadRecipeGroups(),
        loadRecipeGroupAssignments(),
      ]);
      setRecipes(loadedRecipes);
      setTemplate(loadedTemplate);
      setWeekOverrides(loadedOverrides);
      setCurrentWeekStart(mondayOfDate(todayDateString()));
      setGroups(loadedGroups);
      setGroupAssignments(loadedAssignments);
      setLoaded(true);
    })();
  }, [userLoading, user]);

  useEffect(() => {
    if (weekOverrides) void saveWeekOverrides(weekOverrides);
  }, [weekOverrides]);

  useEffect(() => {
    if (groupAssignments) void saveRecipeGroupAssignments(groupAssignments);
  }, [groupAssignments]);

  const weekDays =
    template && weekOverrides && currentWeekStart
      ? resolveWeekDays(currentWeekStart, template, weekOverrides)
      : null;

  function mutateWeek(updater: (days: DayPlan[]) => DayPlan[]) {
    if (!weekDays || !currentWeekStart) return;
    const nextDays = updater(weekDays);
    setWeekOverrides((prev) => ({ ...(prev ?? {}), [currentWeekStart]: nextDays }));
  }

  async function handleRemove(id: string) {
    await removeSavedRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleAddGroup(name: string) {
    const group = await addRecipeGroup(name);
    setGroups((prev) => [...prev, group]);
  }

  function handleToggleRecipeGroup(recipeId: string, groupId: string) {
    setGroupAssignments((prev) => {
      const current = prev ?? {};
      const has = (current[recipeId] ?? []).includes(groupId);
      return has
        ? removeRecipeFromGroup(current, recipeId, groupId)
        : addRecipeToGroup(current, recipeId, groupId);
    });
  }

  const visibleRecipes = selectedGroupId
    ? recipes.filter((r) => (groupAssignments?.[r.id] ?? []).includes(selectedGroupId))
    : recipes;
  const selectedGroupName = groups.find((g) => g.id === selectedGroupId)?.name;

  if (!userLoading && !user) {
    return (
      <AccountRequiredPage
        title="My recipes"
        description="Create a free account to save recipes from Macro & Micro analysis and organize them into groups."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          My recipes
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Recipes saved from Macro &amp; Micro analysis, with their per-serving breakdown.
        </p>
      </header>

      {loaded && recipes.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <GroupSearchDropdown groups={groups} selectedGroupId={selectedGroupId} onSelect={setSelectedGroupId} />
          {groups.map((group) => {
            const active = selectedGroupId === group.id;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedGroupId(active ? null : group.id)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {group.name}
              </button>
            );
          })}
          <AddGroupPill onAdd={handleAddGroup} />
        </div>
      )}

      {loaded && recipes.length === 0 && (
        <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          Nothing saved yet — analyze a recipe and use &quot;Add to My Recipes&quot; once its
          breakdown is ready to keep it here.
        </p>
      )}

      {loaded && recipes.length > 0 && visibleRecipes.length === 0 && (
        <p className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          No recipes in &quot;{selectedGroupName}&quot; yet — open a recipe below and use &quot;+
          Add to Group&quot; to put it here.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onRemove={() => handleRemove(recipe.id)}
            weekDays={weekDays}
            onAddMeal={(day, subsection) => mutateWeek((days) => addMeal(days, day, subsection, recipe.id))}
            onAddMealAllDays={(subsection) =>
              mutateWeek((days) => addMealToAllDays(days, subsection, recipe.id))
            }
            groups={groups}
            assignedGroupIds={groupAssignments?.[recipe.id] ?? []}
            onToggleGroup={(groupId) => handleToggleRecipeGroup(recipe.id, groupId)}
          />
        ))}
      </div>
    </div>
  );
}

function RecipeCard({
  recipe,
  onRemove,
  weekDays,
  onAddMeal,
  onAddMealAllDays,
  groups,
  assignedGroupIds,
  onToggleGroup,
}: {
  recipe: SavedRecipe;
  onRemove: () => void;
  weekDays: DayPlan[] | null;
  onAddMeal: (day: string, subsection: string) => void;
  onAddMealAllDays: (subsection: string) => void;
  groups: RecipeGroup[];
  assignedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className="grid row-span-5 [grid-template-rows:subgrid] gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          {recipe.title}
        </h2>
        <div className="flex shrink-0 items-center gap-2">
          <span className="whitespace-nowrap text-xs text-zinc-400">
            Makes {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={onRemove}
            className="whitespace-nowrap rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            Remove
          </button>
        </div>
      </div>

      <div className="flex flex-col items-start gap-1">
        <Link
          href={`/recipe-analysis?edit=${recipe.id}`}
          className="whitespace-nowrap rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          Edit Recipe
        </Link>
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

      <div className="grid grid-cols-2 gap-3">
        <MiniStat label="Calories" value={recipe.nutrition.calories} unit="cals" />
        <MiniStat label="Protein" value={recipe.nutrition.protein} unit="g" accent="bg-rose-500" />
        <MiniStat label="Carbs" value={recipe.nutrition.carbs} unit="g" accent="bg-amber-500" />
        <MiniStat label="Fat" value={recipe.nutrition.fat} unit="g" accent="bg-sky-500" />
      </div>

      <div className="flex flex-col items-start gap-2">
        <p className="text-xs text-zinc-400">Per serving.</p>
        <div className="flex flex-wrap items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-1 self-start rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            {expanded ? "Hide details" : "Show ingredients & micros"}
          </button>

          {weekDays && (
            <AddToPlanControl
              recipeId={recipe.id}
              weekDays={weekDays}
              onAdd={onAddMeal}
              onAddAllDays={onAddMealAllDays}
            />
          )}

          {groups.length > 0 && (
            <GroupAssignControl groups={groups} assignedGroupIds={assignedGroupIds} onToggle={onToggleGroup} />
          )}
        </div>
      </div>

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
            <div className="grid grid-cols-2 gap-3">
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

function AddToPlanControl({
  recipeId,
  weekDays,
  onAdd,
  onAddAllDays,
}: {
  recipeId: string;
  weekDays: DayPlan[];
  onAdd: (day: string, subsection: string) => void;
  onAddAllDays: (subsection: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState<string>(DAY_NAMES[0]);
  const dayPlan = weekDays.find((d) => d.day === day);
  // "All days" mode has no single day's subsection list to draw from, so it
  // offers the union of every day's subsections — addAllDays skips any day
  // that doesn't actually have the chosen one.
  const allSubsections = Array.from(new Set(weekDays.flatMap((d) => d.subsections)));
  const isAllDays = day === ALL_DAYS_VALUE;
  const subsectionOptions = isAllDays ? allSubsections : (dayPlan?.subsections ?? []);
  const [subsection, setSubsection] = useState(subsectionOptions[0] ?? "");

  // Already on the day+subsection currently selected — only meaningful for
  // a single day (in "All days" mode it's always a partial fill at worst,
  // never fully blocked, so the button stays enabled there).
  const alreadyOnDay =
    !isAllDays && !!dayPlan?.meals.some((m) => m.subsection === subsection && m.recipeId === recipeId);

  function handleDayChange(nextDay: string) {
    setDay(nextDay);
    const nextOptions =
      nextDay === ALL_DAYS_VALUE
        ? allSubsections
        : (weekDays.find((d) => d.day === nextDay)?.subsections ?? []);
    setSubsection(nextOptions[0] ?? "");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!subsection) return;
    if (isAllDays) {
      onAddAllDays(subsection);
    } else {
      if (alreadyOnDay) return;
      onAdd(day, subsection);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 self-start rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        + Add to This Week
      </button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800"
        >
          <select
            value={day}
            onChange={(e) => handleDayChange(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            <option value={ALL_DAYS_VALUE}>All days</option>
            {DAY_NAMES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            value={subsection}
            onChange={(e) => setSubsection(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {subsectionOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={!subsection || alreadyOnDay}
            className="rounded-md bg-zinc-700 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            {alreadyOnDay ? "Already added" : "Add"}
          </button>
        </form>
      )}
    </div>
  );
}

// The always-first pill in the group row — a searchable dropdown over
// every group, so a group can be picked even once there are too many
// pills to see without scrolling the row.
function GroupSearchDropdown({
  groups,
  selectedGroupId,
  onSelect,
}: {
  groups: RecipeGroup[];
  selectedGroupId: string | null;
  onSelect: (groupId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const selected = groups.find((g) => g.id === selectedGroupId);
  const filtered = groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));

  function choose(groupId: string | null) {
    onSelect(groupId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {selected ? selected.name : "All Recipes"}
        <svg className={`h-3 w-3 text-zinc-400 transition ${open ? "rotate-180" : ""}`} viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 w-52 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="text"
            autoFocus
            placeholder="Search groups…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-1.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => choose(null)}
                className={`w-full rounded-md px-2 py-1 text-left text-xs ${
                  !selectedGroupId
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                All Recipes
              </button>
            </li>
            {filtered.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => choose(g.id)}
                  className={`w-full truncate rounded-md px-2 py-1 text-left text-xs ${
                    selectedGroupId === g.id
                      ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  }`}
                >
                  {g.name}
                </button>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-1 text-xs text-zinc-400">No groups found.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function AddGroupPill({ onAdd }: { onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="whitespace-nowrap rounded-full border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        + Add Group
      </button>
      {open && (
        <form
          onSubmit={handleSubmit}
          className="absolute left-0 top-full z-10 mt-1 flex w-56 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <input
            type="text"
            autoFocus
            placeholder="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="whitespace-nowrap rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}

function GroupAssignControl({
  groups,
  assignedGroupIds,
  onToggle,
}: {
  groups: RecipeGroup[];
  assignedGroupIds: string[];
  onToggle: (groupId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const isAssigned = groupId ? assignedGroupIds.includes(groupId) : false;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 self-start rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        + Add to Group
      </button>

      {open && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-zinc-50 px-2.5 py-2 dark:bg-zinc-800">
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => groupId && onToggle(groupId)}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium text-white transition ${
              isAssigned ? "bg-rose-500 hover:bg-rose-600" : "bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500"
            }`}
          >
            {isAssigned ? "Remove from Group" : "Add"}
          </button>
        </div>
      )}
    </div>
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
