// Local persistence for the "what actually happened" historical log — the
// most specific of three layers: a per-calendar-date override here beats
// that date's week-specific plan (lib/weekly-plan.ts's WeekOverrides),
// which in turn beats the Weekly Plan's recurring default template. A date
// with no override just mirrors whatever its week resolves to, computed
// live rather than snapshotted — editing a date for the first time
// captures its then-current state as an explicit override from that point
// on, so later edits upstream (that week, or the template) don't
// retroactively change a day the user has already logged/edited.

import { createClient } from "./supabase/client";
import { assertNoError, requireUserId } from "./supabase/user";
import {
  DAY_NAMES,
  resolveWeekDays,
  type PlannedMeal,
  type WeekOverrides,
  type WeeklyPlan,
} from "./weekly-plan";

export type HistoryDay = {
  date: string; // "YYYY-MM-DD"
  subsections: string[];
  meals: PlannedMeal[];
};

export type HistoryLog = {
  overrides: Record<string, HistoryDay>;
};

const LEGACY_STORAGE_KEY = "mymaicro:historyLog:v1";

function loadLegacyHistoryLog(): HistoryLog {
  if (typeof window === "undefined") return { overrides: {} };
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { overrides: {} };
    const parsed = JSON.parse(raw) as HistoryLog;
    return parsed?.overrides ? parsed : { overrides: {} };
  } catch {
    return { overrides: {} };
  }
}

export async function loadHistoryLog(): Promise<HistoryLog> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data, error } = await supabase.from("history_log").select("data").eq("user_id", userId).maybeSingle();
  assertNoError(error);
  if (data) return data.data as HistoryLog;

  const legacy = loadLegacyHistoryLog();
  if (Object.keys(legacy.overrides).length > 0) await saveHistoryLog(legacy);
  return legacy;
}

export async function saveHistoryLog(log: HistoryLog): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  const { error } = await supabase
    .from("history_log")
    .upsert({ user_id: userId, data: log, updated_at: new Date().toISOString() });
  assertNoError(error);
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

// Short "Nov 24" form — for date labels above the Weekly Plan pills and
// the "week of" range below.
export function formatShortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const shifted = new Date(y, m - 1, d + delta);
  return formatDate(shifted.getFullYear(), shifted.getMonth(), shifted.getDate());
}

// The Monday ("YYYY-MM-DD") of the week containing `dateStr` — weeks are
// Monday-first throughout this app, matching DAY_NAMES / the day pill
// order.
export function mondayOfDate(dateStr: string): string {
  const index = DAY_NAMES.indexOf(dayNameForDate(dateStr)); // 0=Monday..6=Sunday
  return addDays(dateStr, -index);
}

export function shiftWeek(weekStart: string, deltaWeeks: number): string {
  return addDays(weekStart, deltaWeeks * 7);
}

// The actual date for the Nth day (0=Monday..6=Sunday) of the week
// starting at `weekStart`.
export function dateForDayIndexInWeek(weekStart: string, dayIndex: number): string {
  return addDays(weekStart, dayIndex);
}

export function formatWeekRangeLabel(weekStart: string): string {
  const weekEnd = addDays(weekStart, 6);
  const [ys] = weekStart.split("-").map(Number);
  const [ye] = weekEnd.split("-").map(Number);
  const startLabel = formatShortDate(weekStart);
  const endLabel = formatShortDate(weekEnd);
  return ys === ye ? `${startLabel} – ${endLabel}, ${ye}` : `${startLabel}, ${ys} – ${endLabel}, ${ye}`;
}

// The day as it should display for `date`: an explicit history override if
// the user has edited that exact date, otherwise whatever its week
// resolves to (that week's own override, or the default template) via
// lib/weekly-plan.ts's resolveWeekDays.
export function resolveHistoryDay(
  log: HistoryLog,
  date: string,
  template: WeeklyPlan,
  weekOverrides: WeekOverrides,
): HistoryDay {
  const override = log.overrides[date];
  if (override) return override;
  const weekDays = resolveWeekDays(mondayOfDate(date), template, weekOverrides);
  const dayPlan = weekDays.find((d) => d.day === dayNameForDate(date));
  return {
    date,
    subsections: dayPlan ? [...dayPlan.subsections] : [],
    meals: dayPlan ? dayPlan.meals.map((m) => ({ ...m })) : [],
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
