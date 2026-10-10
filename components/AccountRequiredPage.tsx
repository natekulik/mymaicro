"use client";

import Link from "next/link";

// Full-page swap for a guest landing on a page that's inherently about
// saved data (My Recipes, Weekly Plan) — there's nothing meaningful to
// show without an account (an empty recipe list or an empty week isn't
// useful to explore), so this replaces the page's own loading/data logic
// entirely rather than rendering it with fake local state that would
// just be thrown away on refresh anyway.
export default function AccountRequiredPage({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      <div className="flex gap-2">
        <Link
          href="/signup"
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
