import type { SupabaseClient } from "@supabase/supabase-js";

// Every data module in lib/*.ts is only ever called from behind the login
// gate (see middleware.ts), so a missing session here means something's
// wrong upstream rather than a normal case worth designing around.
export async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in.");
  return data.user.id;
}
