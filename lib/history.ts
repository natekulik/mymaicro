// Local persistence for the "what actually happened" historical log —
// per-calendar-date overrides layered on top of the Weekly Plan's
// recurring day-of-week template. A date with no override just mirrors
// its day-of-week's current template, computed live rather than
// snapshotted — editing a date for the first time captures its
// then-current state as an explicit override from that point on, so later
// edits to the Weekly Plan template don't retroactively change a day the
// user has already logged/edited.

import type { PlannedMeal, WeeklyPlan } from "./weekly-plan";

export type HistoryDay = {
  date: string; // "YYYY-MM-DD"
  subsections: string[];
  meals: PlannedMeal[];
};

export type HistoryLog = {
  overrides: Record<string, HistoryDay>;
};

const STORAGE_KEY = "mymaicro:historyLog:v1";

export function loadHistoryLog(): HistoryLog {
  if (typeof window === "undefined") return { overrides: {} };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { overrides: {} };
    const parsed = JSON.parse(raw) as HistoryLog;
    return parsed?.overrides ? parsed : { overrides: {} };
  } catch {
    return { overrides: {} };
  }
}

export function saveHistoryLog(log: HistoryLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // Storage can fail (quota, private browsing) — losing autosave isn't
    // worth crashing the page over.
  }
}

const JS_WEEKDAY_TO_DAY_NAME = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Local-time day-of-week for a "YYYY-MM-DD" string — built from
// Date(year, month, day) rather than `new Date(dateStr)`, which parses as
// UTC midnight and can land on the wrong local calendar day depending on
// the viewer's timezone.
export function dayNameForDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return JS_WEEKDAY_TO_DAY_NAME[new Date(y, m - 1, d).getDay()];
}

export function formatDate(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function todayDateString(): string {
  const now = new Date();
  return formatDate(now.getFullYear(), now.getMonth(), now.getDate());
}

export function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// The day as it should display for `date` — an explicit override if the
// user has edited it, otherwise a live read of that date's day-of-week
// template from the Weekly Plan.
export function resolveHistoryDay(log: HistoryLog, date: string, plan: WeeklyPlan): HistoryDay {
  const override = log.overrides[date];
  if (override) return override;
  const template = plan.days.find((d) => d.day === dayNameForDate(date));
  return {
    date,
    subsections: template ? [...template.subsections] : [],
    meals: template ? template.meals.map((m) => ({ ...m })) : [],
  };
}

let idCounter = 0;
function newMealId(): string {
  idCounter += 1;
  return `history-${Date.now()}-${idCounter}`;
}

function withOverride(log: HistoryLog, date: string, day: HistoryDay): HistoryLog {
  return { overrides: { ...log.overrides, [date]: day } };
}

// `current` must be the already-resolved day (via resolveHistoryDay) so an
// edit to a never-touched date captures its full template-derived state as
// the new override, not just the one field being changed.
export function addMealToHistoryDay(
  log: HistoryLog,
  date: string,
  current: HistoryDay,
  subsection: string,
  recipeId: string,
): HistoryLog {
  if (current.meals.some((m) => m.subsection === subsection && m.recipeId === recipeId)) return log;
  return withOverride(log, date, {
    ...current,
    meals: [...current.meals, { id: newMealId(), recipeId, subsection }],
  });
}

export function removeMealFromHistoryDay(
  log: HistoryLog,
  date: string,
  current: HistoryDay,
  mealId: string,
): HistoryLog {
  return withOverride(log, date, { ...current, meals: current.meals.filter((m) => m.id !== mealId) });
}

export function addSubsectionToHistoryDay(
  log: HistoryLog,
  date: string,
  current: HistoryDay,
  name: string,
): HistoryLog {
  const trimmed = name.trim();
  if (!trimmed || current.subsections.includes(trimmed)) return log;
  return withOverride(log, date, { ...current, subsections: [...current.subsections, trimmed] });
}

// Dropping a subsection also drops any meals already logged under it —
// there's nowhere left for them to belong.
export function removeSubsectionFromHistoryDay(
  log: HistoryLog,
  date: string,
  current: HistoryDay,
  subsection: string,
): HistoryLog {
  return withOverride(log, date, {
    ...current,
    subsections: current.subsections.filter((s) => s !== subsection),
    meals: current.meals.filter((m) => m.subsection !== subsection),
  });
}
