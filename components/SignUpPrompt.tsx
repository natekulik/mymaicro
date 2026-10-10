"use client";

import Link from "next/link";

// Shown instead of (not after a failed attempt at) a save action for
// guests — every save-triggering call site checks useUser() first and
// opens this rather than letting a Supabase call fail. `message` says
// what specifically needed an account, so the prompt reads as relevant
// to what the person just tried to do rather than a generic wall.
export default function SignUpPrompt({
  open,
  onClose,
  message,
}: {
  open: boolean;
  onClose: () => void;
  message: string;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Create a free account
        </h2>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">{message}</p>
        <div className="mt-4 flex gap-2">
          <Link
            href="/signup"
            className="flex-1 rounded-full bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Sign up
          </Link>
          <Link
            href="/login"
            className="flex-1 rounded-full border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Log in
          </Link>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full text-center text-xs text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
