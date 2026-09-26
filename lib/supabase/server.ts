// Supabase client for Server Components, Server Actions, and Route
// Handlers — reads/writes the session via Next.js's cookie store. Client
// Components use lib/supabase/client.ts instead.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component, which can't set cookies —
            // middleware.ts refreshes the session on the next request
            // instead, so this is safe to ignore here.
          }
        },
      },
    },
  );
}
