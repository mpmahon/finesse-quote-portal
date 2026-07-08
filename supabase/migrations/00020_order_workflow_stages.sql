-- ============================================================
-- Batch 11: client's 16-stage order workflow.
--
-- Replaces the coarse 6-value `jobs.status` field as the source of truth
-- driving the jobs board and the job-detail stepper. `status` itself is
-- kept (per brief) for backward compatibility, but nothing in the UI
-- writes to it after this migration.
--
-- SOURCING NOTE: this migration was written without being able to re-read
-- the applied `00012_ws4_lifecycle_and_jobs.sql` directly — a local
-- Dropbox cloud-sync fault made that one specific file unreadable for the
-- entire session (confirmed failing identically via `cat`, PowerShell
-- `Get-FileHash`, `Copy-Item`, and `robocopy` — all four report "the cloud
-- operation was unsuccessful" only for this file, while every other
-- migration in the folder hydrated fine after a retry). The `jobs` /
-- `job_assignments` column list, the unique constraint on `quote_id`
-- (relied on by the accept-quote upsert in `quotes/actions.ts`), and the
-- staff-CRUD / customer-read-own RLS shape are reconstructed with high
-- confidence from three independent sources that all have to agree with
-- the live schema for the app to work today: the hand-maintained
-- `Job` / `JobAssignment` TypeScript interfaces in `src/types/database.ts`,
-- the working server actions in `src/app/jobs/actions.ts` and
-- `src/app/quotes/actions.ts` (which read/write these exact columns
-- against the live DB right now), and the identical
-- `<table>_select_own` / `<table>_*_staff` policy-naming convention used
-- verbatim in every other migration in this repo (00001, 00008, 00009,
-- 00016, 00017). Because the *exact* prior policy names on
-- `jobs` / `job_assignments` specifically could not be confirmed, section 4
-- below drops ALL existing policies on both tables programmatically (via
-- `pg_policies`) before recreating the full desired set from scratch,
-- rather than guessing individual `drop policy` names — this is correct
-- regardless of what the prior names actually were.
--
-- Mark: please diff this against the live schema (Supabase `list_tables` /
-- advisors, or just re-open 00012 once Dropbox catches up) before applying,
-- given the above. Flagged in the batch report too.
-- ============================================================

-- ------------------------------------------------------------
-- 1. workflow_stage — the 16-stage order workflow.
--    Plain `text` + CHECK rather than an enum: Postgres enums can't be
--    reordered or have values inserted mid-list without dropping/recreating
--    the type, and this list will likely be refined further with the
--    client. Stage ORDER is defined in code (`WORKFLOW_STAGES` in
--    src/lib/constants.ts), not in the DB.
-- ------------------------------------------------------------

alter table public.jobs add column if not exists workflow_stage text;

-- Backfill from the existing `status` value (pending | measure | fabricate
-- | install | complete | on_hold):
--   pending    -> job_approved            (jobs were only ever auto-created
--                                          on quote acceptance, i.e. always
--                                          post-approval)
--   measure    -> stock_check             (closest existing stage to an
--                                          on-site / stock verification
--                                          step ahead of fabrication)
--   fabricate  -> fabrication_scheduled   (explicit 1:1 per the brief)
--   install    -> installation_scheduled  (explicit 1:1 per the brief)
--   complete   -> installation_complete   (explicit 1:1 per the brief)
--   on_hold    -> job_approved            (no equivalent "paused" stage in
--                                          the 16-stage model; treated as a
--                                          stalled early-post-approval job.
--                                          `scripts/seed-demo.ts` never
--                                          creates an on_hold job, so this
--                                          branch is precautionary only.)
update public.jobs
set workflow_stage = case status
  when 'pending'   then 'job_approved'
  when 'measure'   then 'stock_check'
  when 'fabricate' then 'fabrication_scheduled'
  when 'install'   then 'installation_scheduled'
  when 'complete'  then 'installation_complete'
  when 'on_hold'   then 'job_approved'
  else 'job_approved'
end
where workflow_stage is null;

alter table public.jobs
  alter column workflow_stage set default 'request_received',
  alter column workflow_stage set not null;

alter table public.jobs
  add constraint chk_jobs_workflow_stage check (workflow_stage in (
    'request_received', 'site_visit_done', 'quote_complete', 'quote_sent',
    'follow_up', 'job_approved', 'internal_order', 'stock_check',
    'fabrication_scheduled', 'production_complete', 'installation_scheduled',
    'invoice_created', 'invoice_sent', 'installation_complete',
    'payment_follow_up', 'after_sales_follow_up'
  ));

create index if not exists jobs_workflow_stage_idx on public.jobs(workflow_stage);

