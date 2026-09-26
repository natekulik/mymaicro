import { NextResponse } from "next/server";
import { resolveKnownFoodMacros } from "@/lib/usda/resolve";

export const runtime = "nodejs";

// Recomputes one ingredient's macros for either kind of user override:
// - swapping to a different composition variant (same grams, different
//   per-100g macros) — the frontend already has enough data to do this
//   locally, but this route also handles it for a single code path
// - specifying a real amount for a vague entry ("1 jar" -> "1.5 cups")
export async function POST(request: Request) {
  let body: { fdcId?: number; quantity?: number; unit?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { fdcId, quantity, unit } = body;
  if (typeof fdcId !== "number" || typeof quantity !== "number" || quantity <= 0) {
    return NextResponse.json({ error: "Missing food or amount." }, { status: 400 });
  }

  const result = resolveKnownFoodMacros(fdcId, quantity, unit?.trim() || null);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
