import path from "node:path";
import Database from "better-sqlite3";

// Single shared read-only connection to the local USDA ingredient database
// (built by scripts/import-usda.mjs — see data/usda/foods.db). Node-runtime
// only; never import this from client components.
let db: Database.Database | null = null;

export function getUsdaDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(process.cwd(), "data", "usda", "foods.db");
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
  }
  return db;
}
