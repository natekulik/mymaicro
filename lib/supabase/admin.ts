// Service-role Supabase client — bypasses Row Level Security entirely.
// NEVER import this from a Client Component or anything that reaches the
// browser bundle; it must only run inside Route Handlers or Server
// Actions. The key lives in SUPABASE_SERVICE_ROLE_KEY (no NEXT_PUBLIC_
// prefix), so Next.js never ships it to client code.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
