// Supabase client for use in Client Components ("use client" files). Server
// Components and Route Handlers use lib/supabase/server.ts instead — the
// two use different cookie-handling strategies, so they can't share one
// factory.

import { createBrowserClient } from "@supabase/ssr";

// Supabase's browser client persists sessions in localStorage by default,
// which already survives closing the tab/browser — there's no separate
// "remember me" concept to opt into, only one to opt OUT of. So unchecked
// means session-only (sessionStorage, cleared when the browser closes),
// and this key defaults to "remembered" when absent so an existing
// logged-in visitor isn't signed out just because they haven't seen the
// checkbox yet (see components/auth/LoginForm.tsx).
const REMEMBER_ME_KEY = "mymaicro:remember-me";

export function setRememberMe(remember: boolean): void {
  if (typeof window === "undefined") return;
  if (remember) {
    window.localStorage.removeItem(REMEMBER_ME_KEY);
  } else {
    window.localStorage.setItem(REMEMBER_ME_KEY, "false");
  }
}

export function createClient() {
  const remembered =
    typeof window === "undefined" || window.localStorage.getItem(REMEMBER_ME_KEY) !== "false";

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    remembered ? undefined : { auth: { storage: window.sessionStorage } },
  );
}
