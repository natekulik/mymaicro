import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { findFoodCandidates } from "@/lib/usda/match";
import { resolveIngredientMacros } from "@/lib/usda/resolve";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail, hasSatisfiedMfa } from "@/lib/admin";
import type { IngredientMacroDetail, NutritionMacro } from "@/lib/recipe-types";

export const runtime = "nodejs";
// Headroom for the tool-use loop below — the model may call search_foods a
// few times before proposing a swap, each a real network round trip. Set
// to Vercel's own Hobby-plan ceiling (not some smaller number we picked)
// since there's no reason to cap this any tighter than the platform
// already does — a 60s cap here was actually *more* restrictive than
// Vercel's own 300s default and could cut the request off mid-flight
// under real production latency, which a killed function surfaces to the
// frontend as a non-JSON response (an HTML timeout page), not a clean
// error — i.e. exactly the generic "couldn't reach the optimizer" catch.
export const maxDuration = 300;

// Free-tier cap while there's no real billing for this feature yet —
// every signed-in account gets this many lifetime attempts, tracked in
// public.optimize_usage. Admin accounts (see lib/admin.ts) are exempt
// from the cap, but their usage is still recorded — the admin dashboard's
// "optimizations run" total should reflect real usage, not just
// non-admin usage.
const FREE_OPTIMIZE_LIMIT = 50;

const DIRECTIONS = {
  more_protein: "more protein",
  less_protein: "less protein",
  more_carbs: "more carbs",
  less_carbs: "less carbs",
  more_fat: "more fat",
  less_fat: "less fat",
} as const;
type Direction = keyof typeof DIRECTIONS;

const SEARCH_TOOL: Anthropic.Tool = {
  name: "search_foods",
  description:
    "Search the USDA food database for candidate ingredients matching a query. Use this to confirm a replacement ingredient you're considering is a real, specific, well-described food before proposing it — a vague or made-up name won't match well.",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "A short ingredient search phrase, e.g. 'greek yogurt plain'." },
    },
    required: ["query"],
  },
};

const PROPOSE_TOOL: Anthropic.Tool = {
  name: "propose_swap",
  description: "Finalize your single proposed ingredient substitution for this recipe. Call this exactly once, when you've settled on your answer.",
  input_schema: {
    type: "object",
    properties: {
      original_index: {
        type: "integer",
        description: "The 0-based index of the ingredient line being replaced, from the numbered list you were given.",
      },
      replacement_text: {
        type: "string",
        description:
          "The full replacement ingredient line, written the way a recipe would (quantity, unit, name) — e.g. '1 cup plain Greek yogurt'. Keep the same quantity/unit as the original unless the substitution genuinely needs a different amount.",
      },
      reasoning: {
        type: "string",
        description: "One or two plain-language sentences explaining why this swap helps, for the person cooking.",
      },
    },
    required: ["original_index", "replacement_text", "reasoning"],
  },
};

type ProposedSwap = { original_index: number; replacement_text: string; reasoning: string };

type RequestBody = {
  ingredients: IngredientMacroDetail[];
  servings: number;
  direction: Direction;
};

function errorResponse(code: string, message: string, status: number) {
  return NextResponse.json({ code, message }, { status });
}

