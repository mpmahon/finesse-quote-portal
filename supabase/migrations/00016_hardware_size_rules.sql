-- ============================================================
-- Batch 7 pre-work: width-based hardware support rules.
--
-- Finesse fabrication requires thicker tubes and bigger controls as blind
-- width grows, switching to motorized control above 120" (client's posted
-- note, spreadsheet-confirmed). This migration lays the DB groundwork:
--
-- 1. `hardware_size_rules` — one row per (blind_type, width range), giving
--    the required tube size + control type, whether that range is
--    motorized, and optional cost overrides. Seeded with the six
--    Finesse-supplied tiers for `roller_shade` and `neolux` (12 rows
--    total). Cost overrides are seeded NULL — pricing for the
--    thicker-tube / motorized-control upcharge is still TBD from the
--    client, so this migration is cost-neutral. `resolveHardwareSpec` /
--    `calculateLineItem` in quote-engine.ts read this table; see that
--    file for the pure-function contract.
-- 2. `products.blind_type` — minimal forward-compatible tag (values
--    'roller_shade' | 'neolux' for now) ahead of the full Batch 7
--    taxonomy rework (Type -> Opacity -> Style -> Colour -> Valance).
--    Existing seed products are tagged where the model name/shade_types
--    clearly indicate a roller mechanism; ambiguous cellular/horizontal-
--    slat products are left null (see change log / DEVLOG for the
--    per-product reasoning).
-- 3. `quote_line_items.hardware_spec` — jsonb snapshot of the rule applied
--    at quote-generation time, so a quote's fabrication spec doesn't
--    drift if the rules table changes later.
-- 4. `pricing_config.max_window_width_in` raised from 180 to 228 (the
--    absolute fabrication max for these blind types) for installs that
--    were previously capped below fabrication limits. Admins can still
--    edit it down.
-- ============================================================

-- 1. Hardware size rules ---------------------------------------------------
create table public.hardware_size_rules (
  id                            uuid primary key default gen_random_uuid(),
  blind_type                    text not null,
  min_width_in                  numeric(8,2) not null,
  max_width_in                  numeric(8,2) not null,
  tube_size                     text not null,
  control_type                  text not null,
  is_motorized                  boolean not null default false,
  -- When set, replaces the product's tube component per-inch USD price for
  -- a line item matched to this rule. Null (seeded state) = no cost impact.
  tube_usd_per_inch_override    numeric(10,4),
  -- When set, added as a fixed control cost to the line item. Null (seeded
  -- state) = no cost impact.
  control_fixed_usd             numeric(10,2),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint chk_hardware_rule_width_range check (max_width_in >= min_width_in)
);

create index hardware_size_rules_blind_type_idx
  on public.hardware_size_rules(blind_type, min_width_in);

drop trigger if exists hardware_size_rules_set_updated_at on public.hardware_size_rules;
create trigger hardware_size_rules_set_updated_at
  before update on public.hardware_size_rules
  for each row execute function public.set_updated_at();

-- RLS: readable by all authenticated users, writable by administrators only
-- (same pattern as products/pricing_config).
alter table public.hardware_size_rules enable row level security;

create policy "hardware_size_rules_select_auth" on public.hardware_size_rules
  for select using (auth.uid() is not null);
create policy "hardware_size_rules_insert_admin" on public.hardware_size_rules
  for insert with check (public.get_user_role() = 'administrator');
create policy "hardware_size_rules_update_admin" on public.hardware_size_rules
  for update using (public.get_user_role() = 'administrator');
create policy "hardware_size_rules_delete_admin" on public.hardware_size_rules
  for delete using (public.get_user_role() = 'administrator');

-- Seed: the six Finesse-supplied tiers, once per blind_type. Overrides left
-- null — pricing for the upcharge is still TBD from the client.
insert into public.hardware_size_rules
  (blind_type, min_width_in, max_width_in, tube_size, control_type, is_motorized) values
  ('roller_shade',   0, 84,  '1 1/4"', 'VTX 15', false),
  ('roller_shade',  85, 108, '1 1/2"', 'VTX 20', false),
  ('roller_shade', 109, 120, '1 3/4"', 'VTX 30', false),
  ('roller_shade', 121, 144, '2"',     'Motor',  true),
  ('roller_shade', 145, 180, '2 1/2"', 'Motor',  true),
  ('roller_shade', 181, 228, '3 1/4"', 'Motor',  true),
  ('neolux',         0, 84,  '1 1/4"', 'VTX 15', false),
  ('neolux',        85, 108, '1 1/2"', 'VTX 20', false),
  ('neolux',       109, 120, '1 3/4"', 'VTX 30', false),
  ('neolux',       121, 144, '2"',     'Motor',  true),
  ('neolux',       145, 180, '2 1/2"', 'Motor',  true),
  ('neolux',       181, 228, '3 1/4"', 'Motor',  true);

-- 2. products.blind_type ---------------------------------------------------
alter table public.products
  add column if not exists blind_type text;

-- Tag existing seed products where the model name / shade_types clearly
-- indicate a roller mechanism (component blueprint alone doesn't
-- distinguish mechanism today — every product currently shares the same
-- roller-style cassette/tube/chain component set, which is the taxonomy
-- gap Batch 7 fixes). Ambiguous cellular/horizontal-slat/sheer products
-- are left null for an admin to tag once the full taxonomy lands.
update public.products set blind_type = 'roller_shade'
  where id in (
    'a1000000-0000-0000-0000-000000000001', -- Luxaflex Roller
    'a1000000-0000-0000-0000-000000000004', -- Graber Roller
    'a1000000-0000-0000-0000-000000000007', -- Levolor Fabric Roller
    'a1000000-0000-0000-0000-000000000008', -- Graber Commercial Blackout (judgment call — solar/blackout roller-line naming)
    'a1000000-0000-0000-0000-000000000009'  -- Finesse Budget Roller
  );
-- Left null (not roller mechanisms): Hunter Douglas Duette (cellular/
-- honeycomb, id ...002), Norman Soluna (cellular sheer shading, id ...003),
-- Luxaflex Silhouette (sheer horizontal vane, id ...005), Norman Woodlore
-- (faux-wood horizontal slats, id ...006), Finesse Premium Plus (ambiguous
-- name, no roller signal, id ...010).

-- 3. quote_line_items.hardware_spec ----------------------------------------
alter table public.quote_line_items
  add column if not exists hardware_spec jsonb;

-- 4. Raise the entry ceiling to the fabrication max. Admins can still edit
--    it down via /admin/pricing.
update public.pricing_config set max_window_width_in = 228 where max_window_width_in = 180;
