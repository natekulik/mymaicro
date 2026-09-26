type Props = {
  label: string;
  actual: number;
  target: number;
  unit: string;
  barClass: string; // tailwind bg-* class for the fill when within budget
};

export default function ProgressRow({ label, actual, target, unit, barClass }: Props) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  const over = target > 0 && actual > target;
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
          className={`h-full rounded-full transition-all ${over ? "bg-rose-500" : barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
