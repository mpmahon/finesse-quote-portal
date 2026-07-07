-- ============================================================
-- WS3: catalog enrichment (design doc v2 §8.4).
--
-- Ports the branded catalog from the old build
-- (Finesse_Old/Finesse_Portal_20250722 … 02-products.sql) into the
-- current schema: 6 additional blind products with full component
-- blueprints, 2 Sunbrella awning products, and the catalog vocabulary
-- (shade types / styles / colours with swatch hexes) they reference.
-- Fixed UUIDs + ON CONFLICT DO NOTHING make this idempotent.
-- Prices are supplier-cost USD in the same range as the existing seed.
-- ============================================================

-- Catalog vocabulary -----------------------------------------------------
insert into public.shade_types (name) values
  ('translucent'), ('room darkening'), ('solar')
on conflict (name) do nothing;

insert into public.styles (name) values
  ('silhouette'), ('horizontal slats'), ('cordless'), ('textured'),
  ('economy'), ('luxury'), ('striped'), ('solid')
on conflict (name) do nothing;

insert into public.colours (name, hex_code) values
  ('pearl white', '#f4f1ea'),
  ('natural linen', '#e8dcc8'),
  ('alabaster', '#f0ebe0'),
  ('natural', '#d9c8a9'),
  ('cherry', '#6e2f1e'),
  ('graphite', '#4b5563'),
  ('platinum', '#d8d8dc'),
  ('gold', '#c9a54a'),
  ('forest green', '#2d5a3d'),
  ('navy blue', '#1e3a5f'),
  ('burgundy', '#6d2233'),
  ('red/white', '#c0392b'),
  ('green/white', '#3d8a5f'),
  ('blue/white', '#3b6ea0'),
  ('espresso', '#4a3226'),
  ('slate', '#64748b'),
  ('champagne', '#e8d5b5'),
  ('snow', '#fbfbfb'),
  ('ivory', '#f5f0e1'),
  ('sand dollar', '#dccfb4'),
  ('cocoa', '#5b4334')
on conflict (name) do nothing;

-- Backfill hexes for pre-existing colour rows that still lack one.
update public.colours set hex_code = v.hex
from (values
  ('espresso', '#4a3226'), ('slate', '#64748b'), ('champagne', '#e8d5b5'),
  ('snow', '#fbfbfb'), ('ivory', '#f5f0e1'), ('alabaster', '#f0ebe0'),
  ('pewter', '#8e9196'), ('onyx', '#1f2125'), ('sand', '#d6c29a'),
  ('sky blue', '#8fc1e3'), ('graphite', '#4b5563'), ('taupe', '#b7a68e')
) as v(name, hex)
where lower(public.colours.name) = v.name and public.colours.hex_code is null;

-- Blind products ----------------------------------------------------------
insert into public.products (id, make, model, shade_types, styles, colours) values
  ('a1000000-0000-0000-0000-000000000005', 'Luxaflex', 'Silhouette',
   '{"light filtering","translucent"}',
   '{"silhouette","premium"}',
   '{"pearl white","cream","natural linen","charcoal"}'),
  ('a1000000-0000-0000-0000-000000000006', 'Norman', 'Woodlore',
   '{"room darkening","blackout"}',
   '{"horizontal slats","cordless"}',
   '{"white","alabaster","natural","cherry"}'),
  ('a1000000-0000-0000-0000-000000000007', 'Levolor', 'Fabric Roller',
   '{"light filtering","blackout"}',
   '{"standard","textured"}',
   '{"white","beige","graphite"}'),
  ('a1000000-0000-0000-0000-000000000008', 'Graber', 'Commercial Blackout',
   '{"solar","blackout"}',
   '{"standard","motorized"}',
   '{"white","grey"}'),
  ('a1000000-0000-0000-0000-000000000009', 'Finesse', 'Budget Roller',
   '{"light filtering"}',
   '{"economy"}',
   '{"white","beige"}'),
  ('a1000000-0000-0000-0000-000000000010', 'Finesse', 'Premium Plus',
   '{"light filtering","room darkening"}',
   '{"luxury","premium"}',
   '{"platinum","gold"}')
on conflict (id) do nothing;

