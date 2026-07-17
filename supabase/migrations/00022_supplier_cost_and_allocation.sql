-- ============================================================
-- Batch: supplier cost price capture + costing-grade allocation
-- (2026-07-16, follow-on to 00021's supplier catalogue layer).
--
-- WRITTEN LOCALLY ONLY — NOT APPLIED. Apply after 00021.
--
-- Context: 00021 gave us suppliers -> supplier_products -> supplier_links
-- for REORDERING (item codes, colour codes) but supplier_products carries
-- no cost. This batch adds:
--   1. supplier_products: cost_price / currency / unit_of_measure /
--      price_updated_at, so a real procurement cost can be recorded per
--      supplier item, in the same USD-numeric(10,4) convention already
--      used by blind_style_components.usd_price (00019) and
--      components.usd_price (00001).
--   2. supplier_links: quantity_per (how many of the supplier's own
--      unit_of_measure are consumed to fulfil ONE unit of the Finesse
--      item it's linked to — e.g. 1 linear yard of fabric per style) and
--      is_primary_source (which supplier is the current/preferred source
--      when a style/colour/awning has more than one), so a supplier
--      product's cost_price is actually meaningful for a landed-cost
--      calculation rather than just a reorder pointer.
--   3. reassign_primary_source(old_id, new_id): a SECURITY DEFINER RPC that
--      demotes one supplier_links row and promotes another to
--      is_primary_source = true in a single atomic statement, so the
--      allocation admin UI can never leave a target (style/colour/awning)
--      with zero primary sources from a partial failure between two
--      separate client writes. See section 3 below for the full rationale.
--
-- Explicitly OUT OF SCOPE (separate decision, not made here): wiring
-- supplier cost_price into the customer-facing quote engine. The engine's
-- PricedComponent contract (quote-engine.ts) reads ONLY
-- blind_style_components/components — a deliberate sales-price /
-- procurement-cost separation the client has relied on since 00019. This
-- migration adds procurement/reference cost data for admin reporting
-- (margin checks, reorder decisions) without touching that contract.
--
-- No history table: at expected volume (a handful of suppliers,
-- infrequent manual price updates) a full supplier_product_prices audit
-- table is overkill for this batch. `price_updated_at` gives "how stale
-- is this cost" for free. If a real price-change audit trail becomes a
-- product requirement later, add supplier_product_price_history as its
-- own forward-only migration rather than building it speculatively now.
--
-- RLS: no new tables in this batch — only columns added to
-- suppliers/supplier_products/supplier_links. Postgres RLS policies are
-- row-level, not column-level, and 00021 granted no column-level
-- privileges, so the existing staff-select / admin-write policies on
-- these three tables already cover the new columns. Verified below by
-- inspection, not re-declared, to avoid a redundant/conflicting policy
-- definition. Customers (role NOT IN administrator/salesman) still get
-- zero rows from any of these tables.
-- ============================================================

-- ------------------------------------------------------------
-- 1. supplier_products: cost capture.
-- ------------------------------------------------------------
alter table public.supplier_products add column if not exists cost_price numeric(10,4);
alter table public.supplier_products add column if not exists currency text not null default 'USD';
alter table public.supplier_products add column if not exists unit_of_measure text;
alter table public.supplier_products add column if not exists price_updated_at timestamptz;

alter table public.supplier_products
  add constraint supplier_products_cost_price_nonneg check (cost_price is null or cost_price >= 0);

comment on column public.supplier_products.cost_price is 'Procurement cost in `currency`, denominated per `unit_of_measure` (e.g. per linear yard, per box of 10, per each). Nullable — not every supplier item has a captured cost yet. Reference/reporting only; NOT read by the quote engine (see quote-engine.ts PricedComponent).';
comment on column public.supplier_products.unit_of_measure is 'Free-text unit the supplier sells/prices this item by (e.g. ''per linear yard'', ''per box of 10'', ''each''). Deliberately free text, not an enum — supplier units vary too widely to constrain usefully.';
comment on column public.supplier_products.price_updated_at is 'Auto-set by trigger whenever cost_price changes (see supplier_products_touch_price_updated_at below). Lets admin screens flag stale costs.';

create index if not exists supplier_products_category_idx on public.supplier_products(category);

-- Auto-stamp price_updated_at on cost_price change so admin doesn't have
-- to remember to touch it manually. Pinned search_path at creation
-- (Supabase security advisor 0011_function_search_path_mutable) rather
-- than via a later pinning migration like 00014 did for set_updated_at.
create or replace function public.touch_supplier_product_price_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cost_price is distinct from old.cost_price then
    new.price_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists supplier_products_touch_price_updated_at on public.supplier_products;
create trigger supplier_products_touch_price_updated_at
  before update on public.supplier_products
  for each row execute function public.touch_supplier_product_price_updated_at();

-- ------------------------------------------------------------
-- 2. supplier_links: make cost meaningful for costing, and disambiguate
--    sourcing when a style/colour/awning has more than one supplier.
-- ------------------------------------------------------------
alter table public.supplier_links add column if not exists quantity_per numeric(10,4) not null default 1;
alter table public.supplier_links add column if not exists is_primary_source boolean not null default true;
alter table public.supplier_links add column if not exists updated_at timestamptz not null default now();

alter table public.supplier_links
  add constraint supplier_links_quantity_per_positive check (quantity_per > 0);

comment on column public.supplier_links.quantity_per is 'How many of the supplier_product''s own unit_of_measure are consumed to fulfil ONE unit of the linked Finesse item (blind_style / blind_colour / awning_product). Default 1 = 1:1 (the common case: one supplier item literally IS the one Finesse unit, e.g. one awning cassette). Set >1 or a fraction for fabric-style items priced per linear yard/metre where a style consumes a fraction of a roll per unit.';
comment on column public.supplier_links.is_primary_source is 'True for the current/preferred supplier when a style/colour/awning has more than one supplier_link (multi-sourcing). Exactly one primary per target is enforced by the partial unique indexes below; alternates are kept for price comparison / backup sourcing, not deleted.';

-- 00021 seeded every existing supplier_links row with the new column
-- defaulting to TRUE. Where a target (style/colour/awning) already has
-- more than one link — legitimate multi-sourcing already in the data —
-- demote all but the earliest-created link to non-primary BEFORE the
-- partial unique indexes are created, so this migration can't fail on
-- pre-existing data. Deterministic tie-break on id keeps this idempotent
-- and safe to re-run.
with ranked as (
  select id,
         row_number() over (
           partition by blind_style_id, blind_colour_id, awning_product_id
           order by created_at, id
         ) as rn
  from public.supplier_links
)
update public.supplier_links sl
set is_primary_source = false
from ranked r
where sl.id = r.id
  and r.rn > 1
  and sl.is_primary_source = true;

-- Sanity guard (same pattern as 00017/00019/00021's DO $$ blocks): fail
-- loudly rather than let the next step silently error out or, worse,
-- succeed by accident with the wrong row demoted.
do $$
declare
  dup_targets int;
begin
  select count(*) into dup_targets
  from (
    select blind_style_id, blind_colour_id, awning_product_id
    from public.supplier_links
    where is_primary_source
    group by blind_style_id, blind_colour_id, awning_product_id
    having count(*) > 1
  ) x;

  if dup_targets > 0 then
    raise exception 'Migration 00022: % target(s) still have more than one is_primary_source supplier_links row after backfill — fix data before creating the partial unique indexes', dup_targets;
  end if;
end $$;

-- One primary source per target. Partial (is_primary_source = true) and
-- per-target-column so it composes correctly with the existing
-- supplier_links_one_target check (exactly one of the three FK columns
-- is non-null per row).
create unique index if not exists supplier_links_primary_style_uidx
  on public.supplier_links(blind_style_id) where is_primary_source and blind_style_id is not null;
create unique index if not exists supplier_links_primary_colour_uidx
  on public.supplier_links(blind_colour_id) where is_primary_source and blind_colour_id is not null;
create unique index if not exists supplier_links_primary_awning_uidx
  on public.supplier_links(awning_product_id) where is_primary_source and awning_product_id is not null;

-- updated_at trigger, reusing the project's pinned set_updated_at()
-- (00012, search_path pinned 00014). supplier_links didn't need this in
-- 00021 (created_at-only, effectively immutable reorder metadata); now
-- that quantity_per/is_primary_source are admin-editable over time, it
-- follows the same convention as every other actively-edited table.
drop trigger if exists supplier_links_set_updated_at on public.supplier_links;
create trigger supplier_links_set_updated_at
  before update on public.supplier_links
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3. reassign_primary_source(old_id, new_id): atomic primary-source swap.
--
--    The allocation admin UI (SupplierLinkManager) sometimes needs to
--    demote one supplier_links row AND promote another to
--    is_primary_source = true for the SAME target in lockstep (e.g.
--    "make this supplier item the primary source instead of that one").
--    Two separate client round-trips (UPDATE old, then UPDATE new) would
--    risk a target left with ZERO primary source if the second write
--    fails after the first commits — dropped connection, tab sleep, the
--    target row deleted mid-flight, etc. — and that gap is silent: a
--    target with no primary source just vanishes from
--    buildPrimaryStyleCostMap and any other primary-source reporting with
--    no error surfaced anywhere.
--
--    Wrapping both writes in a single SECURITY DEFINER function makes them
--    one Postgres statement from the client's perspective: Postgres runs a
--    function body in the calling statement's transaction, so either both
--    flips apply or neither does — there is no intermediate state a
--    concurrent reader (or a crashed client) can observe. The partial
--    unique indexes above are the last-resort backstop for any path that
--    still tries to create two primaries directly (e.g. a raw two-step
--    UPDATE from outside this function).
--
--    SECURITY DEFINER bypasses supplier_links' RLS (administrator-only
--    write, 00021's supplier_links_write_admin policy), so the role check
--    inside the function body re-implements that same gate explicitly
--    rather than relying on the caller's own row-level privileges.
-- ------------------------------------------------------------
create or replace function public.reassign_primary_source(old_id uuid, new_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_user_role() <> 'administrator' then
    raise exception 'Only administrators can reassign a primary supplier source';
  end if;

  -- old_id is null when the target has no current primary yet (first
  -- allocation for that style/colour/awning) — nothing to demote.
  if old_id is not null then
    update public.supplier_links set is_primary_source = false where id = old_id;
  end if;

  update public.supplier_links set is_primary_source = true where id = new_id;

  if not found then
    raise exception 'reassign_primary_source: new_id % not found in supplier_links', new_id;
  end if;
end;
$$;

grant execute on function public.reassign_primary_source(uuid, uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. RLS verification (no-op, documented not re-declared — see header).
--    suppliers_select_staff / supplier_products_select_staff /
--    supplier_links_select_staff (00021) already gate ALL columns of
--    these three tables to role in ('administrator','salesman'); the
--    corresponding *_write_admin policies already gate ALL columns for
--    insert/update/delete to 'administrator'. New columns added above
--    inherit those row-level policies automatically — nothing to add.
--    reassign_primary_source() (section 3) is the one deliberate
--    exception: it's SECURITY DEFINER (bypasses RLS by design) with its
--    own explicit administrator check in the function body.
-- ------------------------------------------------------------