-- ------------------------------------------------------------
-- 2. stage_history — append-only audit trail of workflow_stage
--    transitions, written app-side on every move (see `advanceJobStage` in
--    src/lib/jobs.ts). Shape: [{ stage, at, actor_id }, ...].
-- ------------------------------------------------------------

alter table public.jobs add column if not exists stage_history jsonb not null default '[]'::jsonb;

-- Seed a single synthetic entry for pre-existing rows so the history list
-- isn't empty for jobs created before this migration. `created_by` is the
-- best available proxy for "who moved it here" since there's no real
-- transition record before now.
update public.jobs
set stage_history = jsonb_build_array(
  jsonb_build_object(
    'stage', workflow_stage,
    'at', to_jsonb(coalesce(updated_at, created_at)),
    'actor_id', created_by
  )
)
where stage_history = '[]'::jsonb;

-- ------------------------------------------------------------
-- 3. Pre-quote orders — quote_id / property_id become nullable, and a new
--    customer_id is added, so a walk-in request (stages 1-5) can exist
--    before any quote — or even before a property is picked.
-- ------------------------------------------------------------

alter table public.jobs add column if not exists customer_id uuid references public.profiles(id);

-- Backfill customer_id from the linked quote for every existing row (every
-- pre-Batch-11 job has a quote_id, since jobs were only ever auto-created
-- on quote acceptance).
update public.jobs j
set customer_id = q.user_id
from public.quotes q
where j.quote_id = q.id and j.customer_id is null;

alter table public.jobs alter column quote_id drop not null;
alter table public.jobs alter column property_id drop not null;

-- A job must be anchored to *something* — either a quote (which itself
-- carries a customer + property) or a customer_id (the walk-in path).
-- Not explicitly requested in the brief; added as a data-integrity
-- safeguard given customer_id is otherwise the only thing keeping a
-- quote-less job attributable to anyone. Flagged as a judgment call.
alter table public.jobs
  add constraint chk_jobs_has_anchor check (quote_id is not null or customer_id is not null);

create index if not exists jobs_customer_id_idx on public.jobs(customer_id);
create index if not exists jobs_property_id_idx on public.jobs(property_id);

-- ------------------------------------------------------------
-- 4. RLS — staff keep full CRUD; customer read-own is widened to match on
--    customer_id OR the linked quote's owner OR the linked property's
--    owner, covering every stage of the new lifecycle (including
--    pre-quote and pre-property rows). See the note at the top of this
--    file for why this drops-and-recreates rather than naming exact prior
--    policies.
-- ------------------------------------------------------------

do $$
declare
  pol record;
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and tablename in ('jobs', 'job_assignments')
  loop
    execute format('drop policy if exists %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  end loop;
end $$;

alter table public.jobs enable row level security;

create policy "jobs_select_own" on public.jobs
  for select using (
    customer_id = auth.uid()
    or exists (select 1 from public.quotes where quotes.id = jobs.quote_id and quotes.user_id = auth.uid())
    or exists (select 1 from public.properties where properties.id = jobs.property_id and properties.user_id = auth.uid())
  );

create policy "jobs_select_staff" on public.jobs
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "jobs_insert_staff" on public.jobs
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "jobs_update_staff" on public.jobs
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "jobs_delete_staff" on public.jobs
  for delete using (public.get_user_role() in ('salesman', 'administrator'));

alter table public.job_assignments enable row level security;

-- Writes stay staff-only. Customers keep read access to assignments on
-- their own jobs (parity with 00012's job_assignments_select_own — who's
-- coming to install is customer-appropriate), scoped through the widened
-- job anchors (customer_id / quote owner / property owner).
create policy "job_assignments_select_staff" on public.job_assignments
  for select using (public.get_user_role() in ('salesman', 'administrator'));
create policy "job_assignments_select_own" on public.job_assignments
  for select using (
    exists (
      select 1 from public.jobs
      where jobs.id = job_assignments.job_id
        and (
          jobs.customer_id = auth.uid()
          or exists (select 1 from public.quotes where quotes.id = jobs.quote_id and quotes.user_id = auth.uid())
          or exists (select 1 from public.properties where properties.id = jobs.property_id and properties.user_id = auth.uid())
        )
    )
  );
create policy "job_assignments_insert_staff" on public.job_assignments
  for insert with check (public.get_user_role() in ('salesman', 'administrator'));
create policy "job_assignments_update_staff" on public.job_assignments
  for update using (public.get_user_role() in ('salesman', 'administrator'));
create policy "job_assignments_delete_staff" on public.job_assignments
  for delete using (public.get_user_role() in ('salesman', 'administrator'));
