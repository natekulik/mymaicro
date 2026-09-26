// Local persistence for the macro profile. This is intentionally the only
// place that knows about localStorage — swapping this out for real API
// calls once auth + a database exist won't touch any component.

import { DEFAULT_MACRO_COLORS, type MacroProfile } from "./macro";

const STORAGE_KEY = "mymaicro:profile:v1";

export function loadProfile(): MacroProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MacroProfile;
    // Profiles saved before macro colors existed won't have this field —
    // fill it in rather than let every color-reading call site handle
    // `undefined`.
    return { ...parsed, macroColors: { ...DEFAULT_MACRO_COLORS, ...parsed.macroColors } };
  } catch {
    return null;
  }
}

export function saveProfile(profile: MacroProfile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can fail (quota, private browsing) — losing autosave isn't
    // worth crashing the page over.
  }
}
