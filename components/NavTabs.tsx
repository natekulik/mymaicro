"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Daily Macros" },
  { href: "/recipe-analysis", label: "Macro & Micro Analysis" },
  { href: "/my-recipes", label: "My Recipes" },
  { href: "/weekly-plan", label: "Weekly Plan" },
];

export default function NavTabs() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-black">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-6 px-6 py-4">
        <span className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          mymaicro
        </span>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
