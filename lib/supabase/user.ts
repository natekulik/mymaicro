import type { SupabaseClient } from "@supabase/supabase-js";

// Every data module in lib/*.ts is only ever called from behind the login
// gate (see middleware.ts), so a missing session here means something's
// wrong upstream rather than a normal case worth designing around.
export async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Not signed in.");
  return data.user.id;
}

// Every write in lib/*.ts calls this right after — Supabase doesn't throw
// on a failed insert/update/delete, it just returns `{ error }`, so
// without this a failed write (an RLS denial, a bad column, a dropped
// connection) silently looks like it succeeded and the caller moves on as
// if the data were saved.
export function assertNoError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
