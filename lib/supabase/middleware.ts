// Keeps the Supabase auth session cookie fresh on every request (tokens
// expire and need silent renewal). Route gating — redirecting a signed-out
// visitor to /login — is added once real login has been tested end-to-end
// against a live Supabase project; today this only refreshes a session if
// one already exists, so it never blocks a visitor.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the session if it's expired — required here because Server
  // Components can't set cookies themselves.
  await supabase.auth.getUser();

  return supabaseResponse;
}
