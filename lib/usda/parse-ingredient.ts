// Turns a freeform ingredient line ("2 cups all-purpose flour", "1 1/2 tbsp
// olive oil", "3 cloves garlic, minced") into a quantity, a unit, and a
// clean noun phrase to search the USDA database with.

export type ParsedIngredient = {
  raw: string;
  quantity: number | null;
  unitText: string | null;
  name: string; // full remainder text, for display
  searchName: string; // trimmed core noun phrase, for matching
};

const UNICODE_FRACTIONS: Record<string, number> = {
  "¼": 0.25,
  "½": 0.5,
  "¾": 0.75,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};
const UNICODE_FRACTION_CHARS = Object.keys(UNICODE_FRACTIONS).join("");

const KNOWN_UNITS = [
  "cups",
  "cup",
  "tablespoons",
  "tablespoon",
  "tbsp",
  "teaspoons",
  "teaspoon",
  "tsp",
  "pounds",
  "pound",
  "lbs",
  "lb",
  "ounces",
  "ounce",
  "oz",
  "grams",
  "gram",
  "g",
  "kilograms",
  "kilogram",
  "kg",
  "milliliters",
  "milliliter",
  "ml",
  "liters",
  "liter",
  "l",
  "cloves",
  "clove",
  "slices",
  "slice",
  "cans",
  "can",
  "pieces",
  "piece",
  "pinches",
  "pinch",
  "dashes",
  "dash",
  "sprigs",
  "sprig",
  "stalks",
  "stalk",
  "heads",
  "head",
  "bunches",
  "bunch",
  "whole",
  // Container units — recognized so they're stripped from the search text
  // ("1 jar marinara sauce" -> searches "marinara sauce", not "jar marinara
  // sauce"), but their real-world size varies too much to convert without
  // asking the user — see VAGUE_CONTAINER_UNITS in units.ts.
  "jars",
  "jar",
  "packages",
  "package",
  "pkgs",
  "pkg",
  "boxes",
  "box",
  "bottles",
  "bottle",
  "bags",
  "bag",
  "containers",
  "container",
  "pouches",
  "pouch",
].sort((a, b) => b.length - a.length); // longest-first so multi-word-ish units win

const UNIT_PATTERN = new RegExp(`^(${KNOWN_UNITS.join("|")})\\.?\\b`, "i");

const PREP_STOPWORDS = new Set([
  "chopped",
  "diced",
  "minced",
  "sliced",
  "grated",
  "shredded",
  "crushed",
  "melted",
  "softened",
  "packed",
  "divided",
  "peeled",
  "seeded",
  "cored",
  "trimmed",
  "drained",
  "rinsed",
  "cooked",
  "uncooked",
  "raw",
  "fresh",
  "large",
  "medium",
  "small",
  "optional",
  "finely",
  "coarsely",
  "roughly",
  "and",
  "or",
]);

export function parseIngredientLine(rawLine: string): ParsedIngredient {
  let text = rawLine.trim();

  // Strip a leading bullet / numbered-list marker (mirrors the manual-entry
  // ingredient-list cleanup).
  text = text.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "").trim();

  let quantity: number | null = null;

  const mixedUnicode = text.match(
    new RegExp(`^(\\d+)?\\s*([${UNICODE_FRACTION_CHARS}])\\s*`),
  );
  const mixedAscii = text.match(/^(\d+)\s+(\d+)\/(\d+)\s*/);
  const bareFraction = text.match(/^(\d+)\/(\d+)\s*/);
  const plainNumber = text.match(/^(\d+(?:\.\d+)?)\s*/);

  if (mixedUnicode) {
    const whole = mixedUnicode[1] ? Number(mixedUnicode[1]) : 0;
    quantity = whole + UNICODE_FRACTIONS[mixedUnicode[2]];
    text = text.slice(mixedUnicode[0].length).trim();
  } else if (mixedAscii) {
    quantity = Number(mixedAscii[1]) + Number(mixedAscii[2]) / Number(mixedAscii[3]);
    text = text.slice(mixedAscii[0].length).trim();
  } else if (bareFraction) {
    quantity = Number(bareFraction[1]) / Number(bareFraction[2]);
    text = text.slice(bareFraction[0].length).trim();
  } else if (plainNumber) {
    quantity = Number(plainNumber[1]);
    text = text.slice(plainNumber[0].length).trim();
  }

  let unitText: string | null = null;
  const unitMatch = text.match(UNIT_PATTERN);
  if (unitMatch) {
    unitText = unitMatch[1];
    text = text.slice(unitMatch[0].length).trim();
  }

  // Some recipes give an alternate unit right alongside the first ("1 lb /
  // 500g beef mince", "2 cups / 480 ml milk") — strip that whole clause
  // too, or its bare number ("500g") pollutes the search text enough to
  // derail matching (nothing in a food database is literally named
  // "500g").
  const altUnitClause = text.match(/^\/\s*\d+(?:\.\d+)?\s*/);
  if (altUnitClause) {
    let rest = text.slice(altUnitClause[0].length);
    const altUnitMatch = rest.match(UNIT_PATTERN);
    if (altUnitMatch) rest = rest.slice(altUnitMatch[0].length);
    text = rest.trim();
  }

  text = text.replace(/^of\s+/i, "");

  const name = text;

  // Core noun phrase for matching: text before the first comma or
  // parenthetical, with prep/state words dropped.
  const beforeComma = name.split(",")[0];
  const beforeParen = beforeComma.split("(")[0];
  const searchName = beforeParen
    .split(/\s+/)
    .filter((word) => word && !PREP_STOPWORDS.has(word.toLowerCase()))
    .join(" ")
    .trim();

  return { raw: rawLine, quantity, unitText, name, searchName: searchName || name };
}
