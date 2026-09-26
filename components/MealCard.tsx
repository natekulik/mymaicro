"use client";

import { calories, type Macro, type MacroColors, type MacroMatchStatus } from "@/lib/macro";
import NumberField from "./NumberField";

type Props = {
  name: string;
  macros: Macro;
  macroColors: MacroColors;
  // Whether each macro's *day-wide* meal total exactly hits the daily
  // target — the same status applies to every meal card's box for that
  // macro, since it's a property of the sum across all meals, not any one
  // meal individually.
  macroStatus: MacroMatchStatus;
  onNameChange: (name: string) => void;
  onMacrosChange: (macros: Macro) => void;
};

export default function MealCard({
  name,
  macros,
  macroColors,
  macroStatus,
  onNameChange,
  onMacrosChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2">
        <input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-zinc-900 outline-none transition hover:border-zinc-200 focus:border-zinc-300 dark:text-zinc-50 dark:hover:border-zinc-700 dark:focus:border-zinc-600"
        />
        <span className="whitespace-nowrap text-xs text-zinc-400">{calories(macros)} cals</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <NumberField
          label="Protein (g)"
          color={macroColors.protein}
          status={macroStatus.protein}
          value={macros.protein}
          onChange={(v) => onMacrosChange({ ...macros, protein: v })}
        />
        <NumberField
          label="Carbs (g)"
          color={macroColors.carbs}
          status={macroStatus.carbs}
          value={macros.carbs}
          onChange={(v) => onMacrosChange({ ...macros, carbs: v })}
        />
        <NumberField
          label="Fat (g)"
          color={macroColors.fat}
          status={macroStatus.fat}
          value={macros.fat}
          onChange={(v) => onMacrosChange({ ...macros, fat: v })}
        />
      </div>
    </div>
  );
}
