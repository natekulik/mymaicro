import type { FoodMatch } from "./match";

// Hand-picked USDA entries for the everyday ingredients where a text
// search alone can't tell which entry a cook means — "potato" has to be
// the plain raw potato, not potato bread; "flour" is all-purpose wheat
// flour, not soy flour; "rice" is plain white rice, not a rice medley.
// Looked up by the normalized search phrase (singular words, lower case),
// with a "|cooked" variant for foods where raw vs. cooked is a ~3x swing
// in calories ("1 cup cooked rice" vs "1 cup rice").
//
// A staple only goes to the front of the candidate list; if it turns out
// to be unusable for a given line (no nutrient panel, no portion for the
// unit asked for), resolution falls through to the normal ranked
// candidates exactly as before. Anything not listed here is unaffected.
type Staple = { fdcId: number; description: string; source?: "foundation" | "sr_legacy" };

const staple = (fdcId: number, description: string, source?: "foundation" | "sr_legacy"): Staple => ({ fdcId, description, source });

const POTATO = staple(170026, "Potatoes, flesh and skin, raw");
const SWEET_POTATO = staple(168482, "Sweet potato, raw, unprepared (Includes foods for USDA's Food Distribution Program)");
const WHITE_RICE = staple(168877, "Rice, white, long-grain, regular, raw, enriched");
const WHITE_RICE_COOKED = staple(168878, "Rice, white, long-grain, regular, enriched, cooked");
const BROWN_RICE = staple(169703, "Rice, brown, long-grain, raw (Includes foods for USDA's Food Distribution Program)");
const BROWN_RICE_COOKED = staple(169704, "Rice, brown, long-grain, cooked (Includes foods for USDA's Food Distribution Program)");
const AP_FLOUR = staple(168894, "Wheat flour, white, all-purpose, enriched, bleached");
const BACON = staple(168322, "Pork, cured, bacon, pre-sliced, cooked, pan-fried");
const YOGURT = staple(171284, "Yogurt, plain, whole milk");
const CHICKEN_BREAST = staple(171077, "Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw");
const CHICKEN_BREAST_COOKED = staple(171477, "Chicken, broilers or fryers, breast, meat only, cooked, roasted");
const OATS = staple(173904, "Cereals, oats, regular and quick, not fortified, dry");
const OATS_COOKED = staple(173905, "Cereals, oats, regular and quick, unenriched, cooked with water (includes boiling and microwaving), without salt");
const ONION = staple(170000, "Onions, raw");
const CHEDDAR = staple(173414, "Cheese, cheddar (Includes foods for USDA's Food Distribution Program)");
const MUSHROOM = staple(169251, "Mushrooms, white, raw");
const SOY_SAUCE = staple(174277, "Soy sauce made from soy and wheat (shoyu)");
const TOMATO = staple(170457, "Tomatoes, red, ripe, raw, year round average");
const TOMATO_SAUCE = staple(170054, "Tomato products, canned, sauce");
const ZUCCHINI = staple(169291, "Squash, summer, zucchini, includes skin, raw");
const GREEN_PEPPER = staple(170427, "Peppers, sweet, green, raw");
const RED_PEPPER = staple(170108, "Peppers, sweet, red, raw");
const YELLOW_PEPPER = staple(169383, "Peppers, sweet, yellow, raw");
const JALAPENO = staple(168576, "Peppers, jalapeno, raw");
const PASTA = staple(169736, "Pasta, dry, enriched");
const PASTA_COOKED = staple(169737, "Pasta, cooked, enriched, without added salt");
const BLACK_BEAN_COOKED = staple(173735, "Beans, black, mature seeds, cooked, boiled, without salt");
const TOMATO_PASTE = staple(170459, "Tomato products, canned, paste, without salt added (Includes foods for USDA's Food Distribution Program)");
const CHICKEN_BROTH = staple(174536, "Soup, chicken broth, ready-to-serve");
const BEEF_BROTH = staple(171538, "Soup, beef broth or bouillon canned, ready-to-serve");
const VEGETABLE_BROTH = staple(171583, "Soup, vegetable broth, ready to serve");
const PEANUT_BUTTER = staple(174266, "Peanut butter, smooth style, with salt (Includes foods for USDA's Food Distribution Program)");
const GREEK_YOGURT = staple(170894, "Yogurt, Greek, plain, nonfat (Includes foods for USDA's Food Distribution Program)");
const CHOCOLATE_CHIPS = staple(167976, "Candies, semisweet chocolate");
const CREAM_CHEESE = staple(173418, "Cheese, cream");
const WHOLE_WHEAT_BREAD = staple(172688, "Bread, whole-wheat, commercially prepared");
const OLIVE_OIL = staple(171413, "Oil, olive, salad or cooking");
const QUINOA = staple(168874, "Quinoa, uncooked");
const QUINOA_COOKED = staple(168917, "Quinoa, cooked");
const CANOLA_OIL = staple(172336, "Oil, canola");
const COCONUT_OIL = staple(171412, "Oil, coconut");
const VEGETABLE_OIL = staple(172370, "Oil, vegetable, soybean, refined");
const ALMONDS = staple(170567, "Nuts, almonds");
const MAYONNAISE = staple(171009, "Salad dressing, mayonnaise, regular");
const WHITE_BREAD = staple(325871, "Bread, white, commercially prepared", "foundation");
const GROUND_BEEF = staple(174036, "Beef, ground, 80% lean meat / 20% fat, raw");
const MOZZARELLA = staple(170845, "Cheese, mozzarella, whole milk");
const PARMESAN = staple(170848, "Cheese, parmesan, hard");
const APPLE = staple(171688, "Apples, raw, with skin (Includes foods for USDA's Food Distribution Program)");
const EGG = staple(171287, "Egg, whole, raw, fresh");
const BUTTER = staple(173410, "Butter, salted");

