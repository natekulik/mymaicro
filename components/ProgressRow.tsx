type Props = {
  label: string;
  actual: number;
  target: number;
  unit: string;
  color: string; // CSS color for the fill — user-customizable, so a raw value rather than a Tailwind class
  // Daily Macros' own summary flags going over target by forcing the bar
  // and number red, as a warning. Weekly Plan reuses this same component
  // for its per-day bars but wants to always honor the user's chosen macro
  // color instead, so that override is opt-in rather than baked in.
  flagOverTarget?: boolean;
};

export default function ProgressRow({ label, actual, target, unit, color, flagOverTarget = true }: Props) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const over = flagOverTarget && target > 0 && actual > target;
  const diff = Math.round(actual - target);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
        <span className={`tabular-nums ${over ? "text-rose-500" : "text-zinc-500 dark:text-zinc-400"}`}>
          {Math.round(actual)} / {Math.round(target)} {unit}
          {diff !== 0 && (
            <span className="ml-1 text-xs">
              ({diff > 0 ? "+" : ""}
              {diff})
            </span>
          )}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : ""}`}
          style={{ width: `${pct}%`, backgroundColor: over ? undefined : color }}
        />
      </div>
    </div>
  );
}
