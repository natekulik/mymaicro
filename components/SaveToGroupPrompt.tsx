"use client";

import { useEffect, useState, type FormEvent } from "react";
import { addRecipeGroup, loadRecipeGroups, type RecipeGroup } from "@/lib/recipe-groups";

// Shown when "Add to My Recipes" is clicked for a brand-new recipe: asks
// which group(s) it should go in before it's saved. Groups are optional —
// "Save without a group" skips them — and a new group can be made on the
// spot, so a first-time user isn't sent off to My Recipes to set one up.
export default function SaveToGroupPrompt({
  open,
  ...props
}: {
  open: boolean;
  saving: boolean;
  onSave: (groupIds: string[]) => void;
  onClose: () => void;
}) {
  // The inner part only exists while open, so its state (ticks, typed
  // name, loaded groups) starts fresh every time the prompt opens.
  return open ? <SaveToGroupDialog {...props} /> : null;
}

function SaveToGroupDialog({
  saving,
  onSave,
  onClose,
}: {
  saving: boolean;
  onSave: (groupIds: string[]) => void;
  onClose: () => void;
}) {
  const [groups, setGroups] = useState<RecipeGroup[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setGroups(await loadRecipeGroups());
      } catch {
        setGroups([]);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  function toggle(groupId: string) {
    setSelected((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const group = await addRecipeGroup(name);
      setGroups((prev) => [...prev, group]);
      setSelected((prev) => [...prev, group.id]);
      setNewName("");
    } catch {
      setError("Couldn't create that group — try again.");
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={saving ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Add to a group?</h2>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Pick one or more groups to file this recipe under, or save it without one.
        </p>

        {!loaded ? (
          <p className="mt-3 text-xs text-zinc-400">Loading your groups…</p>
        ) : (
          groups.length > 0 && (
            <ul className="mt-3 flex max-h-56 flex-col gap-0.5 overflow-y-auto rounded-xl border border-zinc-200 p-1.5 dark:border-zinc-700">
              {groups.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800">
                    <input
                      type="checkbox"
                      checked={selected.includes(g.id)}
                      onChange={() => toggle(g.id)}
                      className="h-4 w-4 shrink-0 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800"
                    />
                    <span className="truncate">{g.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )
        )}

        <form onSubmit={handleCreate} className="mt-3 flex items-center gap-1.5">
          <input
            type="text"
            placeholder="+ New group name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-700 outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
          />
          <button
            type="submit"
            disabled={!newName.trim()}
            className="whitespace-nowrap rounded-md bg-zinc-700 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-600 disabled:opacity-50 dark:bg-zinc-600 dark:hover:bg-zinc-500"
          >
            Create
          </button>
        </form>
        {error && <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={saving || selected.length === 0}
            onClick={() => onSave(selected)}
            className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {saving
              ? "Saving…"
              : selected.length > 0
                ? `Save to ${selected.length} group${selected.length === 1 ? "" : "s"}`
                : "Save to group"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave([])}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Save without a group
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="text-center text-xs text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
