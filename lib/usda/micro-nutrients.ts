// Pure data — no server-only imports here, so this is safe to import from
// client components too (the frontend needs the labels/units for display,
// the backend needs the ids for querying food_nutrients).
//
// USDA nutrient `id` values (not the classic INFOODS numbers), verified
// against the downloaded nutrient.csv. Ordered roughly by how commonly
// people actually look for them — this order also drives which ones show
// in the condensed micros view (see MICRO_CONDENSED_COUNT in
// RecipeAnalysis.tsx).
export type MicroNutrientDef = { key: string; id: number; label: string; unit: string };

export const MICRO_NUTRIENTS: MicroNutrientDef[] = [
  { key: "fatSaturated", id: 1258, label: "Saturated Fat", unit: "g" },
  { key: "fatTrans", id: 1257, label: "Trans Fat", unit: "g" },
  { key: "cholesterol", id: 1253, label: "Cholesterol", unit: "mg" },
  { key: "sodium", id: 1093, label: "Sodium", unit: "mg" },
  { key: "potassium", id: 1092, label: "Potassium", unit: "mg" },
  { key: "fiber", id: 1079, label: "Dietary Fiber", unit: "g" },
  { key: "sugarsTotal", id: 1063, label: "Total Sugars", unit: "g" },
  { key: "sugarsAdded", id: 1235, label: "Added Sugars", unit: "g" },
  { key: "calcium", id: 1087, label: "Calcium", unit: "mg" },
  { key: "iron", id: 1089, label: "Iron", unit: "mg" },
  { key: "magnesium", id: 1090, label: "Magnesium", unit: "mg" },
  { key: "zinc", id: 1095, label: "Zinc", unit: "mg" },
  { key: "vitaminA", id: 1106, label: "Vitamin A", unit: "mcg" },
  { key: "vitaminC", id: 1162, label: "Vitamin C", unit: "mg" },
  { key: "vitaminD", id: 1114, label: "Vitamin D", unit: "mcg" },
  { key: "vitaminE", id: 1158, label: "Vitamin E", unit: "mg" },
  { key: "vitaminK", id: 1185, label: "Vitamin K", unit: "mcg" },
  { key: "vitaminB6", id: 1175, label: "Vitamin B6", unit: "mg" },
  { key: "vitaminB12", id: 1178, label: "Vitamin B12", unit: "mcg" },
  { key: "folate", id: 1177, label: "Folate", unit: "mcg" },
  { key: "thiamin", id: 1165, label: "Thiamin (B1)", unit: "mg" },
  { key: "riboflavin", id: 1166, label: "Riboflavin (B2)", unit: "mg" },
  { key: "niacin", id: 1167, label: "Niacin (B3)", unit: "mg" },
];

export type MicroTotals = Record<string, number>;

// FDA Daily Values for adults on a 2,000-calorie diet (21 CFR 101.9(c)) —
// the same reference used for the "% Daily Value" column on every US
// nutrition label. Trans Fat and Total Sugars are intentionally absent:
// the FDA has not established a Daily Value for either.
export const DAILY_VALUES: Record<string, number> = {
  fatSaturated: 20, // g
  cholesterol: 300, // mg
  sodium: 2300, // mg
  potassium: 4700, // mg
  fiber: 28, // g
  sugarsAdded: 50, // g
  calcium: 1300, // mg
  iron: 18, // mg
  magnesium: 420, // mg
  zinc: 11, // mg
  vitaminA: 900, // mcg RAE
  vitaminC: 90, // mg
  vitaminD: 20, // mcg
  vitaminE: 15, // mg
  vitaminK: 120, // mcg
  vitaminB6: 1.7, // mg
  vitaminB12: 2.4, // mcg
  folate: 400, // mcg DFE
  thiamin: 1.2, // mg
  riboflavin: 1.3, // mg
  niacin: 16, // mg
};

// The FDA's own consumer guidance for reading %DV: "5% DV or less is low,
// 20% DV or more is high." Returns null when there's nothing to flag —
// no established Daily Value for that nutrient, or a value that falls in
// the unremarkable 5-20% middle.
export function dailyValueLevel(key: string, amount: number): "low" | "high" | null {
  const dv = DAILY_VALUES[key];
  if (!dv || dv <= 0) return null;
  const pct = (amount / dv) * 100;
  if (pct >= 20) return "high";
  if (pct <= 5) return "low";
  return null;
}
