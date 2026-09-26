"use client";

type Props = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  accent?: string; // tailwind bg-* class for the little label dot
};

export default function NumberField({ label, value, onChange, accent }: Props) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {accent && <span className={`h-2 w-2 rounded-full ${accent}`} />}
        {label}
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-600"
      />
    </label>
  );
}
