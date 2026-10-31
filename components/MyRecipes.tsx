"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import AccountRequiredPage from "./AccountRequiredPage";
import { loadSavedRecipes, removeSavedRecipe, renameSavedRecipe, type SavedRecipe } from "@/lib/saved-recipes";
import { useUser } from "@/lib/supabase/use-user";
import { MICRO_NUTRIENTS, dailyValueLevel } from "@/lib/usda/micro-nutrients";
import {
  addRecipeGroup,
  addRecipeToGroup,
  deleteRecipeGroup,
  loadRecipeGroupAssignments,
  loadRecipeGroups,
  removeRecipeFromGroup,
  renameRecipeGroup,
  saveRecipeGroupAssignments,
  type RecipeGroup,
  type RecipeGroupAssignments,
} from "@/lib/recipe-groups";

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
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [groupAssignments, setGroupAssignments] = useState<RecipeGroupAssignments | null>(null);
  // Which groups are ticked in the group filter dropdown — empty shows
  // every recipe; otherwise a recipe shows if it's in any ticked group.
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [manageGroupsOpen, setManageGroupsOpen] = useState(false);

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
      const [loadedRecipes, loadedGroups, loadedAssignments] = await Promise.all([
        loadSavedRecipes(),
        loadRecipeGroups(),
        loadRecipeGroupAssignments(),
      ]);
      setRecipes(loadedRecipes);
      setGroups(loadedGroups);
      setGroupAssignments(loadedAssignments);
      setLoaded(true);
    })();
  }, [userLoading, user]);

  useEffect(() => {
    if (groupAssignments) void saveRecipeGroupAssignments(groupAssignments);
  }, [groupAssignments]);

  async function handleRemove(id: string) {
    await removeSavedRecipe(id);
    setRecipes((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleRename(id: string, title: string) {
    await renameSavedRecipe(id, title);
    setRecipes((prev) => prev.map((r) => (r.id === id ? { ...r, title } : r)));
  }

  async function handleAddGroup(name: string) {
    const group = await addRecipeGroup(name);
    setGroups((prev) => [...prev, group]);
  }

  async function handleRenameGroup(id: string, name: string) {
    await renameRecipeGroup(id, name);
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }

  // Recipes stay saved — they just drop out of the deleted group. The
  // assignments state change is what re-syncs the join table.
  async function handleDeleteGroup(id: string) {
    await deleteRecipeGroup(id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setSelectedGroupIds((prev) => prev.filter((gid) => gid !== id));
    setGroupAssignments((prev) =>
      prev
        ? Object.fromEntries(
            Object.entries(prev)
              .map(([recipeId, ids]) => [recipeId, ids.filter((gid) => gid !== id)] as const)
              .filter(([, ids]) => ids.length > 0),
          )
        : prev,
    );
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

  const visibleRecipes =
    selectedGroupIds.length > 0
      ? recipes.filter((r) => (groupAssignments?.[r.id] ?? []).some((id) => selectedGroupIds.includes(id)))
      : recipes;
  const selectedGroupNames = groups
    .filter((g) => selectedGroupIds.includes(g.id))
    .map((g) => g.name)
    .join(", ");

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

      {/* Deliberately not a scrolling row: that would clip its own popovers
          (the group dropdown and "+ Add Group") into a tiny window instead
          of letting them float over the recipe cards below. */}
      {loaded && recipes.length > 0 && (
        <div className="relative z-20 flex flex-wrap items-center gap-2">
          <GroupSearchDropdown
            groups={groups}
            selectedGroupIds={selectedGroupIds}
            onChange={setSelectedGroupIds}
          />
          <AddGroupPill onAdd={handleAddGroup} />
          {groups.length > 0 && (
            <button type="button" onClick={() => setManageGroupsOpen(true)} className={PILL_CLASS}>
              Edit Groups
            </button>
          )}
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
          No recipes in &quot;{selectedGroupNames}&quot; yet — open a recipe below and use &quot;+
          Group&quot; to put it here.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visibleRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            onRemove={() => handleRemove(recipe.id)}
            onRename={(title) => handleRename(recipe.id, title)}
            groups={groups}
            assignedGroupIds={groupAssignments?.[recipe.id] ?? []}
            onToggleGroup={(groupId) => handleToggleRecipeGroup(recipe.id, groupId)}
          />
        ))}
      </div>

      {manageGroupsOpen && (
        <ManageGroupsDialog
          groups={groups}
          recipeCounts={Object.fromEntries(
            groups.map((g) => [
              g.id,
              Object.values(groupAssignments ?? {}).filter((ids) => ids.includes(g.id)).length,
            ]),
          )}
          onRename={handleRenameGroup}
          onDelete={handleDeleteGroup}
          onClose={() => setManageGroupsOpen(false)}
        />
      )}
    </div>
  );
}

// The small outlined buttons along the bottom of each recipe card.
const PILL_CLASS =
  "whitespace-nowrap rounded-full border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800";

function MacroInline({ accent, value, letter }: { accent: string; value: number | null; letter: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />
      {value !== null ? Math.round(value) : "—"}g {letter}
    </span>
  );
}

function RecipeCard({
  recipe,
  onRemove,
  onRename,
  groups,
  assignedGroupIds,
  onToggleGroup,
}: {
  recipe: SavedRecipe;
  onRemove: () => void;
  onRename: (title: string) => void;
  groups: RecipeGroup[];
  assignedGroupIds: string[];
  onToggleGroup: (groupId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Esc closes the details pop-up.
  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded]);
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  function startRename() {
    setDraftTitle(recipe.title);
    setRenaming(true);
  }

  // Blank or unchanged names are just dropped, so the title can never be
  // emptied out by accident.
  function commitRename() {
    const title = draftTitle.trim();
    setRenaming(false);
    if (title && title !== recipe.title) onRename(title);
  }

  return (
    <section
      className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <input
              type="text"
              autoFocus
              onFocus={(e) => e.target.select()}
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              aria-label="Recipe name"
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-0.5 text-sm font-semibold text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          ) : (
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              <button
                type="button"
                onClick={startRename}
                title="Click to rename"
                className="block w-full cursor-text text-left decoration-zinc-300 decoration-dotted underline-offset-4 hover:underline"
              >
                {/* Up to two lines; anything longer is cut off with "…" */}
                <span className="line-clamp-2 break-words">{recipe.title}</span>
              </button>
            </h2>
          )}
          <p className="text-[11px] text-zinc-400">
            Makes {recipe.servings} serving{recipe.servings === 1 ? "" : "s"} · macros per serving
          </p>
        </div>
        {/* Two clicks to delete: the first arms it, the second confirms;
            clicking anywhere else disarms it. */}
        <button
          type="button"
          onClick={() => (confirmRemove ? onRemove() : setConfirmRemove(true))}
          onBlur={() => setConfirmRemove(false)}
          aria-label={confirmRemove ? "Confirm remove recipe" : "Remove recipe"}
          title={confirmRemove ? "Click again to remove" : "Remove"}
          className={
            confirmRemove
              ? "shrink-0 rounded-md bg-rose-500 px-2 py-0.5 text-[11px] font-medium text-white"
              : "shrink-0 px-1 text-zinc-300 transition hover:text-rose-500 dark:text-zinc-600"
          }
        >
          {confirmRemove ? "Remove?" : "✕"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
        <span className="font-semibold text-zinc-900 dark:text-zinc-50">
          {recipe.nutrition.calories !== null ? Math.round(recipe.nutrition.calories) : "—"}{" "}
          <span className="font-normal text-zinc-400">cal</span>
        </span>
        <MacroInline accent="bg-rose-500" value={recipe.nutrition.protein} letter="P" />
        <MacroInline accent="bg-amber-500" value={recipe.nutrition.carbs} letter="C" />
        <MacroInline accent="bg-sky-500" value={recipe.nutrition.fat} letter="F" />
      </div>

      {/* mt-auto: cards in the same row stretch to the tallest one, with the
          buttons kept along the bottom edge. */}
      <div className="mt-auto flex flex-wrap items-center gap-1.5">
        <Link href={`/recipe-analysis?edit=${recipe.id}`} className={PILL_CLASS}>
          Edit
        </Link>
        <button type="button" onClick={() => setExpanded((e) => !e)} className={PILL_CLASS}>
          Details {expanded ? "▴" : "▾"}
        </button>
        {groups.length > 0 && (
          <GroupAssignControl groups={groups} assignedGroupIds={assignedGroupIds} onToggle={onToggleGroup} />
        )}
        {recipe.sourceUrl && (
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-400 underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Source
          </a>
        )}
      </div>

      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExpanded(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${recipe.title} details`}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{recipe.title}</h2>
                <p className="text-xs text-zinc-400">
                  Makes {recipe.servings} serving{recipe.servings === 1 ? "" : "s"} · numbers below are per
                  serving
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="shrink-0 rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Close ✕
              </button>
            </div>
            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-4 gap-2">
                <MiniStat label="Calories" value={recipe.nutrition.calories} unit="cals" />
                <MiniStat label="Protein" value={recipe.nutrition.protein} unit="g" accent="bg-rose-500" />
                <MiniStat label="Carbs" value={recipe.nutrition.carbs} unit="g" accent="bg-amber-500" />
                <MiniStat label="Fat" value={recipe.nutrition.fat} unit="g" accent="bg-sky-500" />
              </div>
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
          </div>
        </div>
      )}
    </section>
  );
}

// The group filter: a searchable dropdown with a checkbox per group, so
// any number of groups can be ticked at once (a recipe shows if it's in
// any of them). Nothing ticked means "All Recipes". Stays open while
// ticking so several can be picked in one go.
function GroupSearchDropdown({
  groups,
  selectedGroupIds,
  onChange,
}: {
  groups: RecipeGroup[];
  selectedGroupIds: string[];
  onChange: (groupIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const filtered = groups.filter((g) => g.name.toLowerCase().includes(query.toLowerCase()));
  const selectedGroups = groups.filter((g) => selectedGroupIds.includes(g.id));
  const label =
    selectedGroups.length === 0
      ? "All Recipes"
      : selectedGroups.length === 1
        ? selectedGroups[0].name
        : `${selectedGroups.length} groups`;

  function toggle(groupId: string) {
    onChange(
      selectedGroupIds.includes(groupId)
        ? selectedGroupIds.filter((id) => id !== groupId)
        : [...selectedGroupIds, groupId],
    );
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      >
        {label}
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
        <div className="absolute left-0 top-full z-30 mt-1 w-60 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          <input
            type="text"
            autoFocus
            placeholder="Search groups…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mb-1.5 w-full rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => onChange([])}
                className={`w-full rounded-md px-2 py-1 text-left text-xs ${
                  selectedGroupIds.length === 0
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                All Recipes
              </button>
            </li>
            {filtered.map((g) => (
              <li key={g.id}>
                <label className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.id)}
                    onChange={() => toggle(g.id)}
                    className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800"
                  />
                  <span className="truncate">{g.name}</span>
                </label>
              </li>
            ))}
            {filtered.length === 0 && <li className="px-2 py-1 text-xs text-zinc-400">No groups found.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

// "Edit Groups": rename any group (type over its name; Enter or clicking
// away saves) or delete it (two clicks). Deleting only removes the group —
// the recipes in it stay saved.
function ManageGroupsDialog({
  groups,
  recipeCounts,
  onRename,
  onDelete,
  onClose,
}: {
  groups: RecipeGroup[];
  recipeCounts: Record<string, number>;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function run(action: () => Promise<void>) {
    setError(null);
    try {
      await action();
    } catch {
      setError("Something went wrong — try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit groups"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Edit groups</h2>
            <p className="text-xs text-zinc-400">
              Type over a name to rename it. Deleting a group keeps its recipes.
            </p>
          </div>
          <button type="button" onClick={onClose} className={`${PILL_CLASS} shrink-0`}>
            Done
          </button>
        </div>
        <ul className="flex flex-col gap-2 overflow-y-auto px-5 py-4">
          {groups.map((g) => (
            <GroupEditRow
              key={g.id}
              group={g}
              recipeCount={recipeCounts[g.id] ?? 0}
              onRename={(name) => run(() => onRename(g.id, name))}
              onDelete={() => run(() => onDelete(g.id))}
            />
          ))}
          {groups.length === 0 && <li className="text-xs text-zinc-400">No groups left.</li>}
        </ul>
        {error && <p className="px-5 pb-3 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
    </div>
  );
}

function GroupEditRow({
  group,
  recipeCount,
  onRename,
  onDelete,
}: {
  group: RecipeGroup;
  recipeCount: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Blank or unchanged names snap back to the saved one.
  function commit() {
    const name = draft.trim();
    if (!name || name === group.name) {
      setDraft(group.name);
      return;
    }
    onRename(name);
  }

  return (
    <li className="flex items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setDraft(group.name);
        }}
        aria-label={`Name of group ${group.name}`}
        className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-500"
      />
      <span className="w-16 shrink-0 text-right text-[11px] text-zinc-400">
        {recipeCount} recipe{recipeCount === 1 ? "" : "s"}
      </span>
      <button
        type="button"
        onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
        onBlur={() => setConfirmDelete(false)}
        className={`shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition ${
          confirmDelete
            ? "border-rose-500 bg-rose-500 text-white"
            : "border-zinc-200 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        }`}
      >
        {confirmDelete ? "Delete?" : "Delete"}
      </button>
    </li>
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
          className="absolute left-0 top-full z-30 mt-1 flex w-56 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
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
  const containerRef = useCloseOnOutsideClick<HTMLDivElement>(open, () => setOpen(false));
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const isAssigned = groupId ? assignedGroupIds.includes(groupId) : false;

  return (
    <div ref={containerRef} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title="Add to a group" className={PILL_CLASS}>
        + Group
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 flex w-64 flex-wrap items-center gap-1.5 rounded-xl border border-zinc-200 bg-white p-2.5 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
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
