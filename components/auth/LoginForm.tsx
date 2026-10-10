"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient, setRememberMe } from "@/lib/supabase/client";

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600";
const labelClass = "flex flex-col gap-1";
const labelTextClass = "text-xs font-medium text-zinc-500 dark:text-zinc-400";

export default function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Has to happen before createClient() — it reads this preference at
      // creation time to pick localStorage (persists past closing the
      // browser) vs sessionStorage (cleared when it closes) as the
      // session's storage backend.
      setRememberMe(remember);
      const supabase = createClient();
      const trimmed = identifier.trim();

      // Accept either a username or an email — resolve a bare username to
      // its email first, since Supabase Auth only signs in by email.
      let email = trimmed;
      if (!trimmed.includes("@")) {
        const { data, error: lookupError } = await supabase.rpc("get_email_by_username", {
          lookup_username: trimmed,
        });
        if (lookupError || !data) {
          setError("Incorrect username/email or password.");
          return;
        }
        email = data;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Incorrect username/email or password.");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      // createClient() throws synchronously if Supabase isn't configured
      // yet (no .env.local) — see env.example.
      setError("Accounts aren't set up yet on this server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className={labelClass}>
        <span className={labelTextClass}>Username or email</span>
        <input
          type="text"
          required
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className={labelTextClass}>Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
        Remember me
      </label>

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-1 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {loading ? "Logging in…" : "Log in"}
      </button>

      <div className="flex flex-col items-center gap-1 text-xs text-zinc-400">
        <span>
          <Link href="/forgot-password" className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300">
            Forgot password?
          </Link>
          {" · "}
          <Link href="/forgot-username" className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300">
            Forgot username?
          </Link>
        </span>
        <span>
          No account?{" "}
          <Link href="/signup" className="underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300">
            Sign up
          </Link>
        </span>
      </div>
    </form>
  );
}
