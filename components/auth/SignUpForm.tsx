"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600";
const labelClass = "flex flex-col gap-1";
const labelTextClass = "text-xs font-medium text-zinc-500 dark:text-zinc-400";

export default function SignUpForm() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

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
      const { error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim(), phone: phone.trim() } },
      });

      if (signUpError) {
        setError(
          signUpError.message.includes("duplicate") ? "That username is already taken." : signUpError.message,
        );
        return;
      }
      setSubmitted(true);
    } catch {
      // createClient() throws synchronously if Supabase isn't configured
      // yet (no .env.local) — see env.example.
      setError("Accounts aren't set up yet on this server.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-300">
        Check <span className="font-medium">{email}</span> for a confirmation link, then{" "}
        <Link href="/login" className="underline decoration-dotted hover:text-zinc-900 dark:hover:text-zinc-50">
          log in
        </Link>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className={labelClass}>
        <span className={labelTextClass}>Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Phone number</span>
        <input
          type="tel"
          required
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Username</span>
        <input
          type="text"
          required
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Password</span>
        <input
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Confirm password</span>
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
        {loading ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-xs text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300">
          Log in
        </Link>
      </p>
    </form>
  );
}
