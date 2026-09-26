// Local persistence for recipe groups — lets the user organize saved
// recipes on My Recipes into named groups for filtering. A recipe can
// belong to more than one group (assignments are per-recipe arrays of
// group ids), same "can belong to several" flexibility as Weekly Plan's
// subsections.

export type RecipeGroup = {
  id: string;
  name: string;
  createdAt: string; // ISO timestamp
};

// recipeId -> group ids that recipe belongs to. Only recipes actually
// assigned to at least one group appear here at all.
export type RecipeGroupAssignments = Record<string, string[]>;

const GROUPS_STORAGE_KEY = "mymaicro:recipeGroups:v1";
const ASSIGNMENTS_STORAGE_KEY = "mymaicro:recipeGroupAssignments:v1";

export function loadRecipeGroups(): RecipeGroup[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GROUPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecipeGroup[]) : [];
  } catch {
    return [];
  }
}

function persistGroups(groups: RecipeGroup[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
  } catch {
    // Storage can fail (quota, private browsing) — losing a save isn't
    // worth crashing the page over.
  }
}

export function addRecipeGroup(name: string): RecipeGroup {
  const group: RecipeGroup = {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    createdAt: new Date().toISOString(),
  };
  persistGroups([...loadRecipeGroups(), group]);
  return group;
}

export function loadRecipeGroupAssignments(): RecipeGroupAssignments {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(ASSIGNMENTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as RecipeGroupAssignments) : {};
  } catch {
    return {};
  }
}

export function saveRecipeGroupAssignments(assignments: RecipeGroupAssignments): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ASSIGNMENTS_STORAGE_KEY, JSON.stringify(assignments));
  } catch {
    // Storage can fail (quota, private browsing) — losing a save isn't
    // worth crashing the page over.
  }
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
