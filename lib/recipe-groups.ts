// Supabase-backed persistence for recipe groups — lets the user organize
// saved recipes on My Recipes into named groups for filtering. A recipe
// can belong to more than one group (assignments are a many-to-many join
// table), same "can belong to several" flexibility as Weekly Plan's
// subsections. See supabase/schema.sql for recipe_groups and
// recipe_group_assignments.

import { createClient } from "./supabase/client";
import { assertNoError, requireUserId } from "./supabase/user";

export type RecipeGroup = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
};

// recipeId -> group ids that recipe belongs to. Only recipes actually
// assigned to at least one group appear here at all.
export type RecipeGroupAssignments = Record<string, string[]>;

const LEGACY_GROUPS_KEY = "mymaicro:recipeGroups:v1";
const LEGACY_ASSIGNMENTS_KEY = "mymaicro:recipeGroupAssignments:v1";

function loadLegacyGroups(): RecipeGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LEGACY_GROUPS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecipeGroup[]) : [];
  } catch {
    return [];
  }
}

function loadLegacyAssignments(): RecipeGroupAssignments {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(LEGACY_ASSIGNMENTS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as RecipeGroupAssignments) : {};
  } catch {
    return {};
  }
}

type GroupRow = { id: string; name: string; created_at: string };

export async function loadRecipeGroups(): Promise<RecipeGroup[]> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("recipe_groups")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  assertNoError(error);

  if (data && data.length > 0) {
    return (data as GroupRow[]).map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
  }

  const legacy = loadLegacyGroups();
  if (legacy.length > 0) {
    const { error: seedError } = await supabase
      .from("recipe_groups")
      .insert(legacy.map((g) => ({ id: g.id, user_id: userId, name: g.name, created_at: g.createdAt })));
    assertNoError(seedError);
  }
  return legacy;
}

export async function addRecipeGroup(name: string): Promise<RecipeGroup> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const group: RecipeGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("recipe_groups")
    .insert({ id: group.id, user_id: userId, name: group.name, created_at: group.createdAt });
  assertNoError(error);
  return group;
}

export async function renameRecipeGroup(id: string, name: string): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase.from("recipe_groups").update({ name }).eq("id", id).eq("user_id", userId);
  assertNoError(error);
}

// Deletes the group itself and every recipe's membership in it — the
// recipes stay saved. The assignments table has no foreign key to groups,
// so those rows are cleared explicitly rather than cascading.
export async function deleteRecipeGroup(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error: assignmentsError } = await supabase
    .from("recipe_group_assignments")
    .delete()
    .eq("group_id", id)
    .eq("user_id", userId);
  assertNoError(assignmentsError);
  const { error } = await supabase.from("recipe_groups").delete().eq("id", id).eq("user_id", userId);
  assertNoError(error);
}

export async function loadRecipeGroupAssignments(): Promise<RecipeGroupAssignments> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase
    .from("recipe_group_assignments")
    .select("recipe_id, group_id")
    .eq("user_id", userId);
  assertNoError(error);

  if (data && data.length > 0) {
    const assignments: RecipeGroupAssignments = {};
    for (const row of data as { recipe_id: string; group_id: string }[]) {
      assignments[row.recipe_id] = [...(assignments[row.recipe_id] ?? []), row.group_id];
    }
    return assignments;
  }

  const legacy = loadLegacyAssignments();
  const legacyRows = Object.entries(legacy).flatMap(([recipeId, groupIds]) =>
    groupIds.map((groupId) => ({ user_id: userId, recipe_id: recipeId, group_id: groupId })),
  );
  if (legacyRows.length > 0) {
    const { error: seedError } = await supabase.from("recipe_group_assignments").insert(legacyRows);
    assertNoError(seedError);
  }
  return legacy;
}

// Replaces this user's entire assignment set with `assignments` — simplest
// correct way to sync the whole in-memory map (built by the pure
// add/removeRecipeFromGroup helpers below) back to the join table without
// diffing it row by row, and cheap enough at personal-recipe-list scale.
export async function saveRecipeGroupAssignments(assignments: RecipeGroupAssignments): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { error: deleteError } = await supabase.from("recipe_group_assignments").delete().eq("user_id", userId);
  assertNoError(deleteError);

  const rows = Object.entries(assignments).flatMap(([recipeId, groupIds]) =>
    groupIds.map((groupId) => ({ user_id: userId, recipe_id: recipeId, group_id: groupId })),
  );
  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("recipe_group_assignments").insert(rows);
    assertNoError(insertError);
  }
}

// Puts one (already-saved) recipe into the given groups without touching
// anyone else's assignments — used when a recipe is first saved from the
// analysis page.
export async function assignRecipeToGroups(recipeId: string, groupIds: string[]): Promise<void> {
  if (groupIds.length === 0) return;
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase
    .from("recipe_group_assignments")
    .insert(groupIds.map((groupId) => ({ user_id: userId, recipe_id: recipeId, group_id: groupId })));
  assertNoError(error);
}

export function addRecipeToGroup(
  assignments: RecipeGroupAssignments,
  recipeId: string,
  groupId: string,
): RecipeGroupAssignments {
  const current = assignments[recipeId] ?? [];
  if (current.includes(groupId)) return assignments;
  return { ...assignments, [recipeId]: [...current, groupId] };
}

export function removeRecipeFromGroup(
  assignments: RecipeGroupAssignments,
  recipeId: string,
  groupId: string,
): RecipeGroupAssignments {
  const current = assignments[recipeId] ?? [];
  if (!current.includes(groupId)) return assignments;
  return { ...assignments, [recipeId]: current.filter((id) => id !== groupId) };
}
