-- mymaicro database schema
-- Run this once in your Supabase project: Dashboard -> SQL Editor -> New
-- query -> paste this whole file -> Run. Safe to re-run (uses IF NOT
-- EXISTS / OR REPLACE / DROP POLICY IF EXISTS throughout).
--
-- One table per current localStorage key (see the "mymaicro:*" keys in
-- lib/*.ts). Single-document data (a profile, a template, an overrides
-- map) is stored as one JSONB row per user, mirroring the shape already
-- used in localStorage almost exactly. List data (recipes, groups,
-- presets) gets its own row per item, keyed by the same string ids the
-- app already generates client-side.

-- ============================================================
-- profiles — username + phone (the two fields Supabase Auth's own
-- email+password identity doesn't carry). One row per auth user, created
-- automatically by the trigger at the bottom when someone signs up.
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  phone text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles: select own" on public.profiles;
create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- ============================================================
-- Small helper: every "single JSONB document per user" table below
-- shares the same shape and the same four RLS policies, so this function
-- adds them in one call instead of repeating 20 lines four times.
-- ============================================================
create or replace function public.create_user_document_table(table_name text)
returns void
language plpgsql
as $$
begin
  execute format(
    'create table if not exists public.%I (
       user_id uuid primary key references auth.users (id) on delete cascade,
       data jsonb not null,
       updated_at timestamptz not null default now()
     )',
    table_name
  );
  execute format('alter table public.%I enable row level security', table_name);

  execute format('drop policy if exists "%1$s: select own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: select own" on public.%1$I for select using (auth.uid() = user_id)',
    table_name
  );

  execute format('drop policy if exists "%1$s: insert own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: insert own" on public.%1$I for insert with check (auth.uid() = user_id)',
    table_name
  );

  execute format('drop policy if exists "%1$s: update own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: update own" on public.%1$I for update using (auth.uid() = user_id)',
    table_name
  );

  execute format('drop policy if exists "%1$s: delete own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: delete own" on public.%1$I for delete using (auth.uid() = user_id)',
    table_name
  );
end;
$$;

-- lib/storage.ts: MacroProfile { dailyTarget, meals, macroColors }
select public.create_user_document_table('macro_profiles');
-- lib/weekly-plan.ts: WeeklyPlan { days } — the recurring default template
select public.create_user_document_table('weekly_plan_templates');
-- lib/weekly-plan.ts: WeekOverrides (Record<weekStart, DayPlan[]>)
select public.create_user_document_table('weekly_plan_week_overrides');
-- lib/history.ts: HistoryLog { overrides: Record<date, HistoryDay> }
select public.create_user_document_table('history_log');

-- ============================================================
-- List tables — one row per item, same string ids the app already
-- generates (e.g. "preset-<timestamp>-<random>"), so existing
-- localStorage data can be inserted as-is during a manual migration.
-- ============================================================

create table if not exists public.weekly_presets (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  days jsonb not null
);

create table if not exists public.macro_presets (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  daily_target jsonb not null,
  meals jsonb not null
);

create table if not exists public.saved_recipes (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  source_url text,
  servings integer not null,
  nutrition jsonb not null,
  micros jsonb not null,
  ingredients jsonb not null,
  saved_at timestamptz not null default now()
);

create table if not exists public.recipe_groups (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- Many-to-many: a recipe can belong to several groups.
create table if not exists public.recipe_group_assignments (
  user_id uuid not null references auth.users (id) on delete cascade,
  recipe_id text not null,
  group_id text not null,
  primary key (user_id, recipe_id, group_id)
);

create or replace function public.enable_rls_for_own_user_id(table_name text)
returns void
language plpgsql
as $$
begin
  execute format('alter table public.%I enable row level security', table_name);

  execute format('drop policy if exists "%1$s: select own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: select own" on public.%1$I for select using (auth.uid() = user_id)',
    table_name
  );

  execute format('drop policy if exists "%1$s: insert own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: insert own" on public.%1$I for insert with check (auth.uid() = user_id)',
    table_name
  );

  execute format('drop policy if exists "%1$s: update own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: update own" on public.%1$I for update using (auth.uid() = user_id)',
    table_name
  );

  execute format('drop policy if exists "%1$s: delete own" on public.%1$I', table_name);
  execute format(
    'create policy "%1$s: delete own" on public.%1$I for delete using (auth.uid() = user_id)',
    table_name
  );
end;
$$;

select public.enable_rls_for_own_user_id('weekly_presets');
select public.enable_rls_for_own_user_id('macro_presets');
select public.enable_rls_for_own_user_id('saved_recipes');
select public.enable_rls_for_own_user_id('recipe_groups');
select public.enable_rls_for_own_user_id('recipe_group_assignments');

-- ============================================================
-- Auto-create a profiles row (username + phone) whenever someone signs
-- up. The signup form passes username/phone as auth "user metadata"
-- (supabase.auth.signUp({ options: { data: { username, phone } } })),
-- which this trigger reads and copies into public.profiles.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- Username <-> email lookups. Supabase Auth's identity is email, but the
-- signup form also collects a username — these let "log in with your
-- username" and "forgot username" work without exposing auth.users
-- directly (RLS can't apply to a system schema, so this is done via
-- security-definer functions with deliberately narrow grants instead).
-- ============================================================

-- Used by the login form (callable by a signed-out visitor) to resolve
-- "username or email" down to the email Supabase Auth actually signs in
-- with. Left as PUBLIC-executable like Supabase's own defaults — the
-- same "does this identifier exist" signal a login form already leaks.
create or replace function public.get_email_by_username(lookup_username text)
returns text
language sql
security definer
set search_path = public
as $$
  select au.email
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.username = lookup_username
  limit 1;
$$;

-- Used only by the /api/forgot-username route (via the service-role
-- client), never called directly from the browser — so its grant is
-- deliberately narrowed to service_role only, unlike the function above.
create or replace function public.get_username_by_email(lookup_email text)
returns text
language sql
security definer
set search_path = public
as $$
  select p.username
  from public.profiles p
  join auth.users au on au.id = p.id
  where au.email = lookup_email
  limit 1;
$$;

revoke execute on function public.get_username_by_email(text) from public;
grant execute on function public.get_username_by_email(text) to service_role;

-- ============================================================
-- Grants — RLS policies only restrict which ROWS a role can see once it
-- already has table-level access; without these, every query fails with
-- "permission denied for table ..." before RLS ever gets a say. Supabase's
-- dashboard table creator adds these automatically, but tables created via
-- raw SQL (like this whole file) don't get them for free. Only
-- `authenticated` needs access — the whole app requires login, so `anon`
-- should never be touching these tables.
-- ============================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.macro_profiles to authenticated;
grant select, insert, update, delete on table public.weekly_plan_templates to authenticated;
grant select, insert, update, delete on table public.weekly_plan_week_overrides to authenticated;
grant select, insert, update, delete on table public.history_log to authenticated;
grant select, insert, update, delete on table public.weekly_presets to authenticated;
grant select, insert, update, delete on table public.macro_presets to authenticated;
grant select, insert, update, delete on table public.saved_recipes to authenticated;
grant select, insert, update, delete on table public.recipe_groups to authenticated;
grant select, insert, update, delete on table public.recipe_group_assignments to authenticated;
