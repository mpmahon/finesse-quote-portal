-- ============================================================
-- Batch 7: blind option hierarchy (Type -> Opacity -> Style -> Colour,
-- plus Valance/Finisher per Type).
--
-- Replaces the flat, independent `shade_types` / `styles` / `colours`
-- lookup tables (and the free-text `products.shade_types/styles/colours`
-- arrays used for *selection*) with a dependent hierarchy that matches the
-- client's real product structure: the Styles available depend on the
-- chosen Opacity, and the Colours available depend on the chosen Style.
-- Valance/Finisher is a parallel attribute keyed off Type only (not part
-- of the Opacity -> Style -> Colour chain).
--
-- Source of truth: `..\resources\2026-07-07_blind-hierarchy-spec.md`
-- (client-approved 2026-07-07).
--
-- 1. Five new tables: blind_types, blind_opacities, blind_styles,
--    blind_colours, blind_valances. Same shape/RLS pattern as the old
--    lookup tables (00004_catalog_tables.sql): id/name/is_active/
--    sort_order/created_at/updated_at, read-authenticated / write-admin
--    RLS, `set_updated_at` trigger (00012/00014).
-- 2. Seed exactly per the spec's table (document order for sort_order;
--    nothing under TBD nodes — Sliding Panel/Roller Shade/Neolux styles,
--    and ALL colours, are left for Mike to enter via Blind Management).
--    Counts asserted in a DO block before commit: 6 types / 15 opacities /
--    12 styles / 0 colours / 14 valances. NOTE: the spec's prose says "13"
--    valance rows but its own table lists 14 (Roller Shade has 4: Round
--    Cassette, Square Cassette, Fabric Pelmet, None) — the table is
--    authoritative per the build brief; asserting 14 here, not 13.
-- 3. Legacy tables renamed (never dropped, per spec): shade_types ->
--    legacy_shade_types, styles -> legacy_styles, colours -> legacy_colours.
--    Their RLS policies are renamed to match but otherwise unchanged — they
--    keep working exactly as before for any code that still reads them
--    (the admin Product Manager's make/model tagging UI; see DEVLOG).
-- 4. Snapshot columns for the new attributes: windows.opacity/valance,
--    quote_line_items.opacity/valance. Existing free-text shade_type/
--    style/colour values on windows/quote_line_items are untouched
--    historical data (per spec open question 3). NEW windows store the
--    Type name in the existing shade_type column (semantic change only,
--    no schema change) plus the two new columns.
-- 5. products.shade_types/styles/colours are deliberately NOT touched —
--    data stays as-is, and products are NOT linked to the new hierarchy
--    yet (spec open question 2, deferred until the TBD data is complete).
-- ============================================================

-- ------------------------------------------------------------
-- 1. New tables
-- ------------------------------------------------------------

create table public.blind_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blind_types_name_unique unique (name)
);

