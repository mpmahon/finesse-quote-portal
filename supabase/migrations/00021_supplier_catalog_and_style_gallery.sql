-- ============================================================
-- Batch: supplier catalogue layer + Style Gallery seed (2026-07-16).
--
-- Sources: supplier websites scraped 2026-07-16 (see
-- resources/supplier-scrapes/). Client rules:
--   * FINESSE structure wins: supplier fabrics are fitted into the existing
--     Type -> Opacity -> Style -> Colour hierarchy (00017). Supplier
--     structure is NOT imported.
--   * End users never see supplier brands. Supplier identity, product
--     codes and colour codes live in staff-only tables (suppliers,
--     supplier_products, supplier_links) for reordering/stock only.
--   * All imagery is rehosted, de-branded, under /images/catalog/ in the
--     app repo (no hotlinks to supplier domains).
--
-- 1. DDL: marketing columns on blind_types/blind_styles; suppliers,
--    supplier_products, supplier_links (staff-read, admin-write RLS);
--    awning_categories (recommended NEW exterior structure - awnings had
--    no structure yet; blinds untouched) + awning_products.category_id/
--    description.
-- 2. Seed: type descriptions/heroes; 32 new styles under the Roller/
--    Sliding Panel/Neolux TBD opacities with pricing components CLONED from
--    each opacity's T_Standard placeholder (cost-neutral until real
--    supplier pricing is entered); real colour ranges (hex computed from
--    supplier swatch images) for all fabric styles incl. existing
--    Dune/Cellular/Horizontal styles; per-colour supplier codes.
-- 3. T_Standard / T_White placeholders are DEACTIVATED (never deleted)
--    wherever real children now exist.
-- 4. Staged exterior range: 10 awning_products seeded is_active=false
--    (pricing TBD - activate in Admin once priced).
--
-- [VERIFY] Opacity classification of supplier fabrics (e.g. screens under
-- Sheer/Semi Privacy, translucents under Full Privacy, dual-shade
-- 'block out' bands under Dim out) is Claude's mapping judgement from
-- supplier-published opacity data - Mike to confirm in Blind Management.
-- ============================================================


-- ------------------------------------------------------------
-- 1. DDL
-- ------------------------------------------------------------
alter table public.blind_types  add column if not exists description text;
alter table public.blind_types  add column if not exists image_url text;
alter table public.blind_styles add column if not exists description text;

create table if not exists public.awning_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  image_url   text,
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint awning_categories_name_unique unique (name)
);
alter table public.awning_products add column if not exists description text;
alter table public.awning_products add column if not exists category_id uuid references public.awning_categories(id);

create table if not exists public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  website     text,
  contact     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint suppliers_name_unique unique (name)
);

create table if not exists public.supplier_products (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name        text not null,
  item_code   text,
  category    text,
  specs       text,
  source_url  text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint supplier_products_supplier_name_unique unique (supplier_id, name)
);
create index if not exists supplier_products_supplier_id_idx on public.supplier_products(supplier_id);

