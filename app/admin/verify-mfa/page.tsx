"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Reached after a normal password login, only when that account has a
// verified TOTP factor and this session hasn't completed it yet (see the
// redirect in app/admin/page.tsx). Regular accounts never have a factor
// enrolled, so they never land here — this route exists purely for the
// one admin account's second step.
export default function VerifyMfaPage() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error || !data.totp[0]) {
        // No verified factor (or not signed in at all) — nothing to
        // challenge here, so send them back rather than show a dead end.
        router.replace("/admin");
        return;
      }
      setFactorId(data.totp[0].id);
      setLoading(false);
    })();
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
      if (error) {
        setError("That code didn't match — try the latest one from your authenticator app.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading…</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Verify it&apos;s you</h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Enter the code from your authenticator app to continue to Admin.
        </p>
      </header>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-center text-lg tracking-widest text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
        />
        {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={busy || code.trim().length !== 6}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Verify
        </button>
      </form>
    </div>
  );
}
