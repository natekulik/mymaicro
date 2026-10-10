import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

// Single shared read-only connection to the USDA ingredient database (built
// by scripts/import-usda.mjs — see data/usda/foods.db). Node-runtime only;
// never import this from client components.
//
// The built file is ~1GB (it now includes USDA Branded Foods), too large to
// commit to git or bundle into the Vercel function. Locally it just sits on
// disk (gitignored) and is used directly. In production it doesn't exist in
// the deployment at all, so ensureUsdaDbReady() downloads it once from
// Cloudflare R2 (see scripts/upload-usda-db.mjs) into /tmp and caches it
// there for the life of the serverless instance.
let db: Database.Database | null = null;
let readyPromise: Promise<void> | null = null;

const LOCAL_DB_PATH = path.join(process.cwd(), "data", "usda", "foods.db");
const CACHED_DB_PATH = path.join(os.tmpdir(), "mymaicro-foods.db");

async function resolveDbPath(): Promise<string> {
  if (fs.existsSync(LOCAL_DB_PATH)) return LOCAL_DB_PATH;
  if (fs.existsSync(CACHED_DB_PATH)) return CACHED_DB_PATH;

  const url = process.env.USDA_DB_URL;
  if (!url) {
    throw new Error(
      "USDA ingredient database not found locally and USDA_DB_URL isn't set — can't download it.",
    );
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download USDA database from USDA_DB_URL: ${res.status} ${res.statusText}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpPath = `${CACHED_DB_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, buffer);
  fs.renameSync(tmpPath, CACHED_DB_PATH);
  return CACHED_DB_PATH;
}

// Call once, with `await`, before any getUsdaDb() use on a given request
// path (the API routes do this first thing). A no-op after the first
// successful call for the life of the process.
export async function ensureUsdaDbReady(): Promise<void> {
  if (db) return;
  if (!readyPromise) {
    readyPromise = resolveDbPath().then((dbPath) => {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
    });
  }
  await readyPromise;
}

export function getUsdaDb(): Database.Database {
  if (!db) throw new Error("getUsdaDb() called before ensureUsdaDbReady() finished.");
  return db;
}
