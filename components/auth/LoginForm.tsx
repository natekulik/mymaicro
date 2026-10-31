"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient, isMfaPending, setRememberMe } from "@/lib/supabase/client";
import PasswordInput from "./PasswordInput";

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
  // Set once the password is accepted for an account with an authenticator
  // app — the form then swaps to the 6-digit code step. Only the admin
  // account ever has a factor, so everyone else logs in as before.
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Landing here with a password-only session (closed the tab mid-login,
  // or got bounced here from another page) goes straight to the code step.
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        if (await isMfaPending(supabase)) await startMfaStep(supabase);
      } catch {
        // Supabase not configured — the normal form's own error covers it.
      }
    })();
  }, []);

  async function startMfaStep(supabase: ReturnType<typeof createClient>) {
    const { data } = await supabase.auth.mfa.listFactors();
    const factor = data?.totp[0];
    if (!factor) {
      setError("Couldn't find your authenticator setup. Try logging in again.");
      await supabase.auth.signOut();
      return;
    }
    setMfaFactorId(factor.id);
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    if (!mfaFactorId) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId,
        code: code.trim(),
      });
      if (verifyError) {
        setError("That code didn't match — try the latest one from your authenticator app.");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function cancelMfa() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setMfaFactorId(null);
    setCode("");
    setError(null);
    router.refresh();
  }

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
      if (await isMfaPending(supabase)) {
        await startMfaStep(supabase);
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

  if (mfaFactorId) {
    return (
      <form onSubmit={handleVerify} className="flex flex-col gap-3">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enter the 6-digit code from your authenticator app to finish logging in.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${inputClass} text-center text-lg tracking-widest`}
        />
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || code.trim().length !== 6}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
        <button
          type="button"
          onClick={cancelMfa}
          className="text-xs text-zinc-400 underline decoration-dotted hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Cancel and sign out
        </button>
      </form>
    );
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
        <PasswordInput
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
