// One-time (or per-rebuild) upload of the built USDA ingredient database to
// Cloudflare R2. Run this locally after `node scripts/import-usda.mjs`
// produces a new data/usda/foods.db — the file is too large to commit to
// git, so the deployed app downloads it from R2 instead (see lib/usda/db.ts).
//
//   node scripts/upload-usda-db.mjs
//
// Needs R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
// in .env.local. After uploading, make sure the bucket's public access is
// enabled (Cloudflare dashboard -> R2 -> bucket -> Settings) and USDA_DB_URL
// in .env.local / Vercel points at the resulting pub-*.r2.dev URL for this
// object.

import { config } from "dotenv";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

config({ path: path.join(process.cwd(), ".env.local") });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  console.error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME in .env.local");
  process.exit(1);
}

const dbPath = path.join(process.cwd(), "data", "usda", "foods.db");
const stats = statSync(dbPath);
console.log(`Uploading ${dbPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB) to r2://${bucket}/foods.db ...`);

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
});

await client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: "foods.db",
    Body: readFileSync(dbPath),
    ContentType: "application/x-sqlite3",
  }),
);

console.log("Done.");