const STAPLES: Record<string, Staple> = {
  potato: POTATO,
  "sweet potato": SWEET_POTATO,
  rice: WHITE_RICE,
  "white rice": WHITE_RICE,
  "long-grain rice": WHITE_RICE,
  "rice|cooked": WHITE_RICE_COOKED,
  "white rice|cooked": WHITE_RICE_COOKED,
  "brown rice": BROWN_RICE,
  "brown rice|cooked": BROWN_RICE_COOKED,
  flour: AP_FLOUR,
  "all-purpose flour": AP_FLOUR,
  "all purpose flour": AP_FLOUR,
  "wheat flour": AP_FLOUR,
  bacon: BACON,
  yogurt: YOGURT,
  "plain yogurt": YOGURT,
  "chicken breast": CHICKEN_BREAST,
  "chicken breast|cooked": CHICKEN_BREAST_COOKED,
  oat: OATS,
  "rolled oat": OATS,
  "old-fashioned oat": OATS,
  "oat|cooked": OATS_COOKED,
  onion: ONION,
  "yellow onion": ONION,
  "white onion": ONION,
  "cheddar cheese": CHEDDAR,
  cheddar: CHEDDAR,
  mushroom: MUSHROOM,
  "soy sauce": SOY_SAUCE,
  tomato: TOMATO,
  "tomato sauce": TOMATO_SAUCE,
  "tomato paste": TOMATO_PASTE,
  "chicken broth": CHICKEN_BROTH,
  "chicken stock": CHICKEN_BROTH,
  "beef broth": BEEF_BROTH,
  "beef stock": BEEF_BROTH,
  "vegetable broth": VEGETABLE_BROTH,
  "vegetable stock": VEGETABLE_BROTH,
  "peanut butter": PEANUT_BUTTER,
  "greek yogurt": GREEK_YOGURT,
  "chocolate chip": CHOCOLATE_CHIPS,
  "semisweet chocolate chip": CHOCOLATE_CHIPS,
  "cream cheese": CREAM_CHEESE,
  "whole wheat bread": WHOLE_WHEAT_BREAD,
  "olive oil": OLIVE_OIL,
  "extra virgin olive oil": OLIVE_OIL,
  "extra-virgin olive oil": OLIVE_OIL,
  quinoa: QUINOA,
  "quinoa|cooked": QUINOA_COOKED,
  "canola oil": CANOLA_OIL,
  "coconut oil": COCONUT_OIL,
  "vegetable oil": VEGETABLE_OIL,
  almond: ALMONDS,
  mayonnaise: MAYONNAISE,
  mayo: MAYONNAISE,
  bread: WHITE_BREAD,
  "white bread": WHITE_BREAD,
  "ground beef": GROUND_BEEF,
  zucchini: ZUCCHINI,
  "bell pepper": GREEN_PEPPER,
  "green bell pepper": GREEN_PEPPER,
  "red bell pepper": RED_PEPPER,
  "yellow bell pepper": YELLOW_PEPPER,
  jalapeno: JALAPENO,
  "jalapeno pepper": JALAPENO,
  pasta: PASTA,
  spaghetti: PASTA,
  penne: PASTA,
  macaroni: PASTA,
  "pasta|cooked": PASTA_COOKED,
  "spaghetti|cooked": PASTA_COOKED,
  "penne|cooked": PASTA_COOKED,
  "macaroni|cooked": PASTA_COOKED,
  "black bean": BLACK_BEAN_COOKED,
  "mozzarella cheese": MOZZARELLA,
  mozzarella: MOZZARELLA,
  "parmesan cheese": PARMESAN,
  parmesan: PARMESAN,
  apple: APPLE,
  egg: EGG,
  butter: BUTTER,
};

// `key` is the search phrase with each word already singularized and
// joined by single spaces (see searchWordsOf in resolve.ts).
export function lookupStaple(key: string, isCooked: boolean): FoodMatch | null {
  const found = (isCooked ? STAPLES[`${key}|cooked`] : undefined) ?? STAPLES[key];
  if (!found) return null;
  return { fdcId: found.fdcId, description: found.description, source: found.source ?? "sr_legacy" };
}
