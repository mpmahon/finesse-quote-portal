-- ============================================================
-- Batch: blind pricing moves from products to blind_styles, plus
-- room/window quantity multipliers (client directive 2026-07-07/08).
--
-- WRITTEN LOCALLY ONLY — NOT APPLIED. Apply after 00018.
--
-- Part 1 — pricing source rework:
--   Today `products` (make/model) carry `components` rows that price a
--   blind. The client's structured Blind Management hierarchy (blind_types
--   -> blind_opacities -> blind_styles -> blind_colours, + valances) IS what
--   Finesse sells — a separate Product Management layer and a Make/Model
--   pick inside the window configurator are redundant and are being
--   removed from the app (see DEVLOG 2026-07-08). Pricing now lives on
--   `blind_styles` via a new `blind_style_components` table, structurally
--   identical to `components` (name/unit/usd_price) so the pure quote
--   engine's cost math doesn't change at all — only where the rows come
--   from. `products`/`components` are NOT dropped (legacy/history; awnings
--   still use `awning_products` unchanged).
--
-- Part 2 — room/window quantity multipliers:
--   Wholesale customers (e.g. a hotel) configure one room/window once and
--   need it multiplied — "this room × 40 identical rooms", "this window ×
--   3 identical windows in the room". `rooms.quantity` and
--   `windows.quantity` default to 1 (no behaviour change for existing
--   single-unit configs). `quote_line_items` gets a snapshot of the
--   multiplier actually applied at generation time so historical quotes
--   never drift if a room/window's quantity is edited later.
-- ============================================================

-- ------------------------------------------------------------
-- 1. blind_styles.image_url — same convention as products.image_url /
--    awning_products.image_url (product-images storage bucket).
-- ------------------------------------------------------------
alter table public.blind_styles add column if not exists image_url text;

-- ------------------------------------------------------------
-- 2. blind_style_components — per-style pricing rows, replacing per-product
--    components as the blind cost source. Same shape/precision as
--    `components` (unit_type enum, numeric(10,4) usd_price) so the pure
--    engine's PricedComponent contract ({name, unit, usd_price}) is
--    satisfied identically by either table.
-- ------------------------------------------------------------
create table public.blind_style_components (
  id          uuid primary key default gen_random_uuid(),
  style_id    uuid not null references public.blind_styles(id) on delete cascade,
  name        text not null,
  unit        unit_type not null,
  usd_price   numeric(10,4) not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index blind_style_components_style_id_idx on public.blind_style_components(style_id);

drop trigger if exists blind_style_components_set_updated_at on public.blind_style_components;
create trigger blind_style_components_set_updated_at
  before update on public.blind_style_components
  for each row execute function public.set_updated_at();

alter table public.blind_style_components enable row level security;

create policy "blind_style_components_select_auth" on public.blind_style_components
  for select using (auth.uid() is not null);
create policy "blind_style_components_insert_admin" on public.blind_style_components
  for insert with check (public.get_user_role() = 'administrator');
create policy "blind_style_components_update_admin" on public.blind_style_components
  for update using (public.get_user_role() = 'administrator');
create policy "blind_style_components_delete_admin" on public.blind_style_components
  for delete using (public.get_user_role() = 'administrator');

-- ------------------------------------------------------------
-- 2a. Seed EVERY blind_style with a copy of one donor product's component
--     blueprint, so quoting works immediately with no style left at zero
--     cost. THIS IS PLACEHOLDER PRICING — Mike adjusts per style in
--     Blind Management (Admin > Blind Management > select a Style >
--     component editor) once real per-style costs are known.
--
--     Donor choice: the "Luxaflex Roller" seed product
--     (id a1000000-0000-0000-0000-000000000001), a mid-range roller product
--     per Mark's brief ("prefer a mid-range roller like the Luxaflex/Graber
--     roller"). It's one of the four original seed products predating this
--     repo's migration history (created before migration 00001; its exact
--     make/model text can't be re-verified from a migration file), so this
--     block resolves it defensively:
--       1. try the known id directly;
--       2. fall back to any product tagged blind_type='roller_shade'
--          (migration 00016), preferring one whose model name contains
--          "roller" (closest textual match to "mid-range roller");
--       3. abort the whole migration with a clear error if neither
--          resolves, rather than silently seeding zero styles.
--     Written as insert..select cross-joined to every blind_style, so it
--     needs no hardcoded generated ids and re-runs safely if styles are
--     added later (guarded by "not exists" per style+name).
-- ------------------------------------------------------------
do $$
declare
  donor_id uuid;
begin
  select id into donor_id
  from public.products
  where id = 'a1000000-0000-0000-0000-000000000001'::uuid;

  if donor_id is null then
    select id into donor_id
    from public.products
    where blind_type = 'roller_shade'
    order by (model ilike '%roller%') desc, make, model
    limit 1;
  end if;

  if donor_id is null then
    raise exception 'Migration 00019: no donor product found to seed blind_style_components (expected a roller_shade-tagged product with components) — seed at least one blind product/component set before applying this migration';
  end if;

  insert into public.blind_style_components (style_id, name, unit, usd_price)
  select bs.id, c.name, c.unit, c.usd_price
  from public.blind_styles bs
  cross join public.components c
  where c.product_id = donor_id
    and not exists (
      select 1 from public.blind_style_components existing
      where existing.style_id = bs.id and existing.name = c.name
    );
end $$;

-- ------------------------------------------------------------
-- 3. Room / window quantity multipliers.
-- ------------------------------------------------------------
alter table public.rooms
  add column if not exists quantity int not null default 1;
alter table public.rooms
  add constraint chk_rooms_quantity check (quantity >= 1);

alter table public.windows
  add column if not exists quantity int not null default 1;
alter table public.windows
  add constraint chk_windows_quantity check (quantity >= 1);

-- ------------------------------------------------------------
-- 4. quote_line_items — snapshot the multiplier actually applied at
--    generation time. `quantity` is the effective UNIT count
--    (window_quantity × room_quantity) the engine's totals math uses;
--    `room_quantity` / `window_quantity` are kept separately too so the
--    quote detail / PDF can display "Window 2 x3" style breakdowns without
--    re-deriving the split from a since-edited room/window row.
-- ------------------------------------------------------------
alter table public.quote_line_items add column if not exists quantity int not null default 1;
alter table public.quote_line_items add column if not exists room_quantity int not null default 1;
alter table public.quote_line_items add column if not exists window_quantity int not null default 1;
