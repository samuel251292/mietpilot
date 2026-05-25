-- Phase 11.2: Initial online schema for cases, profiles, shares and activities.
-- This migration prepares Supabase/Postgres only. The app still uses LocalStorage.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id text primary key,
  tenant text,
  address text,
  status text,
  last_activity text,
  claim_amount numeric,
  owner_id uuid references auth.users(id) on delete set null,
  owner_name text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  extracted jsonb not null default '{}'::jsonb,
  calculation jsonb not null default '{}'::jsonb,
  calculation_report jsonb,
  documents jsonb not null default '[]'::jsonb,
  generated_letters jsonb not null default '[]'::jsonb,
  communication_threads jsonb not null default '[]'::jsonb,
  case_tasks jsonb not null default '[]'::jsonb,
  letter_attachments jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.case_shares (
  id uuid primary key default gen_random_uuid(),
  case_id text not null references public.cases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  permission text not null check (permission in ('read', 'write')),
  created_at timestamptz not null default now(),
  unique (case_id, user_id)
);

create table if not exists public.case_activities (
  id text primary key,
  case_id text not null references public.cases(id) on delete cascade,
  type text,
  title text not null,
  description text,
  user_id uuid references auth.users(id) on delete set null,
  user_name text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_cases_owner_id on public.cases(owner_id);
create index if not exists idx_cases_status on public.cases(status);
create index if not exists idx_cases_created_at on public.cases(created_at);
create index if not exists idx_cases_updated_at on public.cases(updated_at);
create index if not exists idx_case_shares_case_id on public.case_shares(case_id);
create index if not exists idx_case_shares_user_id on public.case_shares(user_id);
create index if not exists idx_case_activities_case_id on public.case_activities(case_id);
create index if not exists idx_case_activities_created_at on public.case_activities(created_at);

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_shares enable row level security;
alter table public.case_activities enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

create or replace function public.can_view_case(target_case_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.cases c
      where c.id = target_case_id
        and (c.owner_id = auth.uid() or c.created_by = auth.uid())
    )
    or exists (
      select 1
      from public.case_shares s
      where s.case_id = target_case_id
        and s.user_id = auth.uid()
    );
$$;

create or replace function public.can_edit_case(target_case_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or exists (
      select 1
      from public.cases c
      where c.id = target_case_id
        and (c.owner_id = auth.uid() or c.created_by = auth.uid())
    )
    or exists (
      select 1
      from public.case_shares s
      where s.case_id = target_case_id
        and s.user_id = auth.uid()
        and s.permission = 'write'
    );
$$;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    id = auth.uid()
    and role = 'employee'
    and status = 'active'
  )
);

drop policy if exists "profiles_insert_admin" on public.profiles;
create policy "profiles_insert_admin"
on public.profiles
for insert
to authenticated
with check (
  public.is_admin()
  or (
    id = auth.uid()
    and role = 'employee'
    and status = 'active'
  )
);

drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin"
on public.profiles
for delete
to authenticated
using (public.is_admin());

drop policy if exists "cases_select_by_access" on public.cases;
create policy "cases_select_by_access"
on public.cases
for select
to authenticated
using (public.can_view_case(id));

drop policy if exists "cases_insert_owner_or_admin" on public.cases;
create policy "cases_insert_owner_or_admin"
on public.cases
for insert
to authenticated
with check (
  public.is_admin()
  or owner_id = auth.uid()
  or created_by = auth.uid()
);

drop policy if exists "cases_update_by_edit_access" on public.cases;
create policy "cases_update_by_edit_access"
on public.cases
for update
to authenticated
using (public.can_edit_case(id))
with check (public.can_edit_case(id));

drop policy if exists "cases_delete_by_edit_access" on public.cases;
create policy "cases_delete_by_edit_access"
on public.cases
for delete
to authenticated
using (public.can_edit_case(id));

drop policy if exists "case_shares_select_by_access" on public.case_shares;
create policy "case_shares_select_by_access"
on public.case_shares
for select
to authenticated
using (
  public.is_admin()
  or user_id = auth.uid()
  or exists (
    select 1
    from public.cases c
    where c.id = case_id
      and (c.owner_id = auth.uid() or c.created_by = auth.uid())
  )
);

drop policy if exists "case_shares_insert_by_owner_or_admin" on public.case_shares;
create policy "case_shares_insert_by_owner_or_admin"
on public.case_shares
for insert
to authenticated
with check (
  public.is_admin()
  or exists (
    select 1
    from public.cases c
    where c.id = case_id
      and (c.owner_id = auth.uid() or c.created_by = auth.uid())
  )
);

drop policy if exists "case_shares_update_by_owner_or_admin" on public.case_shares;
create policy "case_shares_update_by_owner_or_admin"
on public.case_shares
for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.cases c
    where c.id = case_id
      and (c.owner_id = auth.uid() or c.created_by = auth.uid())
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.cases c
    where c.id = case_id
      and (c.owner_id = auth.uid() or c.created_by = auth.uid())
  )
);

drop policy if exists "case_shares_delete_by_owner_or_admin" on public.case_shares;
create policy "case_shares_delete_by_owner_or_admin"
on public.case_shares
for delete
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.cases c
    where c.id = case_id
      and (c.owner_id = auth.uid() or c.created_by = auth.uid())
  )
);

drop policy if exists "case_activities_select_by_case_access" on public.case_activities;
create policy "case_activities_select_by_case_access"
on public.case_activities
for select
to authenticated
using (public.can_view_case(case_id));

drop policy if exists "case_activities_insert_by_case_edit_access" on public.case_activities;
create policy "case_activities_insert_by_case_edit_access"
on public.case_activities
for insert
to authenticated
with check (public.can_edit_case(case_id));

drop policy if exists "case_activities_update_admin" on public.case_activities;
create policy "case_activities_update_admin"
on public.case_activities
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "case_activities_delete_admin" on public.case_activities;
create policy "case_activities_delete_admin"
on public.case_activities
for delete
to authenticated
using (public.is_admin());

comment on table public.cases is 'Phase 11.2 MVP online schema. Large nested fields remain JSONB until later normalized migrations.';
comment on column public.cases.documents is 'Document metadata only for now. File binaries should move to Supabase Storage in a later phase.';
comment on column public.cases.metadata is 'Extension point for generated files, legacy fields and migration bookkeeping.';