-- Links our sellable structure to the supplier item that fulfils it.
-- Exactly one target per row: a blind style, a blind colour (with the
-- supplier's colour code for reordering), or an awning product.
create table if not exists public.supplier_links (
  id                   uuid primary key default gen_random_uuid(),
  supplier_product_id  uuid not null references public.supplier_products(id) on delete cascade,
  blind_style_id       uuid references public.blind_styles(id) on delete cascade,
  blind_colour_id      uuid references public.blind_colours(id) on delete cascade,
  awning_product_id    uuid references public.awning_products(id) on delete cascade,
  supplier_colour_code text,
  notes                text,
  created_at           timestamptz not null default now(),
  constraint supplier_links_one_target check (num_nonnulls(blind_style_id, blind_colour_id, awning_product_id) = 1)
);
create index if not exists supplier_links_product_idx on public.supplier_links(supplier_product_id);
create index if not exists supplier_links_style_idx   on public.supplier_links(blind_style_id);
create index if not exists supplier_links_colour_idx  on public.supplier_links(blind_colour_id);
create index if not exists supplier_links_awning_idx  on public.supplier_links(awning_product_id);

-- updated_at triggers (set_updated_at pinned in 00014)
drop trigger if exists awning_categories_set_updated_at on public.awning_categories;
create trigger awning_categories_set_updated_at before update on public.awning_categories
  for each row execute function public.set_updated_at();
drop trigger if exists suppliers_set_updated_at on public.suppliers;
create trigger suppliers_set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();
drop trigger if exists supplier_products_set_updated_at on public.supplier_products;
create trigger supplier_products_set_updated_at before update on public.supplier_products
  for each row execute function public.set_updated_at();

-- RLS: awning_categories read-authenticated / write-admin (same as lookups);
-- supplier tables are STAFF-ONLY read (customers must never see supplier
-- identity), admin write.
alter table public.awning_categories enable row level security;
drop policy if exists awning_categories_select_auth on public.awning_categories;
create policy awning_categories_select_auth on public.awning_categories
  for select using (auth.uid() is not null);
drop policy if exists awning_categories_write_admin on public.awning_categories;
create policy awning_categories_write_admin on public.awning_categories
  for all using (public.get_user_role() = 'administrator') with check (public.get_user_role() = 'administrator');

alter table public.suppliers enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_links enable row level security;
drop policy if exists suppliers_select_staff on public.suppliers;
create policy suppliers_select_staff on public.suppliers
  for select using (public.get_user_role() in ('administrator','salesman'));
drop policy if exists suppliers_write_admin on public.suppliers;
create policy suppliers_write_admin on public.suppliers
  for all using (public.get_user_role() = 'administrator') with check (public.get_user_role() = 'administrator');
drop policy if exists supplier_products_select_staff on public.supplier_products;
create policy supplier_products_select_staff on public.supplier_products
  for select using (public.get_user_role() in ('administrator','salesman'));
drop policy if exists supplier_products_write_admin on public.supplier_products;
create policy supplier_products_write_admin on public.supplier_products
  for all using (public.get_user_role() = 'administrator') with check (public.get_user_role() = 'administrator');
drop policy if exists supplier_links_select_staff on public.supplier_links;
create policy supplier_links_select_staff on public.supplier_links
  for select using (public.get_user_role() in ('administrator','salesman'));
drop policy if exists supplier_links_write_admin on public.supplier_links;
create policy supplier_links_write_admin on public.supplier_links
  for all using (public.get_user_role() = 'administrator') with check (public.get_user_role() = 'administrator');


-- ------------------------------------------------------------
-- 2. Blind type marketing copy + heroes (de-branded)
-- ------------------------------------------------------------
update public.blind_types set description = 'Roller shades give living spaces adaptable comfort — large windows, small openings, multi-functional rooms — with a clean, cutting-edge look. Our fabric programme spans decorative plains, sheers, technical solar screens and total blackouts, in practical widths that avoid joins and seams.', image_url = '/images/catalog/types/roller-shade.jpg' where name = 'Roller Shade';
update public.blind_types set description = 'A contemporary dual-banded shade: alternating sheer and solid bands glide past each other so you decide exactly how much light and privacy you want, from open view to dim-out.', image_url = '/images/catalog/types/neolux-shade.jpg' where name = 'Neolux Shade';
update public.blind_types set description = 'Designed to cover large glass surfaces and to separate areas in multipurpose spaces. The panel system works with 2 to 5 channels and cord, wand or motor operation, hiding the mechanism for a uniform look with almost no light gap.', image_url = '/images/catalog/types/sliding-panel.jpg' where name = 'Sliding Panel';
update public.blind_types set description = 'Honeycomb cells trap air for the best insulation of any shade — and stack to almost nothing when raised. From airy sheers to full blackout.', image_url = '/images/catalog/types/cellular.jpg' where name = 'Cellular';
update public.blind_types set description = 'The evolution of traditional draperies: soft, lightweight two-layer fabric with the fluid look of a curtain and the precise control of a blind. Cord, wand or motorised operation.', image_url = '/images/catalog/types/dune.jpg' where name = 'Dune';
update public.blind_types set description = '2-inch wood and wood-effect slats bring distinguished character to any space, with light control by tilt and finishes that pair with any furnishing.', image_url = '/images/catalog/types/horizontal.jpg' where name = 'Horizontal';

-- ------------------------------------------------------------
-- 3. Styles: insert new (or enrich existing) per opacity; clone pricing
--    components from the opacity's T_Standard placeholder when the style
--    has none (cost-neutral until real pricing is entered).
-- ------------------------------------------------------------

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Screen 5%', 10, '/images/catalog/styles/roller-shade-sheer-screen-5.jpg', 'An airy solar screen with 5% openness — keeps your view and daylight while cutting glare and UV. A favourite for living areas and offices.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Sheer'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Screen 3%', 10, '/images/catalog/styles/roller-shade-semi-privacy-screen-3.jpg', 'A balanced 3% openness technical screen: daytime privacy and glare control with a softly filtered view. Flame rated, 5-year warranty.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Semi Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Screen 1%', 20, '/images/catalog/styles/roller-shade-semi-privacy-screen-1.jpg', 'Our tightest solar screen — 1% openness for maximum daytime privacy and heat rejection while keeping a connection to outside.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Semi Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Eco Screen', 30, '/images/catalog/styles/roller-shade-semi-privacy-eco-screen.jpg', 'An eco-conscious screen range offered in 1%, 3% and 5% openness, in luminous whites and pearls.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Semi Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Natural View', 10, '/images/catalog/styles/roller-shade-full-privacy-natural-view.jpg', 'A softly textured light-filtering weave that glows with natural daylight while fully screening the room from view.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Carolina', 20, '/images/catalog/styles/roller-shade-full-privacy-carolina.jpg', 'A crisp, lightweight translucent plain that diffuses daylight evenly — simple, clean and endlessly versatile.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Jupiter', 30, '/images/catalog/styles/roller-shade-full-privacy-jupiter.jpg', 'A substantial translucent weave with a rich, tailored hand feel, in warm neutral tones.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Madrid', 40, '/images/catalog/styles/roller-shade-full-privacy-madrid.jpg', 'Our newest translucent plain in a generous 118-inch width — seamless coverage for wide windows.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Snowflake', 50, '/images/catalog/styles/roller-shade-full-privacy-snowflake.jpg', 'A softly mottled translucent texture that reads like natural stone — quietly decorative.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Wood Look', 60, '/images/catalog/styles/roller-shade-full-privacy-wood-look.jpg', 'Wood-grain texture in a rolling shade — the warmth of timber with the practicality of fabric.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Stucco', 70, '/images/catalog/styles/roller-shade-full-privacy-stucco.jpg', 'A finely textured decorative plain with an acrylic-coated finish. Certified low-emission and flame retardant, with a five-year warranty.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Advantage', 10, '/images/catalog/styles/roller-shade-blackout-advantage.jpg', 'Our workhorse blackout — a heavyweight coated fabric for total darkness, in eight tones from crisp white to black.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Paris', 20, '/images/catalog/styles/roller-shade-blackout-paris.jpg', 'A refined mid-weight blackout in soft neutrals, engineered for wide windows without seams.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Rome', 30, '/images/catalog/styles/roller-shade-blackout-rome.jpg', 'A luxuriously thick blackout with a soft fabric face — deep light block with an upholstered look.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Madrid', 40, '/images/catalog/styles/roller-shade-blackout-madrid.jpg', 'The blackout sister of our Madrid translucent — match tones across rooms for a coordinated scheme.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Luxury', 50, '/images/catalog/styles/roller-shade-blackout-luxury.jpg', 'A twill-woven blackout with a designer palette from Pure White to Marine, finished with an acrylic light-block coating.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Linen', 60, '/images/catalog/styles/roller-shade-blackout-linen.jpg', 'A 100% linen face with full blackout backing — natural texture, total darkness.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Roller Shade' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Premium', 10, '/images/catalog/styles/neolux-shade-non-dim-out-premium.jpg', 'Alternating sheer and solid bands in thirteen colours — glide between open view and soft privacy with a turn of the bands.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Non Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Bora Bora', 20, '/images/catalog/styles/neolux-shade-non-dim-out-bora-bora.jpg', 'A relaxed banded shade with wide solids in coastal neutrals.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Non Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Dolce', 30, '/images/catalog/styles/neolux-shade-non-dim-out-dolce.jpg', 'Generous solid bands paired with a delicate sheer — an understated modern classic.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Non Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Marbella', 40, '/images/catalog/styles/neolux-shade-non-dim-out-marbella.jpg', 'A substantial banded weave including silver and wood-tone finishes.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Non Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Zebra Screen', 50, '/images/catalog/styles/neolux-shade-non-dim-out-zebra-screen.jpg', 'The banded style in a technical screen weave — flame rated and hard-wearing, ideal for sunny rooms and offices.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Non Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Venezia', 10, '/images/catalog/styles/neolux-shade-dim-out-venezia.jpg', 'Dim-out banded shade — the solid bands block light for deeper privacy, day and night.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Lush', 20, '/images/catalog/styles/neolux-shade-dim-out-lush.jpg', 'A soft dim-out banded shade in warm ivories and beiges.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Milano', 30, '/images/catalog/styles/neolux-shade-dim-out-milano.jpg', 'Block-out bands for the deepest light control in the banded family.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Toscana', 40, '/images/catalog/styles/neolux-shade-dim-out-toscana.jpg', 'Block-out bands in bold tones from white to black — graphic and practical.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Neolux Shade' and o.name = 'Dim out'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Screen 5%', 10, '/images/catalog/styles/sliding-panel-sheer-screen-5.jpg', 'Panel-track screen fabric at 5% openness — view-through shading for glass walls and sliding doors.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Sliding Panel' and o.name = 'Sheer'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Screen 3%', 10, '/images/catalog/styles/sliding-panel-semi-privacy-screen-3.jpg', '3% openness screen panels for big glass with daytime privacy and glare control.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Sliding Panel' and o.name = 'Semi Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Natural View', 10, '/images/catalog/styles/sliding-panel-full-privacy-natural-view.jpg', 'Softly textured light-filtering panels that glide across wide openings and double as room dividers.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Sliding Panel' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Madrid', 20, '/images/catalog/styles/sliding-panel-full-privacy-madrid.jpg', 'Wide-width translucent panels for seamless large-format coverage.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Sliding Panel' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Advantage', 10, '/images/catalog/styles/sliding-panel-blackout-advantage.jpg', 'Heavyweight blackout panels for media walls and bedrooms with sliding doors.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Sliding Panel' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Madrid', 20, '/images/catalog/styles/sliding-panel-blackout-madrid.jpg', 'Blackout panel fabric matching the Madrid range for a coordinated scheme.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Sliding Panel' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Aurora', 10, '/images/catalog/styles/dune-full-privacy-aurora.jpg', 'A soft two-layer drapery shade: solid vanes faced with sheer — fluid like a curtain, precise like a blind.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Dune' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Luna', 20, '/images/catalog/styles/dune-full-privacy-luna.jpg', 'The deepest member of the Dune family — fuller vanes for richer privacy and light control.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Dune' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Nova', 30, '/images/catalog/styles/dune-full-privacy-nova.jpg', 'A textured weave with gentle body and a relaxed drape.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Dune' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Star', 40, '/images/catalog/styles/dune-full-privacy-star.jpg', 'A fine, lightweight weave that filters daylight into a soft glow.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Dune' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Solis', 10, '/images/catalog/styles/cellular-sheer-solis.jpg', 'A sheer cellular that softens light while insulating — honeycomb efficiency at its airiest.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Cellular' and o.name = 'Sheer'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Bolero', 10, '/images/catalog/styles/cellular-full-privacy-bolero.jpg', 'A translucent honeycomb in seven tones — daylight through, view blocked, heat kept out.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Cellular' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Romance', 20, '/images/catalog/styles/cellular-full-privacy-romance.jpg', 'A softly translucent cellular weave with a warm, gentle glow.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Cellular' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Noite', 10, '/images/catalog/styles/cellular-blackout-noite.jpg', 'A blackout honeycomb: total darkness plus the best insulation of any shade type.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Cellular' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Privee', 20, '/images/catalog/styles/cellular-blackout-privee.jpg', 'A blackout cellular in five easy neutrals — quiet, dark and energy-smart.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Cellular' and o.name = 'Blackout'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Real wood', 10, '/images/catalog/styles/horizontal-full-privacy-real-wood.jpg', '2-inch basswood slats in natural and stained finishes — durable, dimensionally stable and naturally warm.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Horizontal' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'Faux wood', 20, null, 'Wood-effect slats that shrug off humidity — the timber look for kitchens and bathrooms.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Horizontal' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

insert into public.blind_styles (opacity_id, name, sort_order, image_url, description)
select o.id, 'PVC', 30, null, 'Practical, easy-care PVC slats for high-moisture areas.'
from public.blind_opacities o join public.blind_types t on o.type_id = t.id
where t.name = 'Horizontal' and o.name = 'Full Privacy'
on conflict (opacity_id, name) do update
  set image_url = coalesce(excluded.image_url, public.blind_styles.image_url),
      description = excluded.description;

-- Clone pricing components into any style that has none, from its
-- opacity's T_Standard placeholder.
insert into public.blind_style_components (style_id, name, unit, usd_price)
select s.id, pc.name, pc.unit, pc.usd_price
from public.blind_styles s
join public.blind_styles p on p.opacity_id = s.opacity_id and p.name = 'T_Standard' and p.id <> s.id
join public.blind_style_components pc on pc.style_id = p.id
where not exists (select 1 from public.blind_style_components x where x.style_id = s.id);

-- ------------------------------------------------------------
-- 4. Colours per style (hex computed from supplier swatch images;
--    'name-approx' hexes are estimates - wood tones are [VERIFY]).
-- ------------------------------------------------------------
insert into public.blind_colours (style_id, name, hex_code, sort_order)
select s.id, v.colour, v.hex, v.so
from (values
('Roller Shade', 'Sheer', 'Screen 5%', 'White', '#EFEDEB', 10),
('Roller Shade', 'Sheer', 'Screen 5%', 'White Linen', '#D8CEBE', 20),
('Roller Shade', 'Sheer', 'Screen 5%', 'White Pearl', '#C4C3C0', 30),
('Roller Shade', 'Sheer', 'Screen 5%', 'Linen', '#D8CEBE', 40),
('Roller Shade', 'Sheer', 'Screen 5%', 'Pearl Linen', '#B8B4AC', 50),
('Roller Shade', 'Sheer', 'Screen 5%', 'Bronze', '#403C39', 60),
('Roller Shade', 'Sheer', 'Screen 5%', 'Black', '#616061', 70),
('Roller Shade', 'Sheer', 'Screen 5%', 'Black Pearl', '#616061', 80),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'White', '#EBEAE7', 10),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'White Linen', '#DFD8C8', 20),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'White Grey', '#AAAAAC', 30),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'White Pearl', '#BDBEBC', 40),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'Linen', '#DFD8C8', 50),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'Dark Bronze', '#362E2E', 60),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'Black', '#2E2D30', 70),
('Roller Shade', 'Semi Privacy', 'Screen 3%', 'Black Bronze', '#46403A', 80),
('Roller Shade', 'Semi Privacy', 'Screen 1%', 'White', '#EBEAE9', 10),
('Roller Shade', 'Semi Privacy', 'Screen 1%', 'White Linen', '#E0DBCD', 20),
('Roller Shade', 'Semi Privacy', 'Screen 1%', 'Linen', '#D6C4AB', 30),
('Roller Shade', 'Semi Privacy', 'Screen 1%', 'White Pearl', '#C6C6C5', 40),
('Roller Shade', 'Semi Privacy', 'Eco Screen', 'Ice White', '#E9E8E6', 10),
('Roller Shade', 'Semi Privacy', 'Eco Screen', 'White Linen', '#D7CEC0', 20),
('Roller Shade', 'Semi Privacy', 'Eco Screen', 'White Pearl', '#BBB9B7', 30),
('Roller Shade', 'Full Privacy', 'Natural View', 'Linen', '#DDD2C8', 10),
('Roller Shade', 'Full Privacy', 'Natural View', 'White', '#E7E3E3', 20),
('Roller Shade', 'Full Privacy', 'Natural View', 'Ivory', '#E0D8CD', 30),
('Roller Shade', 'Full Privacy', 'Natural View', 'Capuchino', '#B39F8E', 40),
('Roller Shade', 'Full Privacy', 'Natural View', 'Chocolate', '#645A59', 50),
('Roller Shade', 'Full Privacy', 'Natural View', 'Black', '#585758', 60),
('Roller Shade', 'Full Privacy', 'Carolina', 'White', '#EFEDEE', 10),
('Roller Shade', 'Full Privacy', 'Carolina', 'Beige', '#EEEBDA', 20),
('Roller Shade', 'Full Privacy', 'Carolina', 'Sand', '#C3BAA3', 30),
('Roller Shade', 'Full Privacy', 'Carolina', 'Steel', '#ABB0AD', 40),
('Roller Shade', 'Full Privacy', 'Carolina', 'Oliver', '#9C978A', 50),
('Roller Shade', 'Full Privacy', 'Jupiter', 'White', '#D8D8D6', 10),
('Roller Shade', 'Full Privacy', 'Jupiter', 'Ivory', '#E2DCD3', 20),
('Roller Shade', 'Full Privacy', 'Jupiter', 'Chocolate', '#3A3234', 30),
('Roller Shade', 'Full Privacy', 'Jupiter', 'Light Grey', '#99989D', 40),
('Roller Shade', 'Full Privacy', 'Madrid', 'White', '#F1F0EF', 10),
('Roller Shade', 'Full Privacy', 'Madrid', 'Ivory', '#F1EBD1', 20),
('Roller Shade', 'Full Privacy', 'Madrid', 'Grey', '#525152', 30),
('Roller Shade', 'Full Privacy', 'Madrid', 'Coffee', '#453B38', 40),
('Roller Shade', 'Full Privacy', 'Snowflake', 'White', '#F6F6F5', 10),
('Roller Shade', 'Full Privacy', 'Snowflake', 'Khaki', '#CFCAC4', 20),
('Roller Shade', 'Full Privacy', 'Snowflake', 'Stone', '#D2C9BF', 30),
('Roller Shade', 'Full Privacy', 'Snowflake', 'Grey', '#BBBBBC', 40),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Ice White', '#E8E6EC', 10),
('Roller Shade', 'Full Privacy', 'Wood Look', 'White', '#E8E6EC', 20),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Mushroom', '#CEB899', 30),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Khaki', '#8A755A', 40),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Cherry', '#8C6650', 50),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Brown', '#6F513F', 60),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Chocolate', '#493C36', 70),
('Roller Shade', 'Full Privacy', 'Wood Look', 'Grey', '#99989B', 80),
('Roller Shade', 'Full Privacy', 'Stucco', 'White', '#FAF7EE', 10),
('Roller Shade', 'Full Privacy', 'Stucco', 'Off White', '#FAF7E5', 20),
('Roller Shade', 'Full Privacy', 'Stucco', 'Linen', '#F5EED9', 30),
('Roller Shade', 'Full Privacy', 'Stucco', 'Sand', '#E9DDC1', 40),
('Roller Shade', 'Full Privacy', 'Stucco', 'Mocha', '#D1C5B5', 50),
('Roller Shade', 'Full Privacy', 'Stucco', 'Stone', '#808780', 60),
('Roller Shade', 'Blackout', 'Advantage', 'White', '#EDEFF0', 10),
('Roller Shade', 'Blackout', 'Advantage', 'Ivory', '#E5E4DC', 20),
('Roller Shade', 'Blackout', 'Advantage', 'Samba', '#C0B5A7', 30),
('Roller Shade', 'Blackout', 'Advantage', 'Latte', '#999084', 40),
('Roller Shade', 'Blackout', 'Advantage', 'Coffee', '#5F5352', 50),
('Roller Shade', 'Blackout', 'Advantage', 'Light Grey', '#BFC0C2', 60),
('Roller Shade', 'Blackout', 'Advantage', 'Grey', '#7E828B', 70),
('Roller Shade', 'Blackout', 'Advantage', 'Black', '#403F43', 80),
('Roller Shade', 'Blackout', 'Paris', 'Snow White', '#F8F8F5', 10),
('Roller Shade', 'Blackout', 'Paris', 'Ivory', '#E5E4DC', 20),
('Roller Shade', 'Blackout', 'Paris', 'Latte', '#999084', 30),
('Roller Shade', 'Blackout', 'Paris', 'Coffee', '#5F5352', 40),
('Roller Shade', 'Blackout', 'Paris', 'Light Grey', '#BFC0C2', 50),
('Roller Shade', 'Blackout', 'Paris', 'Grey', '#BFC0C2', 60),
('Roller Shade', 'Blackout', 'Rome', 'Snow', '#EFEEF0', 10),
('Roller Shade', 'Blackout', 'Rome', 'Cream', '#F0ECE3', 20),
('Roller Shade', 'Blackout', 'Rome', 'Beige', '#C9C1BC', 30),
('Roller Shade', 'Blackout', 'Rome', 'Light Grey', '#B1AFB2', 40),
('Roller Shade', 'Blackout', 'Rome', 'Grey', '#B1AFB2', 50),
('Roller Shade', 'Blackout', 'Rome', 'Coffee', '#5D4E4D', 60),
('Roller Shade', 'Blackout', 'Madrid', 'White', '#DBDFE1', 10),
('Roller Shade', 'Blackout', 'Madrid', 'Ivory', '#DCDDD4', 20),
('Roller Shade', 'Blackout', 'Madrid', 'Grey', '#6D6C6D', 30),
('Roller Shade', 'Blackout', 'Madrid', 'Coffee', '#433936', 40),
('Roller Shade', 'Blackout', 'Luxury', 'Pure White', '#ECEBEB', 10),
('Roller Shade', 'Blackout', 'Luxury', 'Cotton', '#E4E1D8', 20),
('Roller Shade', 'Blackout', 'Luxury', 'Rock', '#807875', 30),
('Roller Shade', 'Blackout', 'Luxury', 'Leaf', '#787873', 40),
('Roller Shade', 'Blackout', 'Luxury', 'Mocha', '#513E40', 50),
('Roller Shade', 'Blackout', 'Luxury', 'Marine', '#464347', 60),
('Roller Shade', 'Blackout', 'Linen', 'Natural', '#D8D1CC', 10),
('Roller Shade', 'Blackout', 'Linen', 'Custard', '#D6CABC', 20),
('Roller Shade', 'Blackout', 'Linen', 'Red', '#D4BEA7', 30),
('Neolux Shade', 'Non Dim out', 'Premium', 'Ice White', '#F2F0F1', 10),
('Neolux Shade', 'Non Dim out', 'Premium', 'White', '#F2F0F1', 20),
('Neolux Shade', 'Non Dim out', 'Premium', 'Ivory', '#E9E5D5', 30),
('Neolux Shade', 'Non Dim out', 'Premium', 'Oyster', '#E8DFCF', 40),
('Neolux Shade', 'Non Dim out', 'Premium', 'Peach', '#ECE9E8', 50),
('Neolux Shade', 'Non Dim out', 'Premium', 'Taupe', '#746559', 60),
('Neolux Shade', 'Non Dim out', 'Premium', 'Mustard', '#D69C5D', 70),
('Neolux Shade', 'Non Dim out', 'Premium', 'Grey', '#B6B0AF', 80),
('Neolux Shade', 'Non Dim out', 'Premium', 'Chocolate', '#4F433E', 90),
('Neolux Shade', 'Non Dim out', 'Premium', 'Charcoal', '#39383B', 100),
('Neolux Shade', 'Non Dim out', 'Premium', 'Red', '#E33F44', 110),
('Neolux Shade', 'Non Dim out', 'Premium', 'Sky Blue', '#ACC9DE', 120),
('Neolux Shade', 'Non Dim out', 'Premium', 'Pink', '#E5ADBE', 130),
('Neolux Shade', 'Non Dim out', 'Bora Bora', 'White', '#EAE9EE', 10),
('Neolux Shade', 'Non Dim out', 'Bora Bora', 'Cream', '#D9CFB8', 20),
('Neolux Shade', 'Non Dim out', 'Bora Bora', 'Beige', '#B79E89', 30),
('Neolux Shade', 'Non Dim out', 'Bora Bora', 'Pearl', '#767575', 40),
('Neolux Shade', 'Non Dim out', 'Dolce', 'White', '#F9F9FB', 10),
('Neolux Shade', 'Non Dim out', 'Dolce', 'Beige', '#DFB9A3', 20),
('Neolux Shade', 'Non Dim out', 'Dolce', 'Pearl Grey', '#81817F', 30),
('Neolux Shade', 'Non Dim out', 'Marbella', 'Ice White', '#EDEBEC', 10),
('Neolux Shade', 'Non Dim out', 'Marbella', 'Off White', '#E2DDC5', 20),
('Neolux Shade', 'Non Dim out', 'Marbella', 'Silver', '#848386', 30),
('Neolux Shade', 'Non Dim out', 'Marbella', 'Wood', '#7A634F', 40),
('Neolux Shade', 'Non Dim out', 'Zebra Screen', 'White', '#F3F2EE', 10),
('Neolux Shade', 'Non Dim out', 'Zebra Screen', 'White Linen', '#E7DBCA', 20),
('Neolux Shade', 'Non Dim out', 'Zebra Screen', 'White Grey', '#A3A3A3', 30),
('Neolux Shade', 'Non Dim out', 'Zebra Screen', 'Black', '#1F1E20', 40),
('Neolux Shade', 'Dim out', 'Venezia', 'White', '#DCE4ED', 10),
('Neolux Shade', 'Dim out', 'Venezia', 'Ivory', '#CAC6BF', 20),
('Neolux Shade', 'Dim out', 'Venezia', 'Light Grey', '#6B696E', 30),
('Neolux Shade', 'Dim out', 'Lush', 'Ice White', '#EBECED', 10),
('Neolux Shade', 'Dim out', 'Lush', 'Ivory', '#BDA994', 20),
('Neolux Shade', 'Dim out', 'Lush', 'Beige', '#A39788', 30),
('Neolux Shade', 'Dim out', 'Milano', 'White', '#CECCD2', 10),
('Neolux Shade', 'Dim out', 'Milano', 'Ivory', '#C8C5C5', 20),
('Neolux Shade', 'Dim out', 'Milano', 'Grey', '#989497', 30),
('Neolux Shade', 'Dim out', 'Milano', 'Beige', '#BBB3A9', 40),
('Neolux Shade', 'Dim out', 'Milano', 'Chocolate', '#544946', 50),
('Neolux Shade', 'Dim out', 'Toscana', 'White', '#D4D3D8', 10),
('Neolux Shade', 'Dim out', 'Toscana', 'Mushroom', '#BAB1A7', 20),
('Neolux Shade', 'Dim out', 'Toscana', 'Chocolate', '#605352', 30),
('Neolux Shade', 'Dim out', 'Toscana', 'Grey', '#797579', 40),
('Neolux Shade', 'Dim out', 'Toscana', 'Black', '#353437', 50),
('Sliding Panel', 'Sheer', 'Screen 5%', 'White', '#EFEDEB', 10),
('Sliding Panel', 'Sheer', 'Screen 5%', 'White Linen', '#D8CEBE', 20),
('Sliding Panel', 'Sheer', 'Screen 5%', 'White Pearl', '#C4C3C0', 30),
('Sliding Panel', 'Sheer', 'Screen 5%', 'Linen', '#D8CEBE', 40),
('Sliding Panel', 'Sheer', 'Screen 5%', 'Pearl Linen', '#B8B4AC', 50),
('Sliding Panel', 'Sheer', 'Screen 5%', 'Bronze', '#403C39', 60),
('Sliding Panel', 'Sheer', 'Screen 5%', 'Black', '#616061', 70),
('Sliding Panel', 'Sheer', 'Screen 5%', 'Black Pearl', '#616061', 80),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White', '#EBEAE7', 10),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White Linen', '#DFD8C8', 20),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White Grey', '#AAAAAC', 30),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White Pearl', '#BDBEBC', 40),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Linen', '#DFD8C8', 50),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Dark Bronze', '#362E2E', 60),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Black', '#2E2D30', 70),
('Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Black Bronze', '#46403A', 80),
('Sliding Panel', 'Full Privacy', 'Natural View', 'Linen', '#DDD2C8', 10),
('Sliding Panel', 'Full Privacy', 'Natural View', 'White', '#E7E3E3', 20),
('Sliding Panel', 'Full Privacy', 'Natural View', 'Ivory', '#E0D8CD', 30),
('Sliding Panel', 'Full Privacy', 'Natural View', 'Capuchino', '#B39F8E', 40),
('Sliding Panel', 'Full Privacy', 'Natural View', 'Chocolate', '#645A59', 50),
('Sliding Panel', 'Full Privacy', 'Natural View', 'Black', '#585758', 60),
('Sliding Panel', 'Full Privacy', 'Madrid', 'White', '#F1F0EF', 10),
('Sliding Panel', 'Full Privacy', 'Madrid', 'Ivory', '#F1EBD1', 20),
('Sliding Panel', 'Full Privacy', 'Madrid', 'Grey', '#525152', 30),
('Sliding Panel', 'Full Privacy', 'Madrid', 'Coffee', '#453B38', 40),
('Sliding Panel', 'Blackout', 'Advantage', 'White', '#EDEFF0', 10),
('Sliding Panel', 'Blackout', 'Advantage', 'Ivory', '#E5E4DC', 20),
('Sliding Panel', 'Blackout', 'Advantage', 'Samba', '#C0B5A7', 30),
('Sliding Panel', 'Blackout', 'Advantage', 'Latte', '#999084', 40),
('Sliding Panel', 'Blackout', 'Advantage', 'Coffee', '#5F5352', 50),
('Sliding Panel', 'Blackout', 'Advantage', 'Light Grey', '#BFC0C2', 60),
('Sliding Panel', 'Blackout', 'Advantage', 'Grey', '#7E828B', 70),
('Sliding Panel', 'Blackout', 'Advantage', 'Black', '#403F43', 80),
('Sliding Panel', 'Blackout', 'Madrid', 'White', '#DBDFE1', 10),
('Sliding Panel', 'Blackout', 'Madrid', 'Ivory', '#DCDDD4', 20),
('Sliding Panel', 'Blackout', 'Madrid', 'Grey', '#6D6C6D', 30),
('Sliding Panel', 'Blackout', 'Madrid', 'Coffee', '#433936', 40),
('Dune', 'Full Privacy', 'Aurora', 'White', '#F6F6F6', 10),
('Dune', 'Full Privacy', 'Aurora', 'Ivory', '#F8F9F4', 20),
('Dune', 'Full Privacy', 'Aurora', 'Beige', '#E8E4DB', 30),
('Dune', 'Full Privacy', 'Aurora', 'Biscuit', '#DFD6C9', 40),
('Dune', 'Full Privacy', 'Aurora', 'Smoke', '#B6BABE', 50),
('Dune', 'Full Privacy', 'Luna', 'White', '#FEFEFE', 10),
('Dune', 'Full Privacy', 'Luna', 'Ivory', '#FDFDFD', 20),
('Dune', 'Full Privacy', 'Luna', 'Beige', '#EFEEE6', 30),
('Dune', 'Full Privacy', 'Luna', 'Smoke', '#B2B2B6', 40),
('Dune', 'Full Privacy', 'Luna', 'Slate', '#A4A4A4', 50),
('Dune', 'Full Privacy', 'Nova', 'White', '#F8F8F8', 10),
('Dune', 'Full Privacy', 'Nova', 'Pearl', '#E8E3D9', 20),
('Dune', 'Full Privacy', 'Nova', 'Sand', '#CFCAC0', 30),
('Dune', 'Full Privacy', 'Nova', 'Stone', '#8C8D88', 40),
('Dune', 'Full Privacy', 'Nova', 'Smoke', '#272727', 50),
('Dune', 'Full Privacy', 'Star', 'White', '#F1F1F3', 10),
('Dune', 'Full Privacy', 'Star', 'Ivory', '#F1F1F2', 20),
('Dune', 'Full Privacy', 'Star', 'Beige', '#EFEEEF', 30),
('Dune', 'Full Privacy', 'Star', 'Smoke', '#E2E1E4', 40),
('Dune', 'Full Privacy', 'Star', 'Slate', '#D9D9DB', 50),
('Cellular', 'Sheer', 'Solis', 'White', '#DCDFDC', 10),
('Cellular', 'Sheer', 'Solis', 'Cream', '#E0DAC8', 20),
('Cellular', 'Full Privacy', 'Bolero', 'White', '#F4F3F0', 10),
('Cellular', 'Full Privacy', 'Bolero', 'Ivory', '#E4E1CC', 20),
('Cellular', 'Full Privacy', 'Bolero', 'Beige', '#D0C7AA', 30),
('Cellular', 'Full Privacy', 'Bolero', 'Sand', '#B3AA97', 40),
('Cellular', 'Full Privacy', 'Bolero', 'Chocolate', '#978D80', 50),
('Cellular', 'Full Privacy', 'Bolero', 'Navy', '#717576', 60),
('Cellular', 'Full Privacy', 'Bolero', 'Grey', '#929590', 70),
('Cellular', 'Full Privacy', 'Romance', 'White', '#EBECEE', 10),
('Cellular', 'Full Privacy', 'Romance', 'Ivory', '#E2E0D2', 20),
('Cellular', 'Full Privacy', 'Romance', 'Beige', '#E6DBB7', 30),
('Cellular', 'Full Privacy', 'Romance', 'Sand', '#BDB294', 40),
('Cellular', 'Full Privacy', 'Romance', 'Grey', '#868782', 50),
('Cellular', 'Blackout', 'Noite', 'White', '#93999F', 10),
('Cellular', 'Blackout', 'Noite', 'Ivory', '#908B70', 20),
('Cellular', 'Blackout', 'Noite', 'Beige', '#90835E', 30),
('Cellular', 'Blackout', 'Noite', 'Sand', '#70674D', 40),
('Cellular', 'Blackout', 'Noite', 'Grey', '#595A51', 50),
('Cellular', 'Blackout', 'Privee', 'White', '#9BA1A2', 10),
('Cellular', 'Blackout', 'Privee', 'Ivory', '#9B9A86', 20),
('Cellular', 'Blackout', 'Privee', 'Beige', '#908A75', 30),
('Cellular', 'Blackout', 'Privee', 'Sand', '#807864', 40),
('Cellular', 'Blackout', 'Privee', 'Grey', '#676762', 50),
('Horizontal', 'Full Privacy', 'Real wood', 'Cherry', '#6B2E20', 10),
('Horizontal', 'Full Privacy', 'Real wood', 'Oak', '#B68955', 20),
('Horizontal', 'Full Privacy', 'Real wood', 'Maple', '#C9A66B', 30)
) as v(tname, oname, sname, colour, hex, so)
join public.blind_types t on t.name = v.tname
join public.blind_opacities o on o.type_id = t.id and o.name = v.oname
join public.blind_styles s on s.opacity_id = o.id and s.name = v.sname
on conflict (style_id, name) do update set hex_code = excluded.hex_code;

