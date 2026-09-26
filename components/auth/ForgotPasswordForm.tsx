"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const supabase = createClient();
      // Never surface whether the email matched an account — same
      // generic message either way, so this can't be used to check which
      // emails have accounts.
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    } catch {
      // createClient() throws synchronously if Supabase isn't configured
      // yet (no .env.local) — see env.example. Still shows the same
      // generic message below, for the same reason as above.
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        If an account exists for that email, we&apos;ve sent a password reset link.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-xs text-zinc-400">
        <Link href="/login" className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
