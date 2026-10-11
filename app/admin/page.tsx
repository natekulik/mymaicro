import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail, hasSatisfiedMfa } from "@/lib/admin";
import AdminMfaSetup from "@/components/AdminMfaSetup";

export const runtime = "nodejs";

// Row counts bypass RLS entirely via the service-role client — every
// other page in this app only ever sees the signed-in user's own rows,
// but this one deliberately needs totals across every account, which is
// exactly what RLS exists to prevent for anyone else.
async function countRows(
  admin: ReturnType<typeof createAdminClient>,
  table: string,
): Promise<number> {
  const { count } = await admin.from(table).select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function getStats() {
  const admin = createAdminClient();

  const [
    totalUsers,
    totalRecipes,
    totalMacroProfiles,
    totalWeeklyPlans,
    totalRecipeGroups,
    totalMacroPresets,
    totalWeeklyPresets,
    optimizeUsage,
  ] = await Promise.all([
    countRows(admin, "profiles"),
    countRows(admin, "saved_recipes"),
    countRows(admin, "macro_profiles"),
    countRows(admin, "weekly_plan_templates"),
    countRows(admin, "recipe_groups"),
    countRows(admin, "macro_presets"),
    countRows(admin, "weekly_presets"),
    admin.from("optimize_usage").select("count"),
  ]);

  const optimizeRows = optimizeUsage.data ?? [];
  const totalOptimizations = optimizeRows.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const usersWhoOptimized = optimizeRows.length;

  return {
    totalUsers,
    totalRecipes,
    totalMacroProfiles,
    totalWeeklyPlans,
    totalRecipeGroups,
    totalPresets: totalMacroPresets + totalWeeklyPresets,
    totalOptimizations,
    usersWhoOptimized,
  };
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
        {value.toLocaleString()}
      </span>
      {hint && <span className="text-xs text-zinc-400">{hint}</span>}
    </div>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirects rather than a visible "not authorized" page — this route's
  // existence isn't meant to be discoverable, same reasoning as why
  // NavTabs only shows the link to an admin account in the first place.
  if (!isAdminEmail(user?.email)) {
    redirect("/");
  }

  // Once this account has a verified TOTP factor (see AdminMfaSetup
  // below), every session must complete it before seeing anything past
  // this point — not just the first time. Before enrollment, nextLevel
  // stays 'aal1' (nothing to satisfy), so this is a no-op until then.
  if (!(await hasSatisfiedMfa(supabase))) {
    redirect("/admin/verify-mfa");
  }

  const stats = await getStats();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Admin — usage overview
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Site-wide totals across every account. Visible only to {user?.email}.
        </p>
      </header>

      <AdminMfaSetup />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Total users" value={stats.totalUsers} />
        <StatCard label="Recipes saved" value={stats.totalRecipes} />
        <StatCard
          label="Optimizations run"
          value={stats.totalOptimizations}
          hint={`${stats.usersWhoOptimized.toLocaleString()} user${stats.usersWhoOptimized === 1 ? "" : "s"} have used it`}
        />
        <StatCard label="Macro profiles set up" value={stats.totalMacroProfiles} />
        <StatCard label="Weekly plans created" value={stats.totalWeeklyPlans} />
        <StatCard label="Recipe groups created" value={stats.totalRecipeGroups} />
        <StatCard label="Presets saved" value={stats.totalPresets} hint="Macro + weekly presets combined" />
      </section>
    </div>
  );
}