// Sums whatever each ingredient currently contributes (already-resolved
// matches, variant picks, or manual overrides — the frontend sends its own
// effective details, post-merge) and divides by servings. Mirrors the
// summation in lib/usda/resolve.ts's estimateRecipeMacros, just operating
// on the API-shaped IngredientMacroDetail[] instead of the internal
// IngredientMacroResult[] type.
function sumPerServing(details: IngredientMacroDetail[], servings: number): NutritionMacro {
  const total = details.reduce(
    (acc, d) => ({
      calories: acc.calories + (d.macros?.calories ?? 0),
      protein: acc.protein + (d.macros?.protein ?? 0),
      carbs: acc.carbs + (d.macros?.carbs ?? 0),
      fat: acc.fat + (d.macros?.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    calories: total.calories / servings,
    protein: total.protein / servings,
    carbs: total.carbs / servings,
    fat: total.fat / servings,
  };
}

// Wrapped by POST below in a top-level try/catch — without it, anything
// unexpected throwing in here (an Anthropic SDK error, a D1 hiccup, a
// Supabase blip) could leave Next.js to produce a non-JSON error
// response, which the frontend's fetch then fails to parse and reports
// as a generic "couldn't reach the optimizer" — exactly the unhelpful
// dead end this is meant to avoid.
async function handlePost(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return errorResponse("not_configured", "Recipe optimization isn't configured on this server yet.", 503);
  }

  // Optimize needs an account — not for data-persistence reasons like
  // saving a recipe, but because the per-account usage cap below is
  // meaningless against an anonymous guest who can just clear cookies to
  // reset it. The frontend checks this too (shows the sign-up prompt
  // without even calling this route), but it's re-checked here since a
  // client-side check alone is never trustworthy.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorResponse("sign_in_required", "Create a free account to use Optimize.", 401);
  }

  // Both checks required for the bypass — someone with just the admin
  // account's password (no verified TOTP session) falls back to the
  // normal 50-use cap rather than getting unlimited usage for free.
  const admin = isAdminEmail(user.email) && (await hasSatisfiedMfa(supabase));

  if (!admin) {
    const { data: usageRow } = await supabase
      .from("optimize_usage")
      .select("count")
      .eq("user_id", user.id)
      .maybeSingle();
    const currentCount = usageRow?.count ?? 0;
    if (currentCount >= FREE_OPTIMIZE_LIMIT) {
      return errorResponse(
        "limit_reached",
        `You've used all ${FREE_OPTIMIZE_LIMIT} free optimizations for now — more room coming once billing's set up.`,
        403,
      );
    }
  }

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return errorResponse("invalid_request", "Invalid request.", 400);
  }

  const { ingredients, servings, direction } = body;
  if (
    !Array.isArray(ingredients) ||
    ingredients.length === 0 ||
    !servings ||
    servings <= 0 ||
    !(direction in DIRECTIONS)
  ) {
    return errorResponse("missing_data", "Missing recipe data.", 400);
  }

  const before = sumPerServing(ingredients, servings);

  const anthropic = new Anthropic({ apiKey });

  const ingredientList = ingredients
    .map((d, i) => `${i}. ${d.raw}${d.matchedDescription ? ` (currently matched: ${d.matchedDescription})` : ""}`)
    .join("\n");

  const systemPrompt =
    "You are a recipe nutrition assistant. Given a recipe's ingredient list (0-indexed) and its current " +
    "per-serving macros, propose exactly ONE ingredient substitution that meaningfully moves the recipe " +
    "toward the requested direction while staying true to the dish — a similar role, texture, and flavor " +
    "category (e.g. swap one dairy for another, one protein source for another), never a random unrelated " +
    "ingredient. Use the search_foods tool as needed to confirm your intended replacement is a real, " +
    "specific, recognizable ingredient before proposing it. When you've decided, call propose_swap exactly " +
    "once with your answer.";

  const userMessage =
    `Recipe ingredients (whole recipe, ${servings} serving${servings === 1 ? "" : "s"}):\n${ingredientList}\n\n` +
    `Current macros per serving: ${Math.round(before.calories ?? 0)} cal, ${Math.round(before.protein ?? 0)}g protein, ` +
    `${Math.round(before.carbs ?? 0)}g carbs, ${Math.round(before.fat ?? 0)}g fat.\n\n` +
    `Goal: ${DIRECTIONS[direction]}.`;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  let proposal: ProposedSwap | null = null;

  // Capped at 5 round trips — a couple of searches plus the final
  // propose_swap call is the normal case; this is just a backstop against
  // the model never converging.
  for (let turn = 0; turn < 5 && !proposal; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: systemPrompt,
      tools: [SEARCH_TOOL, PROPOSE_TOOL],
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      if (toolUse.name === "propose_swap") {
        proposal = toolUse.input as ProposedSwap;
        toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Recorded." });
        continue;
      }
      if (toolUse.name === "search_foods") {
        const { query } = toolUse.input as { query: string };
        const candidates = await findFoodCandidates(query);
        const top = candidates.slice(0, 8).map((c) => `${c.match.description} (${c.match.source})`);
        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: top.length > 0 ? top.join("\n") : "No matches found.",
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Recorded for every account, admins included (so the admin dashboard's
  // usage totals are real) — a real LLM call was made (the expensive
  // part) whether or not a usable suggestion came out of it, so usage
  // counts from this point on, not from a successful apply. Only the cap
  // check above skips admins; this does not.
  {
    const { data: usageRow } = await supabase
      .from("optimize_usage")
      .select("count")
      .eq("user_id", user.id)
      .maybeSingle();
    await supabase
      .from("optimize_usage")
      .upsert({ user_id: user.id, count: (usageRow?.count ?? 0) + 1, updated_at: new Date().toISOString() });
  }

  if (!proposal) {
    return errorResponse(
      "no_suggestion",
      "Couldn't come up with a suggestion for that recipe — try a different direction.",
      422,
    );
  }

  const index = proposal.original_index;
  if (!Number.isInteger(index) || index < 0 || index >= ingredients.length) {
    return errorResponse("bad_index", "The suggestion didn't line up with this recipe — try again.", 422);
  }

  // Never trust the model's own nutrition math — the proposed replacement
  // text goes through the exact same USDA matching pipeline every other
  // ingredient in the app does.
  const resolved = await resolveIngredientMacros(proposal.replacement_text);
  if (!resolved.macros) {
    return errorResponse(
      "unverified",
      `Couldn't verify nutrition data for "${proposal.replacement_text}" — try again, or a different direction.`,
      422,
    );
  }

  const replacementDetail: IngredientMacroDetail = {
    raw: proposal.replacement_text,
    fdcId: resolved.matched?.fdcId ?? null,
    matchedDescription: resolved.matched?.description ?? null,
    matchSource: resolved.matched?.source ?? null,
    matchConfidence: resolved.matchConfidence,
    grams: resolved.grams,
    gramsSource: resolved.gramsSource,
    macros: resolved.macros,
    micros: resolved.micros,
    needsQuantity: resolved.needsQuantity,
    suggestedUnit: resolved.suggestedUnit,
    variantOptions: resolved.variantOptions,
  };

  const afterIngredients = ingredients.map((d, i) => (i === index ? replacementDetail : d));
  const after = sumPerServing(afterIngredients, servings);

  return NextResponse.json({
    originalIndex: index,
    originalText: ingredients[index].raw,
    replacementText: proposal.replacement_text,
    reasoning: proposal.reasoning,
    replacementDetail,
    before,
    after,
  });
}

export async function POST(request: Request) {
  try {
    return await handlePost(request);
  } catch (err) {
    console.error("optimize-recipe failed:", err);
    return errorResponse(
      "unexpected_error",
      "Something went wrong generating a suggestion — try again.",
      500,
    );
  }
}
