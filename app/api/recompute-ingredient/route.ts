import { NextResponse } from "next/server";
import { resolveKnownFoodMacros } from "@/lib/usda/resolve";
import { ensureUsdaDbReady } from "@/lib/usda/db";

export const runtime = "nodejs";
// Generous headroom for the one-time cold-start download of the ~1GB USDA
// database from R2 (see lib/usda/db.ts) — subsequent requests on the same
// warm instance skip the download and return in normal time.
export const maxDuration = 60;

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

  await ensureUsdaDbReady();
  const result = resolveKnownFoodMacros(fdcId, quantity, unit?.trim() || null);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json(result);
}
