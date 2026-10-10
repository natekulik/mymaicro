// Keeps the Supabase auth session cookie fresh on every request (tokens
// expire and need silent renewal). Pages are NOT gated here — guests can
// browse and use the app freely; individual pages/components decide for
// themselves what needs an account (see lib/supabase/use-user.ts and
// components/SignUpPrompt.tsx), showing a "create an account" prompt
// only when a guest tries to actually save something.

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
  // Components can't set cookies themselves. Deliberately getUser(), not
  // getSession(): it revalidates against Supabase's auth server rather
  // than trusting a locally-decoded cookie, which is what actually makes
  // this check trustworthy for the one redirect still done here below.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // The only redirect left: an already-logged-in visitor landing on
  // /login or /signup gets sent to the app instead of a form they don't
  // need. Nothing else is gated — see the file header above.
  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
