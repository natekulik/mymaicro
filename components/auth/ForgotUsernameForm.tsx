"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600";

export default function ForgotUsernameForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Always shows the same generic message afterward, whatever the
    // response — this endpoint never reveals which emails have accounts.
    await fetch("/api/forgot-username", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        If an account exists for that email, we&apos;ve sent the username to it.
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
        {loading ? "Sending…" : "Send username"}
      </button>

      <p className="text-center text-xs text-zinc-400">
        <Link href="/login" className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300">
          Back to log in
        </Link>
      </p>
    </form>
  );
}