-- ------------------------------------------------------------
-- 5. Deactivate (never delete) T_ placeholders wherever real children exist.
-- ------------------------------------------------------------
update public.blind_styles p set is_active = false
where p.name like 'T\_%' and exists (
  select 1 from public.blind_styles s
  where s.opacity_id = p.opacity_id and s.name not like 'T\_%' and s.is_active);

update public.blind_colours p set is_active = false
where p.name like 'T\_%' and exists (
  select 1 from public.blind_colours c
  where c.style_id = p.style_id and c.name not like 'T\_%' and c.is_active);

-- ------------------------------------------------------------
-- 6. Supplier layer (staff-only): who fulfils what, with codes.
-- ------------------------------------------------------------
insert into public.suppliers (name, website, contact, notes) values
  ('Vertilux', 'https://partner.vertilux.com/en', 'info@vertilux.com | +1 800 356 8837 | 7753 NW 79th Pl, Medley, FL 33166',
   'Fabrics + systems: roller, dual (Neolux), sliding panels, cellular, dunes, horizontal. Partner portal login unlocks pricing.'),
  ('Loman Distributors', 'http://lomandistributors.com/?lang=en', 'info@lomandistributors.com | (305) 513-8377 | 2740 NW 112 Ave, Doral, FL 33172',
   'Fabrics: roller/roman/panel programme, zebra (Sheer Elegance), screens, wood blinds, cellular. 5-year warranty lines.'),
  ('Mitjavila', 'https://www.mitjavila.com/?lang=en', '+33 4 68 38 20 00 | Route departementale 900, 66600 Rivesaltes, France',
   'Exterior: window awnings, screens, drop-arm, cassette + traditional awnings. Canvas collection behind pro-access area.')
