// One-time import of USDA FoodData Central (Foundation Foods + SR Legacy)
// into a local SQLite database the app can query at runtime.
//
// Usage: node scripts/import-usda.mjs
//
// Source data must already be extracted under data/usda/extracted/{foundation,sr_legacy}/
// (see data/usda/raw/*.zip — downloaded from https://fdc.nal.usda.gov/download-datasets).

import { createReadStream, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const USDA_DIR = path.join(ROOT, "data", "usda");
const DB_PATH = path.join(USDA_DIR, "foods.db");

// The core macro nutrients. USDA nutrient IDs (verified against the
// downloaded nutrient.csv — these are the internal `id` column values, not
// the classic INFOODS numbers):
//   1008 = Energy (KCAL)              1003 = Protein (G)
//   1004 = Total lipid (fat) (G)      1005 = Carbohydrate, by difference (G)
const CORE_MACRO_IDS = [1008, 1003, 1004, 1005];

// Micronutrients shown in the app's "Micros" view — keep this list in sync
// with lib/usda/micro-nutrients.ts (that file can't be imported directly
// here since it's TypeScript and this is a plain Node script).
const MICRO_IDS = [
  1258, 1257, 1253, 1093, 1092, 1079, 1063, 1235, 1087, 1089, 1090, 1095, 1106, 1162, 1114, 1158,
  1185, 1175, 1178, 1177, 1165, 1166, 1167,
];

const WANTED_NUTRIENT_IDS = new Set([...CORE_MACRO_IDS, ...MICRO_IDS]);

function findExtractedDir(kind) {
  const base = path.join(USDA_DIR, "extracted", kind);
  if (!existsSync(base)) {
    throw new Error(`Missing ${base} — unzip the ${kind} dataset first.`);
  }
  const nested = readdirSync(base).find((name) => statSync(path.join(base, name)).isDirectory());
  return nested ? path.join(base, nested) : base;
}

function readCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    createReadStream(filePath)
      .pipe(parse({ columns: true }))
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

async function main() {
  const foundationDir = findExtractedDir("foundation");
  const srLegacyDir = findExtractedDir("sr_legacy");

  if (existsSync(DB_PATH)) unlinkSync(DB_PATH);
  mkdirSync(USDA_DIR, { recursive: true });
  // Default (non-WAL) journal mode: this DB is a build-once, read-only
  // artifact meant to be committed as a single file — no -wal/-shm sidecars.
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE foods (
      fdc_id INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      source TEXT NOT NULL CHECK (source IN ('foundation', 'sr_legacy'))
    );

    CREATE TABLE food_nutrients (
      fdc_id INTEGER NOT NULL REFERENCES foods(fdc_id),
      nutrient_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      PRIMARY KEY (fdc_id, nutrient_id)
    );

    CREATE TABLE food_portions (
      fdc_id INTEGER NOT NULL REFERENCES foods(fdc_id),
      unit_name TEXT,
      portion_description TEXT,
      modifier TEXT,
      gram_weight REAL NOT NULL
    );
    CREATE INDEX idx_food_portions_fdc ON food_portions(fdc_id);

    CREATE VIRTUAL TABLE foods_fts USING fts5(
      description,
      content='foods',
      content_rowid='fdc_id'
    );
  `);

  const insertFood = db.prepare("INSERT INTO foods (fdc_id, description, source) VALUES (?, ?, ?)");
  // A handful of foods carry two source rows for the same nutrient (e.g.
  // an analyzed value and a calculated one) — OR IGNORE keeps whichever
  // was inserted first rather than erroring on the duplicate.
  const insertNutrient = db.prepare(
    "INSERT OR IGNORE INTO food_nutrients (fdc_id, nutrient_id, amount) VALUES (?, ?, ?)",
  );
  const insertPortion = db.prepare(
    "INSERT INTO food_portions (fdc_id, unit_name, portion_description, modifier, gram_weight) VALUES (?, ?, ?, ?, ?)",
  );

  const foodIds = new Set();

  async function importDataset(dir, source, foodTypeFilter) {
    console.log(`\n[${source}] reading food.csv…`);
    const foods = await readCsv(path.join(dir, "food.csv"));
    const kept = foods.filter((f) => f.data_type === foodTypeFilter);
    console.log(`[${source}] ${kept.length} of ${foods.length} rows are '${foodTypeFilter}'`);

    const insertFoods = db.transaction((rows) => {
      for (const row of rows) {
        const fdcId = Number(row.fdc_id);
        insertFood.run(fdcId, row.description, source);
        foodIds.add(fdcId);
      }
    });
    insertFoods(kept);

    console.log(`[${source}] reading food_nutrient.csv…`);
    const nutrients = await readCsv(path.join(dir, "food_nutrient.csv"));
    const wantedNutrients = nutrients.filter((n) => {
      const fdcId = Number(n.fdc_id);
      const nutrientId = Number(n.nutrient_id);
      return foodIds.has(fdcId) && WANTED_NUTRIENT_IDS.has(nutrientId) && n.amount !== "";
    });
    const insertNutrients = db.transaction((rows) => {
      for (const row of rows) {
        insertNutrient.run(Number(row.fdc_id), Number(row.nutrient_id), Number(row.amount));
      }
    });
    insertNutrients(wantedNutrients);
    console.log(`[${source}] inserted ${wantedNutrients.length} macro nutrient rows`);

    console.log(`[${source}] reading measure_unit.csv + food_portion.csv…`);
    const measureUnits = await readCsv(path.join(dir, "measure_unit.csv"));
    const unitNameById = new Map(measureUnits.map((u) => [u.id, u.name]));
    const portions = await readCsv(path.join(dir, "food_portion.csv"));
    const relevantPortions = portions.filter(
      (p) => foodIds.has(Number(p.fdc_id)) && p.gram_weight !== "",
    );
    const insertPortions = db.transaction((rows) => {
      for (const row of rows) {
        insertPortion.run(
          Number(row.fdc_id),
          unitNameById.get(row.measure_unit_id) ?? null,
          row.portion_description || null,
          row.modifier || null,
          Number(row.gram_weight),
        );
      }
    });
    insertPortions(relevantPortions);
    console.log(`[${source}] inserted ${relevantPortions.length} portion rows`);
  }

  await importDataset(foundationDir, "foundation", "foundation_food");
  await importDataset(srLegacyDir, "sr_legacy", "sr_legacy_food");

  console.log("\nBuilding full-text search index…");
  db.exec("INSERT INTO foods_fts(rowid, description) SELECT fdc_id, description FROM foods");

  const totalFoods = db.prepare("SELECT COUNT(*) AS n FROM foods").get().n;
  console.log(`\nDone. ${totalFoods} ingredients imported into ${path.relative(ROOT, DB_PATH)}`);

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
