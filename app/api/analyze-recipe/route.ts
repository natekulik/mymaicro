import { NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { estimateRecipeMacrosForApi } from "@/lib/usda/resolve";
import type { MicroTotals, NutritionMacro, RecipeResult } from "@/lib/recipe-types";

// schema.org/Recipe's NutritionInformation can carry a handful of micros
// beyond the four core macros — map its field names to our micro keys
// (see lib/usda/micro-nutrients.ts) so published and estimated micros
// render through the same list.
const PUBLISHED_MICRO_FIELDS: { field: string; key: string }[] = [
  { field: "saturatedFatContent", key: "fatSaturated" },
  { field: "transFatContent", key: "fatTrans" },
  { field: "cholesterolContent", key: "cholesterol" },
  { field: "sodiumContent", key: "sodium" },
  { field: "fiberContent", key: "fiber" },
  { field: "sugarContent", key: "sugarsTotal" },
];

export const runtime = "nodejs";

// Basic SSRF guard: this endpoint fetches whatever URL a user pastes in, so
// refuse anything that isn't a public http(s) address before we touch it.
const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::1\]?$/,
  /^169\.254\./,
];

function toSafeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (PRIVATE_HOSTNAME_PATTERNS.some((re) => re.test(url.hostname))) return null;
  return url;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (Array.isArray(value)) return parseNumber(value[0]);
  if (typeof value !== "string") return null;
  const match = value.match(/[\d.]+/);
  return match ? Number(match[0]) : null;
}

// schema.org/Recipe JSON-LD can appear as a bare object, an array of
// objects, or nested inside an @graph array — walk all of those shapes
// looking for a node whose @type is (or includes) "Recipe".
function findRecipeNode(node: unknown): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findRecipeNode(item);
      if (found) return found;
    }
    return null;
  }
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    const type = obj["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => typeof t === "string" && t.toLowerCase() === "recipe")) {
      return obj;
    }
    if (Array.isArray(obj["@graph"])) {
      const found = findRecipeNode(obj["@graph"]);
      if (found) return found;
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const raw = body.url?.trim();
  if (!raw) {
    return NextResponse.json({ error: "Enter a recipe URL." }, { status: 400 });
  }

  const url = toSafeUrl(raw);
  if (!url) {
    return NextResponse.json(
      { error: "That doesn't look like a valid, public web address." },
      { status: 400 },
    );
  }

  let html: string;
  try {
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; mymaicro-recipe-bot/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `The site responded with an error (${res.status}). It may be blocking automated requests.`,
        },
        { status: 502 },
      );
    }
    html = await res.text();
  } catch {
    return NextResponse.json(
      { error: "Couldn't reach that page — check the link, or the site may be blocking requests." },
      { status: 502 },
    );
  }

  const $ = cheerio.load(html);
  let recipeNode: Record<string, unknown> | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipeNode) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      recipeNode = findRecipeNode(parsed);
    } catch {
      // Some sites ship slightly malformed JSON-LD — just skip it.
    }
  });

  if (!recipeNode) {
    return NextResponse.json(
      {
        error:
          "Couldn't find recipe data on that page. Many recipe sites publish machine-readable details, but this one either doesn't or is blocking automated requests.",
      },
      { status: 404 },
    );
  }

  const node: Record<string, unknown> = recipeNode;
  const title = typeof node.name === "string" ? node.name : "Untitled recipe";
  const servings = parseNumber(node.recipeYield);
  const ingredients = Array.isArray(node.recipeIngredient)
    ? node.recipeIngredient.filter((i): i is string => typeof i === "string")
    : [];

  let nutrition: NutritionMacro | null = null;
  let publishedMicros: MicroTotals | null = null;
  if (node.nutrition && typeof node.nutrition === "object") {
    const n = node.nutrition as Record<string, unknown>;
    const macro: NutritionMacro = {
      calories: parseNumber(n.calories),
      protein: parseNumber(n.proteinContent),
      carbs: parseNumber(n.carbohydrateContent),
      fat: parseNumber(n.fatContent),
    };
    if (macro.calories !== null || macro.protein !== null || macro.carbs !== null || macro.fat !== null) {
      nutrition = macro;

      const micros: MicroTotals = {};
      for (const { field, key } of PUBLISHED_MICRO_FIELDS) {
        const value = parseNumber(n[field]);
        if (value !== null) micros[key] = value;
      }
      if (Object.keys(micros).length > 0) publishedMicros = micros;
    }
  }

  // Macros: trust the source's own published numbers over a computed
  // estimate when it has them. Micros: sites rarely publish more than a
  // handful of fields (sodium, cholesterol, fiber, sugar, sat/trans fat —
  // see PUBLISHED_MICRO_FIELDS above), so the ingredient-matching pass
  // always runs regardless of whether macros were published — it's the
  // only way to get the full micronutrient panel, same as Manual Entry.
  const { estimatedNutrition, estimatedMicros, ingredientDetails } = estimateRecipeMacrosForApi(
    ingredients,
    servings,
  );

  const result: RecipeResult = {
    title,
    sourceUrl: url.toString(),
    servings,
    ingredients,
    nutrition,
    publishedMicros,
    estimatedNutrition,
    estimatedMicros,
    ingredientDetails,
  };

  return NextResponse.json(result);
}