on conflict (name) do update set website = excluded.website, contact = excluded.contact, notes = excluded.notes;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Screen 5% - 3000 Series', '3000-01, 3000-002, 3000-034, 3000-210, 3000-3435, 3000-910, 3000-914, 3000-916', 'Fabric', 'http://lomandistributors.com/roller-shades/tejido-series-3000-screen-5/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Screen 3%', '03-DN001, 03-DN002, 03-DN003, 03-DN034, 03-DN201, 03-DN910, 03-DN914, 03-DN915', 'Fabric', 'http://lomandistributors.com/roller-shades/screen-3/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Screen 1%', 'DN001, DN002, DN201, DN034', 'Fabric', 'http://lomandistributors.com/roller-shades/screen-fabric-1pct/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Eco Screen 1%, 3% y 5%', 'ND001, ND002, ND003, FAB01, FAB03, FAB05, FABROL', 'Fabric', 'http://lomandistributors.com/roller-shades/eco-screen-fabric/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Natural View', 'NAT01, NAT02, NAT03, NAT04, NAT05, NAT06', 'Fabric', 'http://lomandistributors.com/roller-shades/screen-fabric-natural-view/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Carolina', 'C1W, C2B, C3SD, C4S, C70', 'Fabric', 'http://lomandistributors.com/roller-shades/tejido-carolina/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Jupiter', 'J301, J303, J318, J012', 'Fabric', 'http://lomandistributors.com/roller-shades/tejido-jupiter/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Madrid Translucent', 'MADRID-TR01, MADRID-TR02, MADRID-TR03, MADRID-TR04', 'Fabric', 'http://lomandistributors.com/roller-shades/madrid-translucent/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Snowflake Translucent', 'SNOWFLAKE-TR01, SNOWFLAKE-TR02, SNOWFLAKE-TR03, SNOWFLAKE-TR04', 'Fabric', 'http://lomandistributors.com/roller-shades/snowflake-translucid/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Inspiration Wood Look Roller Shades', 'RWL-01ICWL, RWL-0001L, RWL-0100L, RWL-0200L, RWL-0300L, RWL-0400L, RWL-0500L, RWL-0900L', 'Fabric', 'http://lomandistributors.com/roller-shades/tejido-inspiration-wood-look/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Stucco Decorative', '0-002-32-XXXXX', 'Fabric', 'https://partner.vertilux.com/en/products/stucco-decorative' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Advantage Black Out', 'AD01L, AD02L, AD03L, AD04L, AD05L, AD06L, AD07L, AD08L', 'Fabric', 'http://lomandistributors.com/roller-shades/tejido-advantage/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Paris Black Out', 'PARIS-BK01, PARIS-BK02, PARIS-BK03, PARIS-BK04, PARIS-BK05, PARIS-BK06', 'Fabric', 'http://lomandistributors.com/roller-shades/paris-blackout/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Rome Black Out', 'ROME-BK01, ROME-BK02, ROME-BK03, ROME-BK04, ROME-BK05, ROME-BK06', 'Fabric', 'http://lomandistributors.com/roller-shades/rome-blackout/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Madrid Black Out', 'MADRID-BK01, MADRID-BK02, MADRID-BK03, MADRID-BK04', 'Fabric', 'http://lomandistributors.com/roller-shades/madrid-blackout/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Luxury Black Out', '01PW, 02CT, 05RK, 06LF, 07MK, 08MA', 'Fabric', 'http://lomandistributors.com/fabrics-screen/luxury-blackout/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Linen Black Out', '506IL, 5062L, 5063L', 'Fabric', 'http://lomandistributors.com/fabrics-screen/linen-blackout/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Premium Sheer Elegance', 'C401L, C402L, C403L, C404L, C406L, C416L, C418L, C419L, C78L, C65L', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/sheer-elegance-premium/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Bora Bora', 'BORA01, BORA02, BORA03, BORA04', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/bora-bora/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Dolce', 'DOL-01, DOL-02, DOL-03', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/sheer-elegance-dolce/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Marbella Sheer Elegance', 'MA01, MA02, MA03, MA04', 'Fabric', 'http://lomandistributors.com/roller-shades/tejido-marbella/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Zebra Screen', 'ZEBRA-DN001, ZEBRA-DN002, ZEBRA-DN003, ZEBRA-DN914', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/zebra-screen/' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Venezia Dim-Out', 'VEN-01, VEN-02, VEN-03', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/sheer-elegance-venezia-dim-out/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Lush Dimout', 'LUS01, LUS02, LUS03', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/sheer-elegance-lush-dimout/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Milano Sheer Elegance', 'MI01, MI02, MI03, MI04, MI05', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/sheer-elegance-milano/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Toscana Sheer Elegance', 'T01, T02, T03, T04, T05', 'Fabric', 'http://lomandistributors.com/sheer-elegance-zebra-shades/sheer-elegance-toscana/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Dunes Aurora', '0-000-98-0X000', 'Fabric', 'https://partner.vertilux.com/en/products/dunes-aurora' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Dunes Luna Dim Out', '0-000-A4-XXXXX', 'Fabric', 'https://partner.vertilux.com/en/products/dunes-luna-dim-out' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Dunes Nova', '0-000-99-00X00', 'Fabric', 'https://partner.vertilux.com/en/products/dunes-nova' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Dunes Star', '0-000-A3-XXXXX', 'Fabric', 'https://partner.vertilux.com/en/products/dunes-star' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Solis', '0-001-84-10X00', 'Fabric', 'https://partner.vertilux.com/en/products/solis' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Bolero Translucent', '0-001-82-1XXXX', 'Fabric', 'https://partner.vertilux.com/en/products/bolero' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Romance Translucent', '0-001-83-1XXXX', 'Fabric', 'https://partner.vertilux.com/en/products/romance' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Noite Blackout', '0-001-83-2XXXX', 'Fabric', 'https://partner.vertilux.com/en/products/noite' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Privee Blackout', '0-001-82-2XXXX', 'Fabric', 'https://partner.vertilux.com/en/products/privee' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, '2" Basswood Slats', null, 'Fabric', 'https://partner.vertilux.com/en/collections/basswood' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, item_code, category, source_url)
select id, 'Wood and Foam Wood Slats', null, 'Fabric', 'http://lomandistributors.com/wood-blinds/?lang=en' from public.suppliers where name = 'Loman Distributors'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, source_url = excluded.source_url;
insert into public.supplier_products (supplier_id, name, category, source_url, notes)
select id, 'Neolux Collection', 'Fabric', 'https://partner.vertilux.com/en/collections/neolux-collections', 'Dual-shade fabric range - colours behind partner login; candidate for Neolux Shade styles.' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set notes = excluded.notes;
insert into public.supplier_products (supplier_id, name, category, source_url, notes)
select id, 'Neolux Avant Collection', 'Fabric', 'https://partner.vertilux.com/en/collections/neolux-avant-collection', 'Flame-retardant dual-shade range, 100+ colours - candidate for Neolux Shade styles.' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set notes = excluded.notes;
insert into public.supplier_products (supplier_id, name, category, source_url, notes)
select id, 'Neolux Essence Collection', 'Fabric', 'https://partner.vertilux.com/en/collections/neolux-essence-collection', 'Decorative dual-shade range - candidate for Neolux Shade styles.' from public.suppliers where name = 'Vertilux'
on conflict (supplier_id, name) do update set notes = excluded.notes;

