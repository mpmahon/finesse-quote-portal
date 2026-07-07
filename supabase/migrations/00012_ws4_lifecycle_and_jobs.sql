-- ============================================================
-- WS4: quote lifecycle columns + jobs & installation scheduling
-- (design doc v2 §9). Depends on 00011 (new quote_status values).
--
-- Lifecycle: draft → sent → accepted | declined; 'expired' is derived at
-- read time from expires_at while status = 'sent' (no cron). Transitions
-- happen only in server actions (service role after authorization) and
-- every transition writes audit_logs.
-- ============================================================

-- 1. Lifecycle stamp columns.
alter table public.quotes
  add column if not exists sent_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists accepted_by uuid references public.profiles(id),
  add column if not exists declined_at timestamptz,
  add column if not exists decline_reason text;

create index if not exists quotes_status_idx on public.quotes(status);

-- 2. Data migration: legacy 'final' quotes were handed to customers, so they
--    map to 'sent' (stamped with their creation time).
update public.quotes
  set status = 'sent', sent_at = coalesce(sent_at, created_at)
  where status = 'final';

-- 3. Jobs & assignments.
do $$ begin
  create type public.job_status as enum
    ('pending', 'measure', 'fabricate', 'install', 'complete', 'on_hold');
exception when duplicate_object then null;
end $$;

create table if not exists public.jobs (
  id                      uuid primary key default gen_random_uuid(),
  quote_id                uuid not null unique references public.quotes(id) on delete cascade,
  property_id             uuid not null references public.properties(id) on delete cascade,
  status                  public.job_status not null default 'pending',
  scheduled_install_date  date,
  install_notes           text,
  created_by              uuid not null references public.profiles(id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table if not exists public.job_assignments (
  id          uuid primary key default gen_random_uuid(),
  job_id      uuid not null references public.jobs(id) on delete cascade,
  assignee_id uuid not null references public.profiles(id),
  role        text not null default 'installer',
  created_at  timestamptz not null default now(),
  unique (job_id, assignee_id)
);

create index if not exists jobs_status_idx on public.jobs(status);
create index if not exists jobs_property_idx on public.jobs(property_id);
create index if not exists jobs_scheduled_idx on public.jobs(scheduled_install_date);
create index if not exists job_assignments_job_idx on public.job_assignments(job_id);
create index if not exists job_assignments_assignee_idx on public.job_assignments(assignee_id);

-- 4. updated_at maintenance.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_set_updated_at on public.jobs;
create trigger jobs_set_updated_at
  before update on public.jobs
  for each row execute function public.set_updated_at();

-- 5. RLS: staff full CRUD; customers read their own jobs via the quote join.
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;

drop policy if exists "jobs_all_staff" on public.jobs;
create policy "jobs_all_staff" on public.jobs
  for all
  using (public.get_user_role() in ('salesman', 'administrator'))
  with check (public.get_user_role() in ('salesman', 'administrator'));

drop policy if exists "jobs_select_own" on public.jobs;
create policy "jobs_select_own" on public.jobs
  for select using (
    exists (
      select 1 from public.quotes
      where quotes.id = jobs.quote_id and quotes.user_id = auth.uid()
    )
  );

drop policy if exists "job_assignments_all_staff" on public.job_assignments;
create policy "job_assignments_all_staff" on public.job_assignments
  for all
  using (public.get_user_role() in ('salesman', 'administrator'))
  with check (public.get_user_role() in ('salesman', 'administrator'));

drop policy if exists "job_assignments_select_own" on public.job_assignments;
create policy "job_assignments_select_own" on public.job_assignments
  for select using (
    exists (
      select 1
      from public.jobs
      join public.quotes on quotes.id = jobs.quote_id
      where jobs.id = job_assignments.job_id and quotes.user_id = auth.uid()
    )
  );
