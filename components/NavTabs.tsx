"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2 px-3 py-3 lg:gap-6 lg:px-6 lg:py-4">
        <span className="shrink-0 text-xs font-bold tracking-tight text-zinc-900 dark:text-zinc-50 lg:text-sm">
          mymaicro
        </span>
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
        </nav>
      </div>
    </header>
  );
}
