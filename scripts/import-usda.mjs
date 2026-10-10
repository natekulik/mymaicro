// One-time import of USDA FoodData Central (Foundation Foods + SR Legacy +
// Branded Foods) into a local SQLite database the app can query at runtime.
//
// Usage: node --max-old-space-size=4096 scripts/import-usda.mjs
// (the extra heap is for the Branded Foods pass — its CSVs run into the
// gigabytes and millions of rows, well past Foundation/SR Legacy's size)
//
// Source data must already be extracted under
// data/usda/extracted/{foundation,sr_legacy,branded}/ (see data/usda/raw/*.zip
// — downloaded from https://fdc.nal.usda.gov/download-datasets).

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
      source TEXT NOT NULL CHECK (source IN ('foundation', 'sr_legacy', 'branded'))
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

    -- Branded Foods only (see importBranded below) — the brand owner shown
    -- alongside a match. Kept separate from the foods table rather than as
    -- nullable columns there, since every other source leaves it empty.
    CREATE TABLE food_brand_info (
      fdc_id INTEGER PRIMARY KEY REFERENCES foods(fdc_id),
      brand_owner TEXT
    );

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
  const insertBrandInfo = db.prepare("INSERT INTO food_brand_info (fdc_id, brand_owner) VALUES (?, ?)");

  const foodIds = new Set();

  // Foundation/SR Legacy are small enough to load whole (see readCsv
  // above); Branded Foods' CSVs run into the gigabytes and tens of
  // millions of rows, so importBranded (below) streams each file row by
  // row in bounded batches instead.
  async function streamCsvBatched(filePath, batchSize, onBatch) {
    let batch = [];
    const parser = createReadStream(filePath).pipe(parse({ columns: true }));
    for await (const row of parser) {
      batch.push(row);
      if (batch.length >= batchSize) {
        onBatch(batch);
        batch = [];
      }
    }
    if (batch.length > 0) onBatch(batch);
  }

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

  // Branded Foods has no food_portion.csv at all — each product instead
  // carries exactly one label serving size (serving_size +
  // serving_size_unit, always 'g' or 'ml') in branded_food.csv. Synthesizing
  // one food_portions row from that reuses lib/usda/resolve.ts's existing
  // "USDA portion" / bare-count-fallback logic unchanged — no special-casing
  // needed anywhere else in the app for this source to work.
  async function importBranded(dir) {
    console.log(`\n[branded] reading branded_food.csv (brand/serving metadata)…`);
    // fdcId -> { brandOwner, servingSize, servingSizeUnit, portionDescription }
    const brandInfo = new Map();
    let brandedRowsSeen = 0;
    await streamCsvBatched(path.join(dir, "branded_food.csv"), 50000, (batch) => {
      for (const row of batch) {
        const servingSize = row.serving_size !== "" ? Number(row.serving_size) : null;
        brandInfo.set(Number(row.fdc_id), {
          brandOwner: row.brand_owner || null,
          servingSize,
          servingSizeUnit: row.serving_size_unit || null,
          portionDescription: row.household_serving_fulltext || null,
        });
      }
      brandedRowsSeen += batch.length;
      if (brandedRowsSeen % 500000 < batch.length) console.log(`[branded] ...${brandedRowsSeen} brand records read`);
    });
    console.log(`[branded] ${brandInfo.size} brand records loaded`);

    console.log(`[branded] reading food.csv…`);
    let foodRowsSeen = 0;
    let foodsInserted = 0;
    const insertFoodBatch = db.transaction((rows) => {
      for (const row of rows) {
        if (row.data_type !== "branded_food") continue;
        const fdcId = Number(row.fdc_id);
        insertFood.run(fdcId, row.description, "branded");
        foodIds.add(fdcId);
        foodsInserted++;

        const brand = brandInfo.get(fdcId);
        if (brand?.brandOwner) insertBrandInfo.run(fdcId, brand.brandOwner);
        if (brand?.servingSize !== null && brand?.servingSize !== undefined) {
          if (brand.servingSizeUnit === "g" || brand.servingSizeUnit === "ml") {
            insertPortion.run(fdcId, brand.servingSizeUnit, brand.portionDescription, null, brand.servingSize);
          }
        }
      }
    });
    await streamCsvBatched(path.join(dir, "food.csv"), 50000, (batch) => {
      insertFoodBatch(batch);
      foodRowsSeen += batch.length;
      if (foodRowsSeen % 500000 < batch.length) {
        console.log(`[branded] ...${foodRowsSeen} food.csv rows processed, ${foodsInserted} branded foods inserted`);
      }
    });
    console.log(`[branded] inserted ${foodsInserted} branded foods`);
    brandInfo.clear(); // free the ~2M-entry map before the much larger nutrient pass below

    console.log(`[branded] reading food_nutrient.csv (the big one — tens of millions of rows)…`);
    let nutrientRowsSeen = 0;
    let nutrientRowsInserted = 0;
    const insertNutrientBatch = db.transaction((rows) => {
      for (const row of rows) {
        const fdcId = Number(row.fdc_id);
        const nutrientId = Number(row.nutrient_id);
        if (!foodIds.has(fdcId) || !WANTED_NUTRIENT_IDS.has(nutrientId) || row.amount === "") continue;
        insertNutrient.run(fdcId, nutrientId, Number(row.amount));
        nutrientRowsInserted++;
      }
    });
    await streamCsvBatched(path.join(dir, "food_nutrient.csv"), 50000, (batch) => {
      insertNutrientBatch(batch);
      nutrientRowsSeen += batch.length;
      if (nutrientRowsSeen % 2000000 < batch.length) {
        console.log(`[branded] ...${nutrientRowsSeen} food_nutrient.csv rows processed, ${nutrientRowsInserted} kept`);
      }
    });
    console.log(`[branded] inserted ${nutrientRowsInserted} nutrient rows`);

    // Same "must have Energy" bar lib/usda/resolve.ts already enforces at
    // query time (an analyte-only record is useless to this app) — pruning
    // it here at import time instead just saves the dead weight in the
    // committed file rather than silently skipping it on every query.
    console.log(`[branded] pruning branded foods with no usable calorie data…`);
    const pruneIds = db
      .prepare(
        `SELECT fdc_id FROM foods WHERE source = 'branded'
         AND fdc_id NOT IN (SELECT fdc_id FROM food_nutrients WHERE nutrient_id = 1008)`,
      )
      .all()
      .map((r) => r.fdc_id);
    const deleteNutrients = db.prepare("DELETE FROM food_nutrients WHERE fdc_id = ?");
    const deletePortions = db.prepare("DELETE FROM food_portions WHERE fdc_id = ?");
    const deleteBrandInfo = db.prepare("DELETE FROM food_brand_info WHERE fdc_id = ?");
    const deleteFood = db.prepare("DELETE FROM foods WHERE fdc_id = ?");
    const pruneBatch = db.transaction((ids) => {
      for (const id of ids) {
        deleteNutrients.run(id);
        deletePortions.run(id);
        deleteBrandInfo.run(id);
        deleteFood.run(id);
        foodIds.delete(id);
      }
    });
    pruneBatch(pruneIds);
    console.log(`[branded] pruned ${pruneIds.length} foods with no calorie data`);
  }

  await importDataset(foundationDir, "foundation", "foundation_food");
  await importDataset(srLegacyDir, "sr_legacy", "sr_legacy_food");
  await importBranded(findExtractedDir("branded"));

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
