"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type Status = "loading" | "unenrolled" | "enrolling" | "enrolled";

// Lives on /admin, reachable only by the admin account (see
// app/admin/page.tsx's server-side gate) — lets that one account enroll
// a TOTP authenticator app as a second factor. Once a verified factor
// exists, app/admin/page.tsx and app/api/optimize-recipe/route.ts both
// require it (via lib/admin.ts's hasSatisfiedMfa) for every future
// session, not just as a one-time setup step.
export default function AdminMfaSetup() {
  const [status, setStatus] = useState<Status>("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [removeArmed, setRemoveArmed] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) {
        setError(error.message);
        setStatus("unenrolled");
        return;
      }
      const verified = data.totp[0];
      if (verified) {
        setFactorId(verified.id);
        setStatus("enrolled");
      } else {
        setStatus("unenrolled");
      }
    })();
  }, []);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      // A half-finished enrollment from an earlier attempt leaves an
      // unverified factor behind — clear it first so re-opening this
      // panel a few times doesn't pile up orphaned factors.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      const stale = existing?.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
      if (stale) await supabase.auth.mfa.unenroll({ factorId: stale.id });

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "mymaicro admin",
      });
      if (error || !data) {
        setError(error?.message ?? "Couldn't start enrollment.");
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setStatus("enrolling");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerify(e: FormEvent) {
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
      setCode("");
      setQrCode(null);
      setSecret(null);
      setStatus("enrolled");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!factorId) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) {
        setError(error.message);
        return;
      }
      setFactorId(null);
      setRemoveArmed(false);
      setStatus("unenrolled");
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 text-sm text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
        Checking two-factor status…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">Two-factor authentication</h2>

      {status === "enrolled" && (
        <>
          <p className="text-sm text-emerald-600 dark:text-emerald-400">
            Enabled — this account needs your authenticator app to reach Admin.
          </p>
          {!removeArmed ? (
            <button
              type="button"
              onClick={() => setRemoveArmed(true)}
              className="self-start text-xs text-zinc-400 transition hover:text-rose-500"
            >
              Remove two-factor authentication
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 dark:bg-rose-950/40">
              <span className="text-xs text-rose-600 dark:text-rose-300">
                Remove two-factor authentication? This account will only need a password to sign in.
              </span>
              <button
                type="button"
                onClick={handleRemove}
                disabled={busy}
                className="whitespace-nowrap rounded-md bg-rose-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                Confirm remove
              </button>
              <button
                type="button"
                onClick={() => setRemoveArmed(false)}
                className="text-xs text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      {status === "unenrolled" && (
        <>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Not enabled — anyone with this account&apos;s password alone can reach Admin. Scan a QR code with
            an authenticator app (Google Authenticator, 1Password, Authy) to add a second step.
          </p>
          <button
            type="button"
            onClick={startEnroll}
            disabled={busy}
            className="self-start rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Set up two-factor authentication
          </button>
        </>
      )}

      {status === "enrolling" && qrCode && (
        <form onSubmit={handleVerify} className="flex flex-col gap-3">
          {/* qr_code is raw SVG markup from Supabase's own enroll()
              response (trusted, not user input) — rendered directly
              rather than wrapped in a data: URI, which failed to parse
              as an image in testing (showed as a broken-image icon). */}
          <div
            aria-label="Scan with your authenticator app"
            className="h-40 w-40 self-start overflow-hidden rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-700 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: qrCode }}
          />
          {secret && (
            <p className="text-xs text-zinc-400">
              Can&apos;t scan it? Enter this key manually: <span className="font-mono">{secret}</span>
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
              Enter the 6-digit code from your app
            </span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
            />
          </label>
          <button
            type="submit"
            disabled={busy || code.trim().length !== 6}
            className="self-start rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Confirm
          </button>
        </form>
      )}

      {error && <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