create table public.blind_opacities (
  id          uuid primary key default gen_random_uuid(),
  type_id     uuid not null references public.blind_types(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blind_opacities_type_name_unique unique (type_id, name)
);

create table public.blind_styles (
  id          uuid primary key default gen_random_uuid(),
  opacity_id  uuid not null references public.blind_opacities(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blind_styles_opacity_name_unique unique (opacity_id, name)
);

create table public.blind_colours (
  id          uuid primary key default gen_random_uuid(),
  style_id    uuid not null references public.blind_styles(id) on delete cascade,
  name        text not null,
  -- Optional swatch hex, same convention as the old `colours.hex_code`.
  hex_code    text null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blind_colours_style_name_unique unique (style_id, name)
);

create table public.blind_valances (
  id          uuid primary key default gen_random_uuid(),
  type_id     uuid not null references public.blind_types(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blind_valances_type_name_unique unique (type_id, name)
);

-- Indexes on each FK column (the unique constraints above already cover
-- (fk, name), but an explicit single-column index keeps "all children of
-- this parent" lookups — the Blind Management drill-down's bread and
-- butter — fast without relying on that composite index's leading column).
create index blind_opacities_type_id_idx on public.blind_opacities(type_id);
create index blind_styles_opacity_id_idx on public.blind_styles(opacity_id);
create index blind_colours_style_id_idx on public.blind_colours(style_id);
create index blind_valances_type_id_idx on public.blind_valances(type_id);

-- updated_at maintenance — reuses the house trigger function (defined in
-- 00012_ws4_lifecycle_and_jobs.sql, search_path pinned in 00014).
create trigger blind_types_set_updated_at
  before update on public.blind_types
  for each row execute function public.set_updated_at();
create trigger blind_opacities_set_updated_at
  before update on public.blind_opacities
  for each row execute function public.set_updated_at();
create trigger blind_styles_set_updated_at
  before update on public.blind_styles
  for each row execute function public.set_updated_at();
create trigger blind_colours_set_updated_at
  before update on public.blind_colours
  for each row execute function public.set_updated_at();
create trigger blind_valances_set_updated_at
  before update on public.blind_valances
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- RLS: read-authenticated / write-admin, matching the old lookup tables'
-- policy pattern exactly (00004_catalog_tables.sql).
-- ------------------------------------------------------------
alter table public.blind_types enable row level security;
alter table public.blind_opacities enable row level security;
alter table public.blind_styles enable row level security;
alter table public.blind_colours enable row level security;
alter table public.blind_valances enable row level security;

create policy "blind_types_select_auth" on public.blind_types
  for select using (auth.uid() is not null);
create policy "blind_types_insert_admin" on public.blind_types
  for insert with check (public.get_user_role() = 'administrator');
create policy "blind_types_update_admin" on public.blind_types
  for update using (public.get_user_role() = 'administrator');
create policy "blind_types_delete_admin" on public.blind_types
  for delete using (public.get_user_role() = 'administrator');

create policy "blind_opacities_select_auth" on public.blind_opacities
  for select using (auth.uid() is not null);
create policy "blind_opacities_insert_admin" on public.blind_opacities
  for insert with check (public.get_user_role() = 'administrator');
create policy "blind_opacities_update_admin" on public.blind_opacities
  for update using (public.get_user_role() = 'administrator');
create policy "blind_opacities_delete_admin" on public.blind_opacities
  for delete using (public.get_user_role() = 'administrator');

create policy "blind_styles_select_auth" on public.blind_styles
  for select using (auth.uid() is not null);
create policy "blind_styles_insert_admin" on public.blind_styles
  for insert with check (public.get_user_role() = 'administrator');
create policy "blind_styles_update_admin" on public.blind_styles
  for update using (public.get_user_role() = 'administrator');
create policy "blind_styles_delete_admin" on public.blind_styles
  for delete using (public.get_user_role() = 'administrator');

create policy "blind_colours_select_auth" on public.blind_colours
  for select using (auth.uid() is not null);
create policy "blind_colours_insert_admin" on public.blind_colours
  for insert with check (public.get_user_role() = 'administrator');
create policy "blind_colours_update_admin" on public.blind_colours
  for update using (public.get_user_role() = 'administrator');
create policy "blind_colours_delete_admin" on public.blind_colours
  for delete using (public.get_user_role() = 'administrator');

create policy "blind_valances_select_auth" on public.blind_valances
  for select using (auth.uid() is not null);
create policy "blind_valances_insert_admin" on public.blind_valances
  for insert with check (public.get_user_role() = 'administrator');
create policy "blind_valances_update_admin" on public.blind_valances
  for update using (public.get_user_role() = 'administrator');
create policy "blind_valances_delete_admin" on public.blind_valances
  for delete using (public.get_user_role() = 'administrator');

-- ------------------------------------------------------------
-- 2. Seed data (exact, document order for sort_order)
-- ------------------------------------------------------------

insert into public.blind_types (name, sort_order) values
  ('Horizontal', 1),
  ('Sliding Panel', 2),
  ('Dune', 3),
  ('Cellular', 4),
  ('Roller Shade', 5),
  ('Neolux Shade', 6);

insert into public.blind_opacities (type_id, name, sort_order)
select t.id, v.name, v.sort_order
from (values
  ('Horizontal',     'Full Privacy',   1),
  ('Sliding Panel',  'Sheer',          1),
  ('Sliding Panel',  'Semi Privacy',   2),
  ('Sliding Panel',  'Full Privacy',   3),
  ('Sliding Panel',  'Blackout',       4),
  ('Dune',           'Full Privacy',   1),
  ('Cellular',       'Sheer',          1),
  ('Cellular',       'Full Privacy',   2),
  ('Cellular',       'Blackout',       3),
  ('Roller Shade',   'Sheer',          1),
  ('Roller Shade',   'Semi Privacy',   2),
  ('Roller Shade',   'Full Privacy',   3),
  ('Roller Shade',   'Blackout',       4),
  ('Neolux Shade',   'Dim out',        1),
  ('Neolux Shade',   'Non Dim out',    2)
) as v(type_name, name, sort_order)
join public.blind_types t on t.name = v.type_name;

insert into public.blind_styles (opacity_id, name, sort_order)
select o.id, v.name, v.sort_order
from (values
  ('Horizontal', 'Full Privacy', 'Faux wood',  1),
  ('Horizontal', 'Full Privacy', 'PVC',        2),
  ('Horizontal', 'Full Privacy', 'Real wood',  3),
  ('Dune',       'Full Privacy', 'Aurora',     1),
  ('Dune',       'Full Privacy', 'Luna',       2),
  ('Dune',       'Full Privacy', 'Nova',       3),
  ('Dune',       'Full Privacy', 'Star',       4),
  ('Cellular',   'Sheer',        'Solis',      1),
  ('Cellular',   'Full Privacy', 'Bolero',     1),
  ('Cellular',   'Full Privacy', 'Romance',    2),
  ('Cellular',   'Blackout',     'Noite',      1),
  ('Cellular',   'Blackout',     'Privee',     2)
) as v(type_name, opacity_name, name, sort_order)
join public.blind_types t on t.name = v.type_name
join public.blind_opacities o on o.type_id = t.id and o.name = v.opacity_name;

-- blind_colours: intentionally empty. Every style's colour range is TBD
-- per the source doc — Mike enters these via Blind Management.

insert into public.blind_valances (type_id, name, sort_order)
select t.id, v.name, v.sort_order
from (values
  ('Horizontal',     'Yes',              1),
  ('Horizontal',     'No',               2),
  ('Sliding Panel',  'Fabric Pelmet',    1),
  ('Sliding Panel',  'None',             2),
  ('Dune',           'Fabric Pelmet',    1),
  ('Dune',           'None',             2),
  ('Cellular',       'None',             1),
  ('Roller Shade',   'Round Cassette',   1),
  ('Roller Shade',   'Square Cassette',  2),
  ('Roller Shade',   'Fabric Pelmet',    3),
  ('Roller Shade',   'None',             4),
  ('Neolux Shade',   'Round Cassette',   1),
  ('Neolux Shade',   'Square Cassette',  2),
  ('Neolux Shade',   'None',             3)
) as v(type_name, name, sort_order)
join public.blind_types t on t.name = v.type_name;

-- Verify counts before commit (this whole file runs in one transaction) —
-- a mismatch means the seed data above drifted from the spec and the
-- entire migration rolls back rather than landing partially-seeded.
do $$
declare
  type_count     int;
  opacity_count  int;
  style_count    int;
  colour_count   int;
  valance_count  int;
begin
  select count(*) into type_count    from public.blind_types;
  select count(*) into opacity_count from public.blind_opacities;
  select count(*) into style_count   from public.blind_styles;
  select count(*) into colour_count  from public.blind_colours;
  select count(*) into valance_count from public.blind_valances;

  if type_count <> 6 then
    raise exception 'blind_types seed count mismatch: expected 6, got %', type_count;
  end if;
  if opacity_count <> 15 then
    raise exception 'blind_opacities seed count mismatch: expected 15, got %', opacity_count;
  end if;
  if style_count <> 12 then
    raise exception 'blind_styles seed count mismatch: expected 12, got %', style_count;
  end if;
  if colour_count <> 0 then
    raise exception 'blind_colours seed count mismatch: expected 0, got %', colour_count;
  end if;
  if valance_count <> 14 then
    raise exception 'blind_valances seed count mismatch: expected 14, got %', valance_count;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Rename the old flat vocabulary tables (never drop). Policies are
--    renamed alongside for clarity; behaviour (read-auth/write-admin) is
--    unchanged, so any remaining reader keeps working.
-- ------------------------------------------------------------
alter table public.shade_types rename to legacy_shade_types;
alter table public.styles rename to legacy_styles;
alter table public.colours rename to legacy_colours;

alter policy "shade_types_select_auth" on public.legacy_shade_types rename to "legacy_shade_types_select_auth";
alter policy "shade_types_insert_admin" on public.legacy_shade_types rename to "legacy_shade_types_insert_admin";
alter policy "shade_types_update_admin" on public.legacy_shade_types rename to "legacy_shade_types_update_admin";
alter policy "shade_types_delete_admin" on public.legacy_shade_types rename to "legacy_shade_types_delete_admin";

alter policy "styles_select_auth" on public.legacy_styles rename to "legacy_styles_select_auth";
alter policy "styles_insert_admin" on public.legacy_styles rename to "legacy_styles_insert_admin";
alter policy "styles_update_admin" on public.legacy_styles rename to "legacy_styles_update_admin";
alter policy "styles_delete_admin" on public.legacy_styles rename to "legacy_styles_delete_admin";

alter policy "colours_select_auth" on public.legacy_colours rename to "legacy_colours_select_auth";
alter policy "colours_insert_admin" on public.legacy_colours rename to "legacy_colours_insert_admin";
alter policy "colours_update_admin" on public.legacy_colours rename to "legacy_colours_update_admin";
alter policy "colours_delete_admin" on public.legacy_colours rename to "legacy_colours_delete_admin";

-- ------------------------------------------------------------
-- 4. Snapshot columns for the new attributes on windows + quote_line_items.
--    `shade_type`/`style`/`colour` on both tables are untouched historical
--    free text (spec open question 3) — new windows store the Type name in
--    `shade_type` (semantic change only) and the Opacity/Valance names in
--    these new columns.
-- ------------------------------------------------------------
alter table public.windows add column if not exists opacity text;
alter table public.windows add column if not exists valance text;
alter table public.quote_line_items add column if not exists opacity text;
alter table public.quote_line_items add column if not exists valance text;
