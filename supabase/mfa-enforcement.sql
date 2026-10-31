-- ============================================================
-- Enforce the authenticator-app (TOTP) second factor in the database
-- itself — run once in the Supabase SQL Editor, after schema.sql.
--
-- The app already asks for the code at login (components/auth/LoginForm.tsx),
-- but that's only the website's door. This makes the database enforce it
-- too: an account that has a verified authenticator factor can only read
-- or write its own rows with a session that has completed the code check
-- (JWT "aal" = 'aal2'). A password-only session gets nothing back, even if
-- someone talks to Supabase directly instead of going through the site.
--
-- Accounts with NO verified factor (everyone except the admin account) are
-- unaffected: the check passes for them as before. The service-role key
-- (admin dashboard) bypasses row-level security entirely, so it's unaffected.
--
-- Safe to re-run.
-- ============================================================

-- True when this user either has no verified authenticator factor, or has
-- one and the current session has completed it. Security definer so it can
-- look in auth.mfa_factors, which regular sessions can't read directly.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    )
    then coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
    else true
  end;
$$;

revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

-- A RESTRICTIVE policy is ANDed with the existing "own rows" policies
-- instead of replacing them, so those keep working exactly as before.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles',
    'macro_profiles',
    'weekly_plan_templates',
    'weekly_plan_week_overrides',
    'history_log',
    'weekly_presets',
    'macro_presets',
    'saved_recipes',
    'recipe_groups',
    'recipe_group_assignments',
    'optimize_usage'
  ]
  loop
    execute format('drop policy if exists "require mfa when enrolled" on public.%I', t);
    execute format(
      'create policy "require mfa when enrolled" on public.%I as restrictive for all to authenticated using ((select public.mfa_satisfied())) with check ((select public.mfa_satisfied()))',
      t
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- To undo (e.g. if you ever get locked out), run this instead:
--
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['profiles','macro_profiles','weekly_plan_templates',
--     'weekly_plan_week_overrides','history_log','weekly_presets','macro_presets',
--     'saved_recipes','recipe_groups','recipe_group_assignments','optimize_usage']
--   loop
--     execute format('drop policy if exists "require mfa when enrolled" on public.%I', t);
--   end loop;
-- end $$;
-- ------------------------------------------------------------
