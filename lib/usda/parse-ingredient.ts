// Turns a freeform ingredient line ("2 cups all-purpose flour", "1 1/2 tbsp
// olive oil", "3 cloves garlic, minced") into a quantity, a unit, and a
// clean noun phrase to search the USDA database with.

export type ParsedIngredient = {
  raw: string;
  quantity: number | null;
  unitText: string | null;
  name: string; // full remainder text, for display
  searchName: string; // trimmed core noun phrase, for matching
  // The line said "cooked" (stripped from searchName like other prep
  // words) — lets the matcher pick a cooked entry for foods where raw and
  // cooked differ a lot ("1 cup cooked rice").
  isCooked: boolean;
  // An explicit "small" / "medium" / "large" in the line (also stripped
  // from searchName) — used to pick the matching USDA portion for a bare
  // count ("2 large eggs").
  sizeHint: "small" | "medium" | "large" | null;
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
  "sticks",
  "stick",
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
  "organic",
  "ripe",
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

// Common misspellings of everyday ingredients, fixed in the search text
// only (the line shown back to the user is untouched). Without this, a
// typo like "avacado" quietly matches whichever branded product happens
// to carry the same typo in its name.
const COMMON_MISSPELLINGS: Record<string, string> = {
  avacado: "avocado", avacados: "avocados", avocodo: "avocado", advocado: "avocado", guacamolee: "guacamole",
  tomatoe: "tomato", tomatos: "tomatoes", potatos: "potatoes", potatoe: "potato", brocoli: "broccoli",
  broccolli: "broccoli", brocolli: "broccoli", zuchini: "zucchini", zucchinni: "zucchini",
  zuchinni: "zucchini", cauliflour: "cauliflower", califlower: "cauliflower", cucmber: "cucumber",
  cucumbr: "cucumber", spinich: "spinach", spinache: "spinach", letuce: "lettuce", lettice: "lettuce",
  celary: "celery", cellery: "celery", carrott: "carrot", carots: "carrots", onoin: "onion", onian: "onion",
  garlick: "garlic", garic: "garlic", peper: "pepper", pepers: "peppers", jalepeno: "jalapeno",
  mushroon: "mushroom", mushrom: "mushroom", banannas: "bananas", bananna: "banana", banan: "banana",
  strawbery: "strawberry", strawberrys: "strawberries", blueberrys: "blueberries", bluberry: "blueberry",
  rasberry: "raspberry", raspberrys: "raspberries", cantalope: "cantaloupe", pinapple: "pineapple",
  pineaple: "pineapple", watermelone: "watermelon", cherrys: "cherries", chiken: "chicken",
  chickn: "chicken", checken: "chicken", turkee: "turkey", salmom: "salmon", samon: "salmon", tunna: "tuna",
  shrimps: "shrimp", parmesean: "parmesan", parmasan: "parmesan", parmigiano: "parmesan",
  mozerella: "mozzarella", mozzerella: "mozzarella", mozarella: "mozzarella", cheddor: "cheddar",
  chedder: "cheddar", yoghurt: "yogurt", yogurth: "yogurt", youghurt: "yogurt", mayonaise: "mayonnaise",
  mayonnaice: "mayonnaise", mayonase: "mayonnaise", ketsup: "ketchup", catsup: "ketchup",
  cinammon: "cinnamon", cinnamen: "cinnamon", tumeric: "turmeric", oregeno: "oregano", parsely: "parsley",
  basel: "basil", rosemarry: "rosemary", vanila: "vanilla", vanillia: "vanilla", chocolat: "chocolate",
  choclate: "chocolate", flouer: "flour", suger: "sugar", shugar: "sugar", brownsugar: "brown sugar",
  buter: "butter", butterr: "butter", olve: "olive", oilve: "olive", viniger: "vinegar", vinager: "vinegar",
  quinua: "quinoa", qinoa: "quinoa", oatmeel: "oatmeal", cereale: "cereal", spagetti: "spaghetti",
  spagheti: "spaghetti", maccaroni: "macaroni", lentel: "lentil", lentels: "lentils", garbonzo: "garbanzo",
  almod: "almond", peanutbutter: "peanut butter", walnutt: "walnut", pecon: "pecan", brocolini: "broccolini",
  egss: "eggs", milke: "milk", mlik: "milk", chese: "cheese", chees: "cheese",
};

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
    .map((word) => COMMON_MISSPELLINGS[word.toLowerCase()] ?? word)
    .join(" ")
    .trim();

  const isCooked = /(?<!un)\bcooked\b/i.test(name);
  const sizeMatch = name.match(/\b(small|medium|large)\b/i);
  const sizeHint = sizeMatch ? (sizeMatch[1].toLowerCase() as "small" | "medium" | "large") : null;

  return { raw: rawLine, quantity, unitText, name, searchName: searchName || name, isCooked, sizeHint };
}
