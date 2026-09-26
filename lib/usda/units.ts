// Deterministic unit conversion. Mass units convert exactly. Volume units
// convert exactly to milliliters, but going from mL to *grams* depends on
// the ingredient's density — that's only safe to do generically as a
// water-like (1 mL ≈ 1 g) approximation, and callers should prefer a
// USDA-published gram weight for the specific ingredient when one exists
// (see lib/usda/resolve.ts). Count units ("clove", "slice", ...) have no
// universal factor at all — they can only be resolved via a USDA portion
// match. Container units ("jar", "can", "box", ...) are a step further:
// real-world container sizes vary too much (a "jar" of sauce ranges from a
// 14oz small jar to a 45oz restaurant size) to guess even from a USDA
// portion match with any confidence — these are meant to prompt the user
// for an actual amount rather than be silently converted.

export type UnitKind = "mass" | "volume" | "count" | "container";

type UnitDef = { kind: "mass" | "volume"; toBase: number; aliases: string[] };

const UNIT_DEFS: Record<string, UnitDef> = {
  g: { kind: "mass", toBase: 1, aliases: ["g", "gram", "grams"] },
  kg: { kind: "mass", toBase: 1000, aliases: ["kg", "kilogram", "kilograms"] },
  oz: { kind: "mass", toBase: 28.3495, aliases: ["oz", "ounce", "ounces"] },
  lb: { kind: "mass", toBase: 453.592, aliases: ["lb", "lbs", "pound", "pounds"] },

  ml: {
    kind: "volume",
    toBase: 1,
    aliases: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  },
  l: { kind: "volume", toBase: 1000, aliases: ["l", "liter", "liters", "litre", "litres"] },
  tsp: { kind: "volume", toBase: 4.92892, aliases: ["tsp", "teaspoon", "teaspoons"] },
  tbsp: { kind: "volume", toBase: 14.7868, aliases: ["tbsp", "tablespoon", "tablespoons"] },
  cup: { kind: "volume", toBase: 236.588, aliases: ["cup", "cups"] },
  flOz: { kind: "volume", toBase: 29.5735, aliases: ["floz", "fluidounce", "fluidounces"] },
  pint: { kind: "volume", toBase: 473.176, aliases: ["pint", "pints"] },
  quart: { kind: "volume", toBase: 946.353, aliases: ["quart", "quarts"] },
  gallon: { kind: "volume", toBase: 3785.41, aliases: ["gallon", "gallons"] },
};

const COUNT_ALIASES = [
  "clove",
  "cloves",
  "slice",
  "slices",
  "piece",
  "pieces",
  "whole",
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "sprig",
  "sprigs",
  "stalk",
  "stalks",
  "head",
  "heads",
  "bunch",
  "bunches",
];

export const VAGUE_CONTAINER_ALIASES = [
  "can",
  "cans",
  "jar",
  "jars",
  "package",
  "packages",
  "pkg",
  "pkgs",
  "box",
  "boxes",
  "bottle",
  "bottles",
  "bag",
  "bags",
  "container",
  "containers",
  "pouch",
  "pouches",
];

const ALIAS_TO_KEY = new Map<string, string>();
for (const [key, def] of Object.entries(UNIT_DEFS)) {
  for (const alias of def.aliases) ALIAS_TO_KEY.set(alias, key);
}
for (const alias of COUNT_ALIASES) ALIAS_TO_KEY.set(alias, "count");
for (const alias of VAGUE_CONTAINER_ALIASES) ALIAS_TO_KEY.set(alias, "container");

function normalizeAlias(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/\s+/g, "");
}

export type NormalizedUnit = { key: string; kind: UnitKind };

export function normalizeUnit(raw: string | null): NormalizedUnit | null {
  if (!raw) return null;
  const key = ALIAS_TO_KEY.get(normalizeAlias(raw));
  if (!key) return null;
  if (key === "count" || key === "container") return { key, kind: key };
  return { key, kind: UNIT_DEFS[key].kind };
}

// For mass units this is grams. For volume units this is milliliters
// (the caller decides whether/how to treat mL as an approximate gram
// count — see resolve.ts).
export function unitToBaseAmount(unitKey: string, quantity: number): number | null {
  const def = UNIT_DEFS[unitKey];
  if (!def) return null;
  return def.toBase * quantity;
}
