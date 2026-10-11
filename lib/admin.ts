// Shared "is this the project's own account, fully authenticated" checks
// — used by the Optimize usage cap (app/api/optimize-recipe/route.ts) and
// the admin dashboard (app/admin/*). isAdminEmail is deliberately an env
// var, not a database flag: there's exactly one (or a small handful) of
// these for the foreseeable future, so a schema column and the
// migration/UI to manage it would be solving a problem that doesn't
// exist yet.

import type { SupabaseClient } from "@supabase/supabase-js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

// True once the session has completed whatever Authenticator Assurance
// Level its account requires — i.e. there's either no second factor
// enrolled at all (nextLevel stays 'aal1', nothing to satisfy), or one
// is enrolled and this session has already passed its challenge
// (currentLevel caught up to nextLevel). False for everything else,
// including the check itself failing — admin privileges should never
// be granted on an ambiguous/erroring assurance check.
export async function hasSatisfiedMfa(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === data.currentLevel;
}
