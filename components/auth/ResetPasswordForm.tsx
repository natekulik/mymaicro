"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600";

// Reached from the link in the password-reset email. Supabase's browser
// client reads the recovery token out of the URL on load and establishes
// a temporary session for it — this form just needs to call
// updateUser({ password }) against that session.
export default function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setDone(true);
    } catch {
      // createClient() throws synchronously if Supabase isn't configured
      // yet (no .env.local) — see env.example.
      setError("Accounts aren't set up yet on this server.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Password updated —{" "}
        <Link href="/login" className="underline decoration-dotted hover:text-zinc-900 dark:hover:text-zinc-50">
          log in
        </Link>{" "}
        with your new password.
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">New password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Confirm new password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