-- Component blueprints (same structure as the original four products;
-- prices scaled by tier: budget < standard < premium < luxury).
insert into public.components (product_id, name, unit, usd_price)
select * from (values
  -- Luxaflex Silhouette (premium)
  ('a1000000-0000-0000-0000-000000000005'::uuid, 'cassette',            'per_inch'::unit_type,    0.2604),
  ('a1000000-0000-0000-0000-000000000005', 'cassette_insert',     'per_inch',    0.0060),
  ('a1000000-0000-0000-0000-000000000005', 'tube',                'per_inch',    0.1521),
  ('a1000000-0000-0000-0000-000000000005', 'bottom_rail',         'per_inch',    0.1083),
  ('a1000000-0000-0000-0000-000000000005', 'bottom_rail_insert',  'per_inch',    0.0521),
  ('a1000000-0000-0000-0000-000000000005', 'adhesive_bottom_rail','per_inch',    0.0260),
  ('a1000000-0000-0000-0000-000000000005', 'chain',               'per_inch',    0.0521),
  ('a1000000-0000-0000-0000-000000000005', 'fabric',              'per_sq_inch', 0.0059),
  ('a1000000-0000-0000-0000-000000000005', 'adapters',            'fixed',       2.25),
  ('a1000000-0000-0000-0000-000000000005', 'brackets',            'fixed',       2.75),
  ('a1000000-0000-0000-0000-000000000005', 'end_caps',            'fixed',       0.80),
  -- Norman Woodlore (standard)
  ('a1000000-0000-0000-0000-000000000006', 'cassette',            'per_inch',    0.2188),
  ('a1000000-0000-0000-0000-000000000006', 'tube',                'per_inch',    0.1271),
  ('a1000000-0000-0000-0000-000000000006', 'bottom_rail',         'per_inch',    0.0875),
  ('a1000000-0000-0000-0000-000000000006', 'chain',               'per_inch',    0.0438),
  ('a1000000-0000-0000-0000-000000000006', 'fabric',              'per_sq_inch', 0.0054),
  ('a1000000-0000-0000-0000-000000000006', 'adapters',            'fixed',       1.60),
  ('a1000000-0000-0000-0000-000000000006', 'brackets',            'fixed',       2.10),
  ('a1000000-0000-0000-0000-000000000006', 'end_caps',            'fixed',       0.55),
  -- Levolor Fabric Roller (standard)
  ('a1000000-0000-0000-0000-000000000007', 'cassette',            'per_inch',    0.2000),
  ('a1000000-0000-0000-0000-000000000007', 'tube',                'per_inch',    0.1208),
  ('a1000000-0000-0000-0000-000000000007', 'bottom_rail',         'per_inch',    0.0792),
  ('a1000000-0000-0000-0000-000000000007', 'chain',               'per_inch',    0.0396),
  ('a1000000-0000-0000-0000-000000000007', 'fabric',              'per_sq_inch', 0.0045),
  ('a1000000-0000-0000-0000-000000000007', 'adapters',            'fixed',       1.40),
  ('a1000000-0000-0000-0000-000000000007', 'brackets',            'fixed',       1.90),
  ('a1000000-0000-0000-0000-000000000007', 'end_caps',            'fixed',       0.50),
  -- Graber Commercial Blackout (heavy duty)
  ('a1000000-0000-0000-0000-000000000008', 'cassette',            'per_inch',    0.2396),
  ('a1000000-0000-0000-0000-000000000008', 'tube',                'per_inch',    0.1396),
  ('a1000000-0000-0000-0000-000000000008', 'bottom_rail',         'per_inch',    0.0958),
  ('a1000000-0000-0000-0000-000000000008', 'chain',               'per_inch',    0.0479),
  ('a1000000-0000-0000-0000-000000000008', 'fabric',              'per_sq_inch', 0.0128),
  ('a1000000-0000-0000-0000-000000000008', 'adapters',            'fixed',       2.50),
  ('a1000000-0000-0000-0000-000000000008', 'brackets',            'fixed',       3.20),
  ('a1000000-0000-0000-0000-000000000008', 'end_caps',            'fixed',       0.90),
  -- Finesse Budget Roller (economy)
  ('a1000000-0000-0000-0000-000000000009', 'cassette',            'per_inch',    0.1500),
  ('a1000000-0000-0000-0000-000000000009', 'tube',                'per_inch',    0.0958),
  ('a1000000-0000-0000-0000-000000000009', 'bottom_rail',         'per_inch',    0.0625),
  ('a1000000-0000-0000-0000-000000000009', 'chain',               'per_inch',    0.0313),
  ('a1000000-0000-0000-0000-000000000009', 'fabric',              'per_sq_inch', 0.0031),
  ('a1000000-0000-0000-0000-000000000009', 'adapters',            'fixed',       1.00),
  ('a1000000-0000-0000-0000-000000000009', 'brackets',            'fixed',       1.40),
  ('a1000000-0000-0000-0000-000000000009', 'end_caps',            'fixed',       0.35),
  -- Finesse Premium Plus (luxury)
  ('a1000000-0000-0000-0000-000000000010', 'cassette',            'per_inch',    0.2917),
  ('a1000000-0000-0000-0000-000000000010', 'cassette_insert',     'per_inch',    0.0071),
  ('a1000000-0000-0000-0000-000000000010', 'tube',                'per_inch',    0.1667),
  ('a1000000-0000-0000-0000-000000000010', 'bottom_rail',         'per_inch',    0.1188),
  ('a1000000-0000-0000-0000-000000000010', 'bottom_rail_insert',  'per_inch',    0.0583),
  ('a1000000-0000-0000-0000-000000000010', 'adhesive_bottom_rail','per_inch',    0.0292),
  ('a1000000-0000-0000-0000-000000000010', 'chain',               'per_inch',    0.0583),
  ('a1000000-0000-0000-0000-000000000010', 'fabric',              'per_sq_inch', 0.0170),
  ('a1000000-0000-0000-0000-000000000010', 'adapters',            'fixed',       2.80),
  ('a1000000-0000-0000-0000-000000000010', 'brackets',            'fixed',       3.50),
  ('a1000000-0000-0000-0000-000000000010', 'end_caps',            'fixed',       1.10)
) as v(product_id, name, unit, usd_price)
where not exists (
  select 1 from public.components c
  where c.product_id = v.product_id and c.name = v.name
);

-- Awning products (Sunbrella, from the old build's awning catalog) --------
insert into public.awning_products
  (id, make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours) values
  ('b1000000-0000-0000-0000-000000000004', 'Sunbrella', 'Canvas Classic', 36,
   1.35, 0.0108, 55.00,
   '{"natural","forest green","navy blue","burgundy"}'),
  ('b1000000-0000-0000-0000-000000000005', 'Sunbrella', 'Stripe Series', 42,
   1.55, 0.0135, 62.00,
   '{"red/white","green/white","blue/white"}')
on conflict (id) do nothing;
