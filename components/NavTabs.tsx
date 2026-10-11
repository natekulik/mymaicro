"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/supabase/use-user";

// `short` is what renders below the `lg` breakpoint (1024px) — six full
// labels, "Macro & Micro Analysis" especially, don't fit on one line
// below that even with the tightest padding. `label` takes over once
// there's room, so the tab strip compresses/expands with the viewport
// rather than wrapping to a second row or needing to scroll.
const TABS = [
  { href: "/", label: "Daily Macros", short: "Macros" },
  { href: "/recipe-analysis", label: "Macro & Micro Analysis", short: "Analysis" },
  { href: "/my-recipes", label: "My Recipes", short: "Recipes" },
  { href: "/weekly-plan", label: "Plan", short: "Plan" },
];

// Auth pages are reachable while signed out and render their own
// single-column layout — the main tab strip and account controls (which
// all assume a logged-in user) don't belong there.
const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/forgot-username", "/reset-password"];

export default function NavTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();
  const [username, setUsername] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const isAuthPage = AUTH_PATHS.includes(pathname);

  useEffect(() => {
    (async () => {
      if (!user) {
        setUsername(null);
        return;
      }
      const supabase = createClient();
      const { data } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
      setUsername(data?.username ?? null);
    })();
  }, [user]);

  // ADMIN_EMAILS only exists server-side (no NEXT_PUBLIC_ prefix, by
  // design — see lib/admin.ts), so this is the only way a Client
  // Component can know whether to show the Admin tab at all.
  useEffect(() => {
    (async () => {
      if (!user) {
        setIsAdmin(false);
        return;
      }
      const res = await fetch("/api/admin/is-admin");
      const data = await res.json();
      setIsAdmin(!!data.isAdmin);
    })();
  }, [user]);

  async function handleLogOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div
        className={`mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-3 lg:gap-6 lg:px-6 lg:py-4 ${
          isAuthPage ? "justify-center" : "justify-between"
        }`}
      >
        <div className="flex items-center gap-2 lg:gap-6">
          <span className="shrink-0 text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-sm">
            mymaicro
          </span>
          {!isAuthPage && (
            <nav className="flex items-center gap-0.5 lg:gap-1">
              {TABS.map((tab) => {
                const active = pathname === tab.href;
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`whitespace-nowrap rounded-full px-1.5 py-1 text-[11px] font-medium transition lg:px-3.5 lg:py-1.5 lg:text-sm ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                        : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span className="lg:hidden">{tab.short}</span>
                    <span className="hidden lg:inline">{tab.label}</span>
                  </Link>
                );
              })}
              {isAdmin && (
                <Link
                  href="/admin"
                  className={`whitespace-nowrap rounded-full px-1.5 py-1 text-[11px] font-medium transition lg:px-3.5 lg:py-1.5 lg:text-sm ${
                    pathname === "/admin"
                      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                      : "text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                  }`}
                >
                  Admin
                </Link>
              )}
            </nav>
          )}
        </div>
        {!isAuthPage && user && (
          <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-1 pl-1 pr-2 dark:border-zinc-700 lg:gap-2 lg:py-1.5 lg:pl-1.5 lg:pr-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-white dark:bg-zinc-50 dark:text-zinc-900 lg:h-6 lg:w-6 lg:text-xs">
                {username ? username.charAt(0).toUpperCase() : "…"}
              </span>
              <span className="max-w-[8rem] truncate text-[11px] font-medium text-zinc-600 dark:text-zinc-300 lg:text-xs">
                {username ?? "Account"}
              </span>
            </div>
            <button
              type="button"
              onClick={handleLogOut}
              className="whitespace-nowrap rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:px-3 lg:py-1.5 lg:text-xs"
            >
              Log out
            </button>
          </div>
        )}
        {!isAuthPage && !user && (
          <div className="flex shrink-0 items-center gap-1.5 lg:gap-2">
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-500 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 lg:px-3 lg:py-1.5 lg:text-xs"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="whitespace-nowrap rounded-full bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 lg:px-3 lg:py-1.5 lg:text-xs"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
