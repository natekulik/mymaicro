"use client";

import type { MatchStatus } from "@/lib/macro";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  color?: string; // CSS color for the little label dot — user-customizable, so a raw value rather than a Tailwind class
  // Whether this macro's meal-total exactly matches the daily target —
  // "match" tints the box green, "mismatch" (under OR over) tints it red.
  // Omitted entirely for inputs this doesn't apply to (the daily target
  // boxes themselves, which are the target rather than a total against it).
  status?: MatchStatus;
};

// Darker/more saturated than a typical subtle tint — the user is
// red-green color blind and a pastel red/green pair was too close to tell
// apart, so both sides are pushed harder here.
const STATUS_CLASSES: Record<MatchStatus, string> = {
  match:
    "border-emerald-600 bg-emerald-200 text-emerald-950 dark:border-emerald-500 dark:bg-emerald-900/70 dark:text-emerald-50 focus:border-emerald-700 dark:focus:border-emerald-400",
  mismatch:
    "border-rose-600 bg-rose-200 text-rose-950 dark:border-rose-500 dark:bg-rose-900/70 dark:text-rose-50 focus:border-rose-700 dark:focus:border-rose-400",
};

export default function NumberField({ label, value, onChange, color, status }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />}
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition ${
          status
            ? STATUS_CLASSES[status]
            : "border-zinc-200 bg-white text-zinc-900 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
        }`}
      />
    </label>
  );
}
