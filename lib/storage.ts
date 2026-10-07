// Supabase-backed persistence for the macro profile — one JSONB row per
// user in the macro_profiles table (see supabase/schema.sql). The first
// time a signed-in user has no row yet, this seeds it from whatever this
// browser had saved pre-accounts (localStorage), so nothing already on
// this device gets silently dropped when they log in for the first time.

import { createClient } from "./supabase/client";
import { requireUserId } from "./supabase/user";
import { DEFAULT_MACRO_COLORS, defaultProfile, type MacroProfile } from "./macro";

const LEGACY_STORAGE_KEY = "mymaicro:profile:v1";

function loadLegacyProfile(): MacroProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
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

export async function loadProfile(): Promise<MacroProfile> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);

  const { data } = await supabase.from("macro_profiles").select("data").eq("user_id", userId).maybeSingle();
  if (data) {
    const profile = data.data as MacroProfile;
    return { ...profile, macroColors: { ...DEFAULT_MACRO_COLORS, ...profile.macroColors } };
  }

  const initial = loadLegacyProfile() ?? defaultProfile();
  await saveProfile(initial);
  return initial;
}

export async function saveProfile(profile: MacroProfile): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId(supabase);
  await supabase
    .from("macro_profiles")
    .upsert({ user_id: userId, data: profile, updated_at: new Date().toISOString() });
}
