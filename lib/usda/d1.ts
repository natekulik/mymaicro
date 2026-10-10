// Thin client for Cloudflare D1's HTTP API — replaces the old local
// better-sqlite3 connection (see git history for lib/usda/db.ts) now that
// the USDA database (foods + branded products, ~1.9M rows) is too large
// for Vercel's 500MB /tmp cap. Every query is a real network call, so
// callers should batch aggressively (e.g. `WHERE fdc_id IN (...)` for many
// ids in one round trip) rather than loop one query per row — the D1 REST
// API has no multi-statement batching with bound params, only one
// statement per HTTP call.
const D1_QUERY_URL = () =>
  `https://api.cloudflare.com/client/v4/accounts/${requireEnv("CLOUDFLARE_ACCOUNT_ID")}/d1/database/${requireEnv("D1_DATABASE_ID")}/query`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name} — can't reach the USDA database.`);
  return value;
}

type D1Response<T> = {
  success: boolean;
  result: { results: T[] }[];
  errors: { message: string }[];
};

export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  const res = await fetch(D1_QUERY_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("CLOUDFLARE_API_TOKEN")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  const json = (await res.json()) as D1Response<T>;
  if (!res.ok || !json.success) {
    throw new Error(`D1 query failed: ${json.errors?.map((e) => e.message).join("; ") ?? res.statusText}`);
  }
  return json.result[0]?.results ?? [];
}
