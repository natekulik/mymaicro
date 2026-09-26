import { NextResponse } from "next/server";
import { estimateRecipeMacrosForApi } from "@/lib/usda/resolve";
import type { RecipeResult } from "@/lib/recipe-types";

export const runtime = "nodejs";

// Manual entry has no source page to parse structured data from, so this
// route turns freeform pasted text into a clean ingredient list, then
// estimates per-serving macros from the USDA ingredient database — the
// same estimation path the URL route falls back to when a site doesn't
// publish its own nutrition facts.
export async function POST(request: Request) {
  let body: { title?: string; text?: string; servings?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "Paste in a recipe or ingredient list first." }, { status: 400 });
  }

  const ingredients = text
    .split("\n")
    // Strip a leading bullet ("- ", "* ", "• ") or numbered-list marker
    // ("1. ", "2) ") only — NOT a bare leading digit, which is almost
    // always a quantity ("1 lb spaghetti") that has to be kept.
    .map((line) => line.replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "").trim())
    .filter((line) => line.length > 0);

  if (ingredients.length === 0) {
    return NextResponse.json({ error: "Couldn't find any ingredient lines in that text." }, { status: 400 });
  }

  const title = body.title?.trim() || "Untitled recipe";
  const servings =
    typeof body.servings === "number" && body.servings > 0 ? body.servings : null;

  const { estimatedNutrition, estimatedMicros, ingredientDetails } = estimateRecipeMacrosForApi(
    ingredients,
    servings,
  );

  const result: RecipeResult = {
    title,
    sourceUrl: null,
    servings,
    ingredients,
    nutrition: null,
    publishedMicros: null,
    estimatedNutrition,
    estimatedMicros,
    ingredientDetails,
  };

  return NextResponse.json(result);
}
