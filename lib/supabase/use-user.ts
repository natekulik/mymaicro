"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, isMfaPending } from "./client";

// The app is no longer gated behind login (see middleware.ts) — any page
// or component that needs to know whether it's talking to a real account
// or a browsing guest uses this instead of each rolling its own
// supabase.auth.getUser() call. Subscribes to auth changes too, so
// logging in/out in one tab updates everything without a full page nav.
//
// A session that has only passed the password step of an account with an
// authenticator app set up counts as signed OUT here (user is null and
// mfaPending is true) until the code is entered — so the rest of the app
// treats it like a guest, and NavTabs sends it to the login page's code
// step.
export function useUser(): { user: User | null; loading: boolean; mfaPending: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [mfaPending, setMfaPending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    async function resolve(sessionUser: User | null) {
      const pending = sessionUser ? await isMfaPending(supabase) : false;
      if (!active) return;
      setMfaPending(pending);
      setUser(pending ? null : sessionUser);
      setLoading(false);
    }

    supabase.auth.getUser().then(({ data }) => resolve(data.user));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      // Deferred: calling back into supabase.auth from inside this callback
      // can deadlock its internal lock.
      setTimeout(() => void resolve(session?.user ?? null), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading, mfaPending };
}
