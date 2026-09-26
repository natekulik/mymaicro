// Supabase client for use in Client Components ("use client" files). Server
// Components and Route Handlers use lib/supabase/server.ts instead — the
// two use different cookie-handling strategies, so they can't share one
// factory.

import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