-- Style-level supplier links.
insert into public.supplier_links (supplier_product_id, blind_style_id)
select sp.id, st.id
from (values
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%'),
('Loman Distributors', 'Screen 1%', 'Roller Shade', 'Semi Privacy', 'Screen 1%'),
('Loman Distributors', 'Eco Screen 1%, 3% y 5%', 'Roller Shade', 'Semi Privacy', 'Eco Screen'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View'),
('Loman Distributors', 'Carolina', 'Roller Shade', 'Full Privacy', 'Carolina'),
('Loman Distributors', 'Jupiter', 'Roller Shade', 'Full Privacy', 'Jupiter'),
('Loman Distributors', 'Madrid Translucent', 'Roller Shade', 'Full Privacy', 'Madrid'),
('Loman Distributors', 'Snowflake Translucent', 'Roller Shade', 'Full Privacy', 'Snowflake'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome'),
('Loman Distributors', 'Madrid Black Out', 'Roller Shade', 'Blackout', 'Madrid'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury'),
('Loman Distributors', 'Linen Black Out', 'Roller Shade', 'Blackout', 'Linen'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium'),
('Loman Distributors', 'Bora Bora', 'Neolux Shade', 'Non Dim out', 'Bora Bora'),
('Loman Distributors', 'Dolce', 'Neolux Shade', 'Non Dim out', 'Dolce'),
('Loman Distributors', 'Marbella Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Marbella'),
('Loman Distributors', 'Zebra Screen', 'Neolux Shade', 'Non Dim out', 'Zebra Screen'),
('Loman Distributors', 'Venezia Dim-Out', 'Neolux Shade', 'Dim out', 'Venezia'),
('Loman Distributors', 'Lush Dimout', 'Neolux Shade', 'Dim out', 'Lush'),
('Loman Distributors', 'Milano Sheer Elegance', 'Neolux Shade', 'Dim out', 'Milano'),
('Loman Distributors', 'Toscana Sheer Elegance', 'Neolux Shade', 'Dim out', 'Toscana'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View'),
('Loman Distributors', 'Madrid Translucent', 'Sliding Panel', 'Full Privacy', 'Madrid'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage'),
('Loman Distributors', 'Madrid Black Out', 'Sliding Panel', 'Blackout', 'Madrid'),
('Vertilux', 'Dunes Aurora', 'Dune', 'Full Privacy', 'Aurora'),
('Vertilux', 'Dunes Luna Dim Out', 'Dune', 'Full Privacy', 'Luna'),
('Vertilux', 'Dunes Nova', 'Dune', 'Full Privacy', 'Nova'),
('Vertilux', 'Dunes Star', 'Dune', 'Full Privacy', 'Star'),
('Vertilux', 'Solis', 'Cellular', 'Sheer', 'Solis'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero'),
('Vertilux', 'Romance Translucent', 'Cellular', 'Full Privacy', 'Romance'),
('Vertilux', 'Noite Blackout', 'Cellular', 'Blackout', 'Noite'),
('Vertilux', 'Privee Blackout', 'Cellular', 'Blackout', 'Privee'),
('Vertilux', '2" Basswood Slats', 'Horizontal', 'Full Privacy', 'Real wood'),
('Loman Distributors', 'Wood and Foam Wood Slats', 'Horizontal', 'Full Privacy', 'Faux wood')
) as v(supplier, spname, tname, oname, sname)
join public.suppliers su on su.name = v.supplier
join public.supplier_products sp on sp.supplier_id = su.id and sp.name = v.spname
join public.blind_types t on t.name = v.tname
join public.blind_opacities o on o.type_id = t.id and o.name = v.oname
join public.blind_styles st on st.opacity_id = o.id and st.name = v.sname
where not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.blind_style_id = st.id);

-- Colour-level supplier links (reorder codes).
insert into public.supplier_links (supplier_product_id, blind_colour_id, supplier_colour_code)
select sp.id, bc.id, v.code
from (values
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'White', '3000-01'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'White Linen', '3000-002'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'White Pearl', '3000-034'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'Linen', '3000-210'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'Pearl Linen', '3000-3435'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'Bronze', '3000-910'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'Black', '3000-914'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Roller Shade', 'Sheer', 'Screen 5%', 'Black Pearl', '3000-916'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'White', '03-DN001'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'White Linen', '03-DN002'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'White Grey', '03-DN003'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'White Pearl', '03-DN034'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'Linen', '03-DN201'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'Dark Bronze', '03-DN910'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'Black', '03-DN914'),
('Loman Distributors', 'Screen 3%', 'Roller Shade', 'Semi Privacy', 'Screen 3%', 'Black Bronze', '03-DN915'),
('Loman Distributors', 'Screen 1%', 'Roller Shade', 'Semi Privacy', 'Screen 1%', 'White', 'DN001'),
('Loman Distributors', 'Screen 1%', 'Roller Shade', 'Semi Privacy', 'Screen 1%', 'White Linen', 'DN002'),
('Loman Distributors', 'Screen 1%', 'Roller Shade', 'Semi Privacy', 'Screen 1%', 'Linen', 'DN201'),
('Loman Distributors', 'Screen 1%', 'Roller Shade', 'Semi Privacy', 'Screen 1%', 'White Pearl', 'DN034'),
('Loman Distributors', 'Eco Screen 1%, 3% y 5%', 'Roller Shade', 'Semi Privacy', 'Eco Screen', 'Ice White', 'ND001'),
('Loman Distributors', 'Eco Screen 1%, 3% y 5%', 'Roller Shade', 'Semi Privacy', 'Eco Screen', 'White Linen', 'ND002'),
('Loman Distributors', 'Eco Screen 1%, 3% y 5%', 'Roller Shade', 'Semi Privacy', 'Eco Screen', 'White Pearl', 'ND003'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View', 'Linen', 'NAT01'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View', 'White', 'NAT02'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View', 'Ivory', 'NAT03'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View', 'Capuchino', 'NAT04'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View', 'Chocolate', 'NAT05'),
('Loman Distributors', 'Natural View', 'Roller Shade', 'Full Privacy', 'Natural View', 'Black', 'NAT06'),
('Loman Distributors', 'Carolina', 'Roller Shade', 'Full Privacy', 'Carolina', 'White', 'C1W'),
('Loman Distributors', 'Carolina', 'Roller Shade', 'Full Privacy', 'Carolina', 'Beige', 'C2B'),
('Loman Distributors', 'Carolina', 'Roller Shade', 'Full Privacy', 'Carolina', 'Sand', 'C3SD'),
('Loman Distributors', 'Carolina', 'Roller Shade', 'Full Privacy', 'Carolina', 'Steel', 'C4S'),
('Loman Distributors', 'Carolina', 'Roller Shade', 'Full Privacy', 'Carolina', 'Oliver', 'C70'),
('Loman Distributors', 'Jupiter', 'Roller Shade', 'Full Privacy', 'Jupiter', 'White', 'J301'),
('Loman Distributors', 'Jupiter', 'Roller Shade', 'Full Privacy', 'Jupiter', 'Ivory', 'J303'),
('Loman Distributors', 'Jupiter', 'Roller Shade', 'Full Privacy', 'Jupiter', 'Chocolate', 'J318'),
('Loman Distributors', 'Jupiter', 'Roller Shade', 'Full Privacy', 'Jupiter', 'Light Grey', 'J012'),
('Loman Distributors', 'Madrid Translucent', 'Roller Shade', 'Full Privacy', 'Madrid', 'White', 'MADRID-TR01'),
('Loman Distributors', 'Madrid Translucent', 'Roller Shade', 'Full Privacy', 'Madrid', 'Ivory', 'MADRID-TR02'),
('Loman Distributors', 'Madrid Translucent', 'Roller Shade', 'Full Privacy', 'Madrid', 'Grey', 'MADRID-TR03'),
('Loman Distributors', 'Madrid Translucent', 'Roller Shade', 'Full Privacy', 'Madrid', 'Coffee', 'MADRID-TR04'),
('Loman Distributors', 'Snowflake Translucent', 'Roller Shade', 'Full Privacy', 'Snowflake', 'White', 'SNOWFLAKE-TR01'),
('Loman Distributors', 'Snowflake Translucent', 'Roller Shade', 'Full Privacy', 'Snowflake', 'Khaki', 'SNOWFLAKE-TR02'),
('Loman Distributors', 'Snowflake Translucent', 'Roller Shade', 'Full Privacy', 'Snowflake', 'Stone', 'SNOWFLAKE-TR03'),
('Loman Distributors', 'Snowflake Translucent', 'Roller Shade', 'Full Privacy', 'Snowflake', 'Grey', 'SNOWFLAKE-TR04'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Ice White', 'RWL-01ICWL'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'White', 'RWL-0001L'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Mushroom', 'RWL-0100L'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Khaki', 'RWL-0200L'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Cherry', 'RWL-0300L'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Brown', 'RWL-0400L'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Chocolate', 'RWL-0500L'),
('Loman Distributors', 'Inspiration Wood Look Roller Shades', 'Roller Shade', 'Full Privacy', 'Wood Look', 'Grey', 'RWL-0900L'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco', 'White', '0-002-32-01110'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco', 'Off White', '0-002-32-02110'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco', 'Linen', '0-002-32-03110'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco', 'Sand', '0-002-32-04110'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco', 'Mocha', '0-002-32-05110'),
('Vertilux', 'Stucco Decorative', 'Roller Shade', 'Full Privacy', 'Stucco', 'Stone', '0-002-32-06110'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'White', 'AD01L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Ivory', 'AD02L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Samba', 'AD03L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Latte', 'AD04L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Coffee', 'AD05L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Light Grey', 'AD06L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Grey', 'AD07L'),
('Loman Distributors', 'Advantage Black Out', 'Roller Shade', 'Blackout', 'Advantage', 'Black', 'AD08L'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris', 'Snow White', 'PARIS-BK01'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris', 'Ivory', 'PARIS-BK02'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris', 'Latte', 'PARIS-BK03'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris', 'Coffee', 'PARIS-BK04'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris', 'Light Grey', 'PARIS-BK05'),
('Loman Distributors', 'Paris Black Out', 'Roller Shade', 'Blackout', 'Paris', 'Grey', 'PARIS-BK06'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome', 'Snow', 'ROME-BK01'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome', 'Cream', 'ROME-BK02'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome', 'Beige', 'ROME-BK03'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome', 'Light Grey', 'ROME-BK04'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome', 'Grey', 'ROME-BK05'),
('Loman Distributors', 'Rome Black Out', 'Roller Shade', 'Blackout', 'Rome', 'Coffee', 'ROME-BK06'),
('Loman Distributors', 'Madrid Black Out', 'Roller Shade', 'Blackout', 'Madrid', 'White', 'MADRID-BK01'),
('Loman Distributors', 'Madrid Black Out', 'Roller Shade', 'Blackout', 'Madrid', 'Ivory', 'MADRID-BK02'),
('Loman Distributors', 'Madrid Black Out', 'Roller Shade', 'Blackout', 'Madrid', 'Grey', 'MADRID-BK03'),
('Loman Distributors', 'Madrid Black Out', 'Roller Shade', 'Blackout', 'Madrid', 'Coffee', 'MADRID-BK04'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury', 'Pure White', '01PW'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury', 'Cotton', '02CT'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury', 'Rock', '05RK'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury', 'Leaf', '06LF'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury', 'Mocha', '07MK'),
('Loman Distributors', 'Luxury Black Out', 'Roller Shade', 'Blackout', 'Luxury', 'Marine', '08MA'),
('Loman Distributors', 'Linen Black Out', 'Roller Shade', 'Blackout', 'Linen', 'Natural', '506IL'),
('Loman Distributors', 'Linen Black Out', 'Roller Shade', 'Blackout', 'Linen', 'Custard', '5062L'),
('Loman Distributors', 'Linen Black Out', 'Roller Shade', 'Blackout', 'Linen', 'Red', '5063L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Ice White', 'C401L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'White', 'C402L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Ivory', 'C403L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Oyster', 'C404L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Peach', 'C406L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Taupe', 'A410'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Mustard', 'A407'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Grey', 'C416L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Chocolate', 'C418L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Charcoal', 'C419L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Red', 'C78L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Sky Blue', 'C65L'),
('Loman Distributors', 'Premium Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Premium', 'Pink', 'C04L'),
('Loman Distributors', 'Bora Bora', 'Neolux Shade', 'Non Dim out', 'Bora Bora', 'White', 'BORA01'),
('Loman Distributors', 'Bora Bora', 'Neolux Shade', 'Non Dim out', 'Bora Bora', 'Cream', 'BORA02'),
('Loman Distributors', 'Bora Bora', 'Neolux Shade', 'Non Dim out', 'Bora Bora', 'Beige', 'BORA03'),
('Loman Distributors', 'Bora Bora', 'Neolux Shade', 'Non Dim out', 'Bora Bora', 'Pearl', 'BORA04'),
('Loman Distributors', 'Dolce', 'Neolux Shade', 'Non Dim out', 'Dolce', 'White', 'DOL-01'),
('Loman Distributors', 'Dolce', 'Neolux Shade', 'Non Dim out', 'Dolce', 'Beige', 'DOL-02'),
('Loman Distributors', 'Dolce', 'Neolux Shade', 'Non Dim out', 'Dolce', 'Pearl Grey', 'DOL-03'),
('Loman Distributors', 'Marbella Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Marbella', 'Ice White', 'MA01'),
('Loman Distributors', 'Marbella Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Marbella', 'Off White', 'MA02'),
('Loman Distributors', 'Marbella Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Marbella', 'Silver', 'MA03'),
('Loman Distributors', 'Marbella Sheer Elegance', 'Neolux Shade', 'Non Dim out', 'Marbella', 'Wood', 'MA04'),
('Loman Distributors', 'Zebra Screen', 'Neolux Shade', 'Non Dim out', 'Zebra Screen', 'White', 'ZEBRA-DN001'),
('Loman Distributors', 'Zebra Screen', 'Neolux Shade', 'Non Dim out', 'Zebra Screen', 'White Linen', 'ZEBRA-DN002'),
('Loman Distributors', 'Zebra Screen', 'Neolux Shade', 'Non Dim out', 'Zebra Screen', 'White Grey', 'ZEBRA-DN003'),
('Loman Distributors', 'Zebra Screen', 'Neolux Shade', 'Non Dim out', 'Zebra Screen', 'Black', 'ZEBRA-DN914'),
('Loman Distributors', 'Venezia Dim-Out', 'Neolux Shade', 'Dim out', 'Venezia', 'White', 'VEN-01'),
('Loman Distributors', 'Venezia Dim-Out', 'Neolux Shade', 'Dim out', 'Venezia', 'Ivory', 'VEN-02'),
('Loman Distributors', 'Venezia Dim-Out', 'Neolux Shade', 'Dim out', 'Venezia', 'Light Grey', 'VEN-03'),
('Loman Distributors', 'Lush Dimout', 'Neolux Shade', 'Dim out', 'Lush', 'Ice White', 'LUS01'),
('Loman Distributors', 'Lush Dimout', 'Neolux Shade', 'Dim out', 'Lush', 'Ivory', 'LUS02'),
('Loman Distributors', 'Lush Dimout', 'Neolux Shade', 'Dim out', 'Lush', 'Beige', 'LUS03'),
('Loman Distributors', 'Milano Sheer Elegance', 'Neolux Shade', 'Dim out', 'Milano', 'White', 'MI01'),
('Loman Distributors', 'Milano Sheer Elegance', 'Neolux Shade', 'Dim out', 'Milano', 'Ivory', 'MI02'),
('Loman Distributors', 'Milano Sheer Elegance', 'Neolux Shade', 'Dim out', 'Milano', 'Grey', 'MI03'),
('Loman Distributors', 'Milano Sheer Elegance', 'Neolux Shade', 'Dim out', 'Milano', 'Beige', 'MI04'),
('Loman Distributors', 'Milano Sheer Elegance', 'Neolux Shade', 'Dim out', 'Milano', 'Chocolate', 'MI05'),
('Loman Distributors', 'Toscana Sheer Elegance', 'Neolux Shade', 'Dim out', 'Toscana', 'White', 'T01'),
('Loman Distributors', 'Toscana Sheer Elegance', 'Neolux Shade', 'Dim out', 'Toscana', 'Mushroom', 'T02'),
('Loman Distributors', 'Toscana Sheer Elegance', 'Neolux Shade', 'Dim out', 'Toscana', 'Chocolate', 'T03'),
('Loman Distributors', 'Toscana Sheer Elegance', 'Neolux Shade', 'Dim out', 'Toscana', 'Grey', 'T04'),
('Loman Distributors', 'Toscana Sheer Elegance', 'Neolux Shade', 'Dim out', 'Toscana', 'Black', 'T05'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'White', '3000-01'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'White Linen', '3000-002'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'White Pearl', '3000-034'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'Linen', '3000-210'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'Pearl Linen', '3000-3435'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'Bronze', '3000-910'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'Black', '3000-914'),
('Loman Distributors', 'Screen 5% - 3000 Series', 'Sliding Panel', 'Sheer', 'Screen 5%', 'Black Pearl', '3000-916'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White', '03-DN001'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White Linen', '03-DN002'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White Grey', '03-DN003'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'White Pearl', '03-DN034'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Linen', '03-DN201'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Dark Bronze', '03-DN910'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Black', '03-DN914'),
('Loman Distributors', 'Screen 3%', 'Sliding Panel', 'Semi Privacy', 'Screen 3%', 'Black Bronze', '03-DN915'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View', 'Linen', 'NAT01'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View', 'White', 'NAT02'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View', 'Ivory', 'NAT03'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View', 'Capuchino', 'NAT04'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View', 'Chocolate', 'NAT05'),
('Loman Distributors', 'Natural View', 'Sliding Panel', 'Full Privacy', 'Natural View', 'Black', 'NAT06'),
('Loman Distributors', 'Madrid Translucent', 'Sliding Panel', 'Full Privacy', 'Madrid', 'White', 'MADRID-TR01'),
('Loman Distributors', 'Madrid Translucent', 'Sliding Panel', 'Full Privacy', 'Madrid', 'Ivory', 'MADRID-TR02'),
('Loman Distributors', 'Madrid Translucent', 'Sliding Panel', 'Full Privacy', 'Madrid', 'Grey', 'MADRID-TR03'),
('Loman Distributors', 'Madrid Translucent', 'Sliding Panel', 'Full Privacy', 'Madrid', 'Coffee', 'MADRID-TR04'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'White', 'AD01L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Ivory', 'AD02L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Samba', 'AD03L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Latte', 'AD04L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Coffee', 'AD05L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Light Grey', 'AD06L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Grey', 'AD07L'),
('Loman Distributors', 'Advantage Black Out', 'Sliding Panel', 'Blackout', 'Advantage', 'Black', 'AD08L'),
('Loman Distributors', 'Madrid Black Out', 'Sliding Panel', 'Blackout', 'Madrid', 'White', 'MADRID-BK01'),
('Loman Distributors', 'Madrid Black Out', 'Sliding Panel', 'Blackout', 'Madrid', 'Ivory', 'MADRID-BK02'),
('Loman Distributors', 'Madrid Black Out', 'Sliding Panel', 'Blackout', 'Madrid', 'Grey', 'MADRID-BK03'),
('Loman Distributors', 'Madrid Black Out', 'Sliding Panel', 'Blackout', 'Madrid', 'Coffee', 'MADRID-BK04'),
('Vertilux', 'Dunes Aurora', 'Dune', 'Full Privacy', 'Aurora', 'White', '0-000-98-01000'),
('Vertilux', 'Dunes Aurora', 'Dune', 'Full Privacy', 'Aurora', 'Ivory', '0-000-98-02000'),
('Vertilux', 'Dunes Aurora', 'Dune', 'Full Privacy', 'Aurora', 'Beige', '0-000-98-03000'),
('Vertilux', 'Dunes Aurora', 'Dune', 'Full Privacy', 'Aurora', 'Biscuit', '0-000-98-04000'),
('Vertilux', 'Dunes Aurora', 'Dune', 'Full Privacy', 'Aurora', 'Smoke', '0-000-98-07000'),
('Vertilux', 'Dunes Luna Dim Out', 'Dune', 'Full Privacy', 'Luna', 'White', '0-000-A4-00100'),
('Vertilux', 'Dunes Luna Dim Out', 'Dune', 'Full Privacy', 'Luna', 'Ivory', '0-000-A4-00200'),
('Vertilux', 'Dunes Luna Dim Out', 'Dune', 'Full Privacy', 'Luna', 'Beige', '0-000-A4-00300'),
('Vertilux', 'Dunes Luna Dim Out', 'Dune', 'Full Privacy', 'Luna', 'Smoke', '0-000-A4-00600'),
('Vertilux', 'Dunes Luna Dim Out', 'Dune', 'Full Privacy', 'Luna', 'Slate', '0-000-A4-00700'),
('Vertilux', 'Dunes Nova', 'Dune', 'Full Privacy', 'Nova', 'White', '0-000-99-00100'),
('Vertilux', 'Dunes Nova', 'Dune', 'Full Privacy', 'Nova', 'Pearl', '0-000-99-00200'),
('Vertilux', 'Dunes Nova', 'Dune', 'Full Privacy', 'Nova', 'Sand', '0-000-99-00400'),
('Vertilux', 'Dunes Nova', 'Dune', 'Full Privacy', 'Nova', 'Stone', '0-000-99-00600'),
('Vertilux', 'Dunes Nova', 'Dune', 'Full Privacy', 'Nova', 'Smoke', '0-000-99-00700'),
('Vertilux', 'Dunes Star', 'Dune', 'Full Privacy', 'Star', 'White', '0-000-A3-00100'),
('Vertilux', 'Dunes Star', 'Dune', 'Full Privacy', 'Star', 'Ivory', '0-000-A3-00200'),
('Vertilux', 'Dunes Star', 'Dune', 'Full Privacy', 'Star', 'Beige', '0-000-A3-00400'),
('Vertilux', 'Dunes Star', 'Dune', 'Full Privacy', 'Star', 'Smoke', '0-000-A3-01300'),
('Vertilux', 'Dunes Star', 'Dune', 'Full Privacy', 'Star', 'Slate', '0-000-A3-01600'),
('Vertilux', 'Solis', 'Cellular', 'Sheer', 'Solis', 'White', '0-001-84-10100'),
('Vertilux', 'Solis', 'Cellular', 'Sheer', 'Solis', 'Cream', '0-001-84-10200'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'White', '0-001-82-10100'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'Ivory', '0-001-82-10200'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'Beige', '0-001-82-10300'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'Sand', '0-001-82-10400'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'Chocolate', '0-001-82-10500'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'Navy', '0-001-82-10600'),
('Vertilux', 'Bolero Translucent', 'Cellular', 'Full Privacy', 'Bolero', 'Grey', '0-001-82-10700'),
('Vertilux', 'Romance Translucent', 'Cellular', 'Full Privacy', 'Romance', 'White', '0-001-83-10100'),
('Vertilux', 'Romance Translucent', 'Cellular', 'Full Privacy', 'Romance', 'Ivory', '0-001-83-10200'),
('Vertilux', 'Romance Translucent', 'Cellular', 'Full Privacy', 'Romance', 'Beige', '0-001-83-10300'),
('Vertilux', 'Romance Translucent', 'Cellular', 'Full Privacy', 'Romance', 'Sand', '0-001-83-10400'),
('Vertilux', 'Romance Translucent', 'Cellular', 'Full Privacy', 'Romance', 'Grey', '0-001-83-10700'),
('Vertilux', 'Noite Blackout', 'Cellular', 'Blackout', 'Noite', 'White', '0-001-83-20100'),
('Vertilux', 'Noite Blackout', 'Cellular', 'Blackout', 'Noite', 'Ivory', '0-001-83-20200'),
('Vertilux', 'Noite Blackout', 'Cellular', 'Blackout', 'Noite', 'Beige', '0-001-83-20300'),
('Vertilux', 'Noite Blackout', 'Cellular', 'Blackout', 'Noite', 'Sand', '0-001-83-20400'),
('Vertilux', 'Noite Blackout', 'Cellular', 'Blackout', 'Noite', 'Grey', '0-001-83-20700'),
('Vertilux', 'Privee Blackout', 'Cellular', 'Blackout', 'Privee', 'White', '0-001-82-20100'),
('Vertilux', 'Privee Blackout', 'Cellular', 'Blackout', 'Privee', 'Ivory', '0-001-82-20200'),
('Vertilux', 'Privee Blackout', 'Cellular', 'Blackout', 'Privee', 'Beige', '0-001-82-20300'),
('Vertilux', 'Privee Blackout', 'Cellular', 'Blackout', 'Privee', 'Sand', '0-001-82-20400'),
('Vertilux', 'Privee Blackout', 'Cellular', 'Blackout', 'Privee', 'Grey', '0-001-82-20700')
) as v(supplier, spname, tname, oname, sname, cname, code)
join public.suppliers su on su.name = v.supplier
join public.supplier_products sp on sp.supplier_id = su.id and sp.name = v.spname
join public.blind_types t on t.name = v.tname
join public.blind_opacities o on o.type_id = t.id and o.name = v.oname
join public.blind_styles st on st.opacity_id = o.id and st.name = v.sname
join public.blind_colours bc on bc.style_id = st.id and bc.name = v.cname
where not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.blind_colour_id = bc.id);

-- ------------------------------------------------------------
-- 7. Exterior (recommended NEW structure; awnings had none):
--    categories + staged products (is_active=false until priced).
-- ------------------------------------------------------------
insert into public.awning_categories (name, description, image_url, sort_order)
values ('Window Awnings', 'Made-to-measure exterior awnings for individual windows — tensioned, sliding or drop-arm — that stop heat at the glass.', '/images/catalog/awnings/window-awnings.jpg', 10)
on conflict (name) do update set description = excluded.description, image_url = excluded.image_url;
insert into public.awning_categories (name, description, image_url, sort_order)
values ('Exterior Screens', 'Discreet vertical screens that filter light, block prying eyes and keep insects out — guided cable, rail or zip-box systems.', '/images/catalog/awnings/exterior-screens.jpg', 20)
on conflict (name) do update set description = excluded.description, image_url = excluded.image_url;
insert into public.awning_categories (name, description, image_url, sort_order)
values ('Drop-Arm & Guided Blinds', 'Adjustable drop-arm and guided exterior blinds for windows, doors and bay windows — soft light when you want it, shade when you need it.', null, 30)
on conflict (name) do update set description = excluded.description, image_url = excluded.image_url;
insert into public.awning_categories (name, description, image_url, sort_order)
values ('Cassette Awnings', 'Compact cassette awnings protect the fabric inside a sleek aluminium box — discreet on the facade, generous over the patio.', '/images/catalog/awnings/cassette-awnings.jpg', 40)
on conflict (name) do update set description = excluded.description, image_url = excluded.image_url;
insert into public.awning_categories (name, description, image_url, sort_order)
values ('Traditional Awnings', 'The proven classic — economical, reliable sun protection for every facade, wall or ceiling mounted.', '/images/catalog/awnings/traditional-awnings.jpg', 50)
on conflict (name) do update set description = excluded.description, image_url = excluded.image_url;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Tensioner window blind', 'SU26 (system brochure reference)', 'Exterior - Window Awnings', 'Suitable for individual windows; compact aluminum structure; sleek vertical cable guidance; winch or motorized operation; ceiling, facade and reveal mounting.', 'https://www.mitjavila.com/our-products/window-awnings-and-screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Sliding window blind', 'SU26 (system brochure reference)', 'Exterior - Window Awnings', 'Suitable for individual windows; compact aluminum structure; vertical profile guidance; winch or motorized operation; ceiling, facade and reveal mounting.', 'https://www.mitjavila.com/our-products/window-awnings-and-screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Window arm blind', 'SU26 (system brochure reference)', 'Exterior - Window Awnings', 'Suitable for individual windows; compact aluminum structure; straight arm with spring; folds behind a traditional shutter; winch or motorized operation; ceiling, facade and reveal mounting.', 'https://www.mitjavila.com/our-products/window-awnings-and-screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Projection awning (spring-loaded single projection / Italian window awning)', 'ES150 (arm support part), SU16 (support part, shared with guide awning)', 'Exterior - Window Awnings', 'Projection up to 1.50 m; width up to 4.80 m; tilts up to 160 degrees; manual or motorised (two motorisations: mechanical limit switches with emergency operation, or electronic limit switches); optional wind operator (vibration sensor); Clever repairable aluminium arms with on-site tension adjustment via hexagonal key; facade, ceiling or recess (panel) installation with the same support part; frame colours RAL9010ST or RAL7016 Anthracite as standard; 100% aluminium.', 'https://www.mitjavila.com/our-products/window-awnings-and-screens/projection-awning/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Screen 55mm - 65mm - 75mm', '55, 65, 75', 'Exterior - Screens', 'Cassette sizes 55/65/75 mm. No further specs listed on the index page (heading only, no bullet list published).', 'https://www.mitjavila.com/our-products/screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Screen 85mm - 95mm', '85, 95', 'Exterior - Screens', 'Suitable for large windows; fabric fully protected in closed position; reduced overall dimension / compact; wall/recess and front/side fixing; operation by winch (gear box) or motor; box (cassette), guide rails and front bar made of aluminum extrusions; simplified assembly and disassembly (access to motor and fabric).', 'https://www.mitjavila.com/our-products/screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Screen 75P', '75P', 'Exterior - Screens', 'No specs listed on the index page (heading only).', 'https://www.mitjavila.com/our-products/screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Screen 95mm with tensioning mechanism (Screen 95mm a tension)', '95', 'Exterior - Screens', 'Suitable for large windows; fabric fully protected when closed; springs in the load bar / front bar to tension the fabric; wall and recess (front and side) fixing; motorised operation only; cassette, guide rails and front bar in extruded aluminium profiles; easy installation and removal (access to motor and fabric).', 'https://www.mitjavila.com/our-products/screens/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Vertical box screen / sliding cassette 105-115 (Screen ZIP)', '105, 115', 'Exterior - Screens', 'Cassette 105 mm or 115 mm depending on structure to be covered; square cassette profile only on 115 mm (105 available bevelled or square); torque-limiting motor tensions fabric via front-bar locking system; fabric guided in side channels (resists light winds, must be rolled up in gusts); RAL 7016ST Anthracite textured or RAL 9010ST textured standard; can be installed on pergolas, loggias, balconies and other openings; frames available alone or with fabric included (pro).', 'https://www.mitjavila.com/our-products/options-for-pergolas-and-enclosures/vertical-box-screen/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Chest 105 and 115 with slides (exterior roller blind boxes)', '105, 115', 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for very large sizes; canopy fully protected when closed; ideal for bay windows and pergolas; winch or motor operation; load bar locking system for perfect canvas tension; available with bevelled or square edge; 105mm and 115mm boxes can be installed on Mitjavila horizontally-structured aluminium pergolas. Detail page: vertical-box-screen (see Screens category entry).', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Balcony awning', null, 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for large dimensions; facade, ceiling and doorway installation; arm folds along the load bar for variable positions; winch or motorized operation.', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Right arm blind (drop-arm / straight-arm blind)', 'Clever arm', 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for very large dimensions; facade, ceiling and reveal installation possible; new Clever arm for easier installation; winch or motorized operation. Learn-more links to the Projection awning detail page (see Window Awnings category).', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Chest 105 right arm', '105', 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for large sizes; fully protected canvas in closed position; new Clever arm for easier installation; winch or motorized operation.', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Guide blind', null, 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for very large sizes; vertical blinds guided by aluminum rod; ceiling or doorway installation; winch or motorized operation.', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Reinforced blind with slides', null, 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for very large sizes; fully protected fabric in closed position; ideal for bay windows and pergola; winch or motor operation; load bar locking system for perfect tension of the fabric; available in cut (bevelled) or square pan.', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Reinforced chest with slides', null, 'Exterior - Drop-Arm, Blinds with guides or guiderails', 'Suitable for very large sizes; canvas fully protected in closed position; vertical awning guided by aluminum profile; winch or motorized operation; load bar locking system for perfect canvas tension.', 'https://www.mitjavila.com/our-products/stores-bras-droits-a-guides-et-a-coulisses/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassette 235 (C235, integral box awning with LED)', 'C235', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Maximum width 6 m; projection 3.50 m max (3.00 m max with solar operator); pitch 5-20 degrees; overall cassette dimensions 155mm x 253mm; gear (manual) or motor drive with manual override; motor removable from the side without dismantling the awning; optional LED lighting kit under the cassette; 100% aluminium (extruded wall bracket, casing, load bar, arm support, roller tube; cast aluminium trim; drop-forged arm support; A2 stainless steel screws); independent arm supports; central support poss', 'https://www.mitjavila.com/our-products/cassette-compacts/integral-box-awning-led/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassette 95 (C95, small awning)', 'C95', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Small-dimension cassette awning. Not equipped with Clever Arm (exception noted on category page). Detail page only available in French (les-produits-mitjavila/bannes-et-coffres-compacts/store-banne-coffre-petite-dimension-c95).', 'https://www.mitjavila.com/our-products/cassette-compacts/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Loggia 125 (L125)', 'L125, BMF / BMFYY arms', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Maximum width 4.80 m; maximum projection 3.00 m; inclination up to 60 degrees (ceiling installation angle 15-90 degrees, vertical awning possible); facade or ceiling installation; can be motorised; option: traditional front bar; optional side panel to hide screws (2022 redesign); pole/structure colour White RAL9010 or grey RAL7016 as standard; 100% aluminium; BMFYY arms with tension springs, removable and repairable.', 'https://www.mitjavila.com/our-products/cassette-compacts/loggia-125-awning/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassettes 125 - 135 (C135 motorised awning, best seller)', 'C125, C135', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Maximum width 5.98 m; projection 3.50 m; motorised operation; self-supporting cassette awning with quick-release fasteners; ceiling or facade installation; variable fastener aligning front bar with cassette and guide block; LED option integrated into the cassette; structure colour standard RAL 9010 satin gloss (other finishes optional); extruded aluminium profiles and cast parts; aluminium roller tube.', 'https://www.mitjavila.com/our-products/cassette-compacts/c135-motorised-awning/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassettes 250 and 275 - Suspension series (wood frame house)', 'C250, C275', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Width up to 6 m; extension (projection) 3 m max; pitch 0-20 degrees; gear or motor drive with manual override; motor removable from the side; optional complete LED lighting kit; independent multiple mounting brackets (minimum 4, patented) alignable with timber-frame rafters or exterior insulation; C250 horizontal box (removable upper part, ceiling mount possible), C275 vertical box; fully enclosed self-supporting aluminium box; independent arm supports shiftable toward centre; slope adjustment l', 'https://www.mitjavila.com/our-products/cassette-compacts/box-awnings-250-and-275-suspension-series/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassette 260 (C260 large awning)', 'C260', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Maximum projection up to 3.50 m; maximum width 6 m; tilt adjustment 3-30 degrees; box depth 265 mm; frame colours White, Anthracite or other colours on request; optional complete LED lighting kit (low voltage); offset arms for strength; variator claw aligning load bar with box and guide block; arms adjusted by eccentric screw; intermediate support possible; independent fixing brackets; conforms to EN13561:2015.', 'https://www.mitjavila.com/our-products/cassette-compacts/large-cassette-awning-260/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassette 262 (C262 aluminium awning)', 'C262, TM-TME / TMS motors, Gliss''Control system, BMF arms', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Width up to 7.15 m (with intermediate fixing support, required from 6 m); projection (advance) up to 3.50 m; motorised only (winch operation not available), TM-TME or TMS motors with emergency operation, motor accessible/replaceable without dismantling; facade installation only; optional radio remote control motorisation, LED strip lighting (usable with box slightly open), wind/vibration sensor; winding tube compensation system (Gliss''Control) for fabric tensioning in long lengths; extruded lacq', 'https://www.mitjavila.com/our-products/cassette-compacts/aluminum-blind-box-262/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Cassette 220 (C220 modern retractable awning)', 'C220', 'Exterior - Cassette compacts (compact awnings and cassette boxes)', 'Maximum width 6 m; projection 3.50 m; perfectly square box 22x22 cm (220 mm footprint); extruded aluminium structure; motorised; integrated LED lighting option (works open or closed); roll-up lambrequin option (vertical blind in the load bar, 0-60 cm, winch operated); frame colour RAL 7016 anthracite as standard; removable and repairable Clever arms; assembled and installed in one piece.', 'https://www.mitjavila.com/our-products/cassette-compacts/modern-retractable-awning-c220/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Loggia 112 (L112 traditional awning)', 'L112', 'Exterior - Traditional awnings', 'Maximum projection 3 m; maximum width 4.80 m; tilt 0-90 degrees; aluminium winding tube; ceiling or facade installation (direct fixing); cast aluminium construction; crossed arms possible for small dimensions; conforms to EN13561; quick access to adjustment screws.', 'https://www.mitjavila.com/our-products/traditional-awnings/store-traditionnel-l112/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Independant 100 (Independent 100)', 'I100', 'Exterior - Traditional awnings', 'Traditional awning in cast aluminium; direct fixing (two versions: facade and ceiling); very simple orientation adjustment with quick access to adjustment screws; conforms to EN13561. (Bullets shown in French on the English page.)', 'https://www.mitjavila.com/our-products/traditional-awnings/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Monobloc 100 (M100)', 'M100', 'Exterior - Traditional awnings', 'Self-supporting awning on steel tube; offset arm support (ideal for large widths); simplified fixing with multi-support (facade and ceiling); simple orientation adjustment; crossed arms possible; conforms to EN13561. (Bullets shown in French on the English page.)', 'https://www.mitjavila.com/our-products/traditional-awnings/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Loggia 300A', 'L300A', 'Exterior - Traditional awnings', 'Small-dimension awning; traditional awning in cast aluminium; direct fixing (facade and ceiling installation); simple orientation adjustment; conforms to EN13561. (Bullets shown in French on the English page.)', 'https://www.mitjavila.com/our-products/traditional-awnings/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Monobloc 300A (M300A)', 'M300A', 'Exterior - Traditional awnings', 'Self-supporting awning on steel tube; offset arm support (ideal for large widths); simplified fixing with multi-support (facade and ceiling); simple orientation adjustment; conforms to EN13561. (Bullets shown in French on the English page.)', 'https://www.mitjavila.com/our-products/traditional-awnings/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Store tradition (Tradition awning)', null, 'Exterior - Traditional awnings', '100% aluminium structure; less frame, more fabric; direct fixing; very simple orientation adjustment with quick access; conforms to EN13561. Learn-more links to a pro-access page (login required). Video: https://youtu.be/7v_FCZxQIzg. (Bullets shown in French on the English page.)', 'https://www.mitjavila.com/our-products/traditional-awnings/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.supplier_products (supplier_id, name, item_code, category, specs, source_url)
select id, 'Monobloc 5000 (M5000)', 'M5000', 'Exterior - Traditional awnings', 'Very, very large coverage (for professionals only); protective canopy available; conforms to EN13561; extruded aluminium profile and aluminium parts; not equipped with Clever Arm (exception noted on Cassette compacts page).', 'https://www.mitjavila.com/our-products/traditional-awnings/?lang=en' from public.suppliers where name = 'Mitjavila'
on conflict (supplier_id, name) do update set item_code = excluded.item_code, specs = excluded.specs;
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Cassette 235', 138, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-cassette-235.jpg', 'Integral box awning up to 6 m wide with 3.5 m projection, optional LED lighting in the cassette. Manual or motorised.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Cassette 235');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: C235'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Cassette 235'
where sp.name = 'Cassette 235 (C235, integral box awning with LED)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Cassette 135', 138, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-cassette-135.jpg', 'Our best-selling self-supporting cassette awning — up to 5.98 m wide, 3.5 m projection, motorised with quick-release fasteners.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Cassette 135');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: C125-C135'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Cassette 135'
where sp.name = 'Cassettes 125 - 135 (C135 motorised awning, best seller)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Cassette 260', 138, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-cassette-260.jpg', 'Large cassette awning to 6 m wide and 3.5 m projection with 3–30 degree tilt adjustment.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Cassette 260');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: C260'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Cassette 260'
where sp.name = 'Cassette 260 (C260 large awning)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Cassette 262', 138, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-cassette-262.jpg', 'Motorised aluminium cassette awning up to 7.15 m wide with obstacle-detection drive options.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Cassette 262');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: C262'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Cassette 262'
where sp.name = 'Cassette 262 (C262 aluminium awning)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Cassette 220', 138, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-cassette-220.jpg', 'A perfectly square 22 x 22 cm cassette — modern, minimal, motorised, with optional integrated LED.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Cassette 220');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: C220'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Cassette 220'
where sp.name = 'Cassette 220 (C220 modern retractable awning)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Suspension 250/275', 118, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-suspension-250-275.jpg', 'Cassette awnings engineered for timber-frame walls — up to 6 m wide with 3 m projection.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Suspension 250/275');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: C250/C275'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Suspension 250/275'
where sp.name = 'Cassettes 250 and 275 - Suspension series (wood frame house)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Traditional Awnings', 'Loggia 112', 118, 0, 0, 0, '{"white"}', false, '/images/catalog/awnings/p-loggia-112.jpg', 'Traditional awning in cast aluminium — up to 4.8 m wide, 3 m projection, 0–90 degree tilt.', ac.id
from public.awning_categories ac where ac.name = 'Traditional Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Traditional Awnings' and ap.model = 'Loggia 112');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: L112'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Traditional Awnings' and ap.model = 'Loggia 112'
where sp.name = 'Loggia 112 (L112 traditional awning)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Cassette Awnings', 'Loggia 125', 118, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-loggia-125.jpg', 'Compact half-cassette awning to 4.8 m wide and 3 m projection; vertical drop configurations possible.', ac.id
from public.awning_categories ac where ac.name = 'Cassette Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Cassette Awnings' and ap.model = 'Loggia 125');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: L125'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Cassette Awnings' and ap.model = 'Loggia 125'
where sp.name = 'Loggia 125 (L125)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Window Awnings', 'Projection Window Awning', 59, 0, 0, 0, '{"white"}', false, '/images/catalog/awnings/p-projection-window-awning.jpg', 'Spring-loaded projection awning for windows — up to 4.8 m wide, 1.5 m projection, tilts to 160 degrees.', ac.id
from public.awning_categories ac where ac.name = 'Window Awnings'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Window Awnings' and ap.model = 'Projection Window Awning');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: ES150/SU16'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Window Awnings' and ap.model = 'Projection Window Awning'
where sp.name = 'Projection awning (spring-loaded single projection / Italian window awning)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);
insert into public.awning_products (make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours, is_active, image_url, description, category_id)
select 'Exterior Screens', 'Zip Box Screen', 98, 0, 0, 0, '{"white","anthracite"}', false, '/images/catalog/awnings/p-zip-box-screen.jpg', 'Vertical box screen with zip-guided fabric — wind-stable shading and insect-free ventilation for large openings.', ac.id
from public.awning_categories ac where ac.name = 'Exterior Screens'
  and not exists (select 1 from public.awning_products ap where ap.make = 'Exterior Screens' and ap.model = 'Zip Box Screen');
insert into public.supplier_links (supplier_product_id, awning_product_id, notes)
select sp.id, ap.id, 'Model code: 105/115'
from public.supplier_products sp
join public.suppliers su on su.id = sp.supplier_id and su.name = 'Mitjavila'
join public.awning_products ap on ap.make = 'Exterior Screens' and ap.model = 'Zip Box Screen'
where sp.name = 'Vertical box screen / sliding cassette 105-115 (Screen ZIP)'
  and not exists (select 1 from public.supplier_links l where l.supplier_product_id = sp.id and l.awning_product_id = ap.id);

-- ------------------------------------------------------------
-- 8. Verify seed counts before commit.
-- ------------------------------------------------------------
do $$
declare
  n_styles int; n_colours int; n_links int; n_sp int; n_cats int; n_awn int;
begin
  select count(*) into n_styles from public.blind_styles where is_active and name not like 'T\_%';
  select count(*) into n_colours from public.blind_colours where is_active and name not like 'T\_%';
  select count(*) into n_links from public.supplier_links;
  select count(*) into n_sp from public.supplier_products;
  select count(*) into n_cats from public.awning_categories;
  select count(*) into n_awn from public.awning_products;
  raise notice 'active real styles=%, active real colours=%, supplier_products=%, links=%, awning_categories=%, awning_products=%',
    n_styles, n_colours, n_sp, n_links, n_cats, n_awn;
  if n_styles < 40 then raise exception 'expected >=40 active styles, got %', n_styles; end if;
  if n_colours < 210 then raise exception 'expected >=210 active colours, got %', n_colours; end if;
  if n_cats <> 5 then raise exception 'expected 5 awning categories, got %', n_cats; end if;
end $$;
