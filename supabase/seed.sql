-- ============================================================
-- Finesse Quote Portal - Seed Data
-- ============================================================

-- Products: 4 blind makes/models
insert into public.products (id, make, model, shade_types, styles, colours) values
  ('a1000000-0000-0000-0000-000000000001', 'Luxaflex', 'Roller',
   '{"light filtering","blackout","sunscreen"}',
   '{"standard","premium"}',
   '{"white","cream","grey","charcoal","navy"}'),
  ('a1000000-0000-0000-0000-000000000002', 'Hunter Douglas', 'Duette',
   '{"light filtering","blackout","semi-opaque"}',
   '{"architella","duolite","standard"}',
   '{"snow","linen","espresso","slate","champagne"}'),
  ('a1000000-0000-0000-0000-000000000003', 'Norman', 'Soluna',
   '{"light filtering","room darkening"}',
   '{"top-down","bottom-up","cordless"}',
   '{"white","ivory","taupe","graphite"}'),
  ('a1000000-0000-0000-0000-000000000004', 'Graber', 'Roller',
   '{"solar","blackout","light filtering"}',
   '{"standard","motorized"}',
   '{"alabaster","pewter","onyx","sand","sky blue"}');

-- Components for Luxaflex Roller
insert into public.components (product_id, name, unit, usd_price) values
  ('a1000000-0000-0000-0000-000000000001', 'cassette',           'per_inch',    0.2083),
  ('a1000000-0000-0000-0000-000000000001', 'cassette_insert',    'per_inch',    0.0048),
  ('a1000000-0000-0000-0000-000000000001', 'tube',               'per_inch',    0.1250),
  ('a1000000-0000-0000-0000-000000000001', 'bottom_rail',        'per_inch',    0.0833),
  ('a1000000-0000-0000-0000-000000000001', 'bottom_rail_insert', 'per_inch',    0.0417),
  ('a1000000-0000-0000-0000-000000000001', 'adhesive_bottom_rail','per_inch',   0.0208),
  ('a1000000-0000-0000-0000-000000000001', 'chain',              'per_inch',    0.0417),
  ('a1000000-0000-0000-0000-000000000001', 'fabric',             'per_sq_inch', 0.0035),
  ('a1000000-0000-0000-0000-000000000001', 'adapters',           'fixed',       1.50),
  ('a1000000-0000-0000-0000-000000000001', 'brackets',           'fixed',       2.00),
  ('a1000000-0000-0000-0000-000000000001', 'end_caps',           'fixed',       0.50);

-- Components for Hunter Douglas Duette
insert into public.components (product_id, name, unit, usd_price) values
  ('a1000000-0000-0000-0000-000000000002', 'cassette',           'per_inch',    0.2500),
  ('a1000000-0000-0000-0000-000000000002', 'cassette_insert',    'per_inch',    0.0058),
  ('a1000000-0000-0000-0000-000000000002', 'tube',               'per_inch',    0.1458),
  ('a1000000-0000-0000-0000-000000000002', 'bottom_rail',        'per_inch',    0.1042),
  ('a1000000-0000-0000-0000-000000000002', 'bottom_rail_insert', 'per_inch',    0.0500),
  ('a1000000-0000-0000-0000-000000000002', 'adhesive_bottom_rail','per_inch',   0.0250),
  ('a1000000-0000-0000-0000-000000000002', 'chain',              'per_inch',    0.0500),
  ('a1000000-0000-0000-0000-000000000002', 'fabric',             'per_sq_inch', 0.0042),
  ('a1000000-0000-0000-0000-000000000002', 'adapters',           'fixed',       2.00),
  ('a1000000-0000-0000-0000-000000000002', 'brackets',           'fixed',       2.50),
  ('a1000000-0000-0000-0000-000000000002', 'end_caps',           'fixed',       0.75);

-- Components for Norman Soluna
insert into public.components (product_id, name, unit, usd_price) values
  ('a1000000-0000-0000-0000-000000000003', 'cassette',           'per_inch',    0.2292),
  ('a1000000-0000-0000-0000-000000000003', 'tube',               'per_inch',    0.1333),
  ('a1000000-0000-0000-0000-000000000003', 'bottom_rail',        'per_inch',    0.0917),
  ('a1000000-0000-0000-0000-000000000003', 'chain',              'per_inch',    0.0458),
  ('a1000000-0000-0000-0000-000000000003', 'fabric',             'per_sq_inch', 0.0038),
  ('a1000000-0000-0000-0000-000000000003', 'adapters',           'fixed',       1.75),
  ('a1000000-0000-0000-0000-000000000003', 'brackets',           'fixed',       2.25),
  ('a1000000-0000-0000-0000-000000000003', 'end_caps',           'fixed',       0.60);

-- Components for Graber Roller
insert into public.components (product_id, name, unit, usd_price) values
  ('a1000000-0000-0000-0000-000000000004', 'cassette',           'per_inch',    0.1917),
  ('a1000000-0000-0000-0000-000000000004', 'tube',               'per_inch',    0.1167),
  ('a1000000-0000-0000-0000-000000000004', 'bottom_rail',        'per_inch',    0.0750),
  ('a1000000-0000-0000-0000-000000000004', 'chain',              'per_inch',    0.0375),
  ('a1000000-0000-0000-0000-000000000004', 'fabric',             'per_sq_inch', 0.0032),
  ('a1000000-0000-0000-0000-000000000004', 'adapters',           'fixed',       1.25),
  ('a1000000-0000-0000-0000-000000000004', 'brackets',           'fixed',       1.75),
  ('a1000000-0000-0000-0000-000000000004', 'end_caps',           'fixed',       0.45);
