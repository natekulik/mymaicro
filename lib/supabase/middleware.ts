// Keeps the Supabase auth session cookie fresh on every request (tokens
// expire and need silent renewal), and gates every page except the auth
// pages themselves behind being logged in. All app data now lives in
// Supabase under Row Level Security, so an unauthenticated visitor
// couldn't load anything useful anyway — redirecting them straight to
// /login is clearer than showing a page full of empty states.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Reachable while signed out — everything else requires a session.
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/forgot-username", "/reset-password"];

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
  // this check trustworthy for gating pages.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.includes(path) || path.startsWith("/api/forgot-username");

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (path === "/login" || path === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
