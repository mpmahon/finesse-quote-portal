-- ============================================================
-- Awning products with fixed depth, frame, and material costs
-- ============================================================
-- Awning pricing is simpler than blinds:
--   - Frame cost = frame_unit_price_usd * awning_width
--   - Material cost = material_unit_price_usd * (awning_width * depth)
--   - Fixed cost = brackets / arms / motor (flat per unit)
--   - Awning width adds 6" to window width (overhang)
--   - Depth is fixed per model (no user input)
-- ============================================================

CREATE TABLE public.awning_products (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  make                      text NOT NULL,
  model                     text NOT NULL,
  depth_inches              numeric(8,2) NOT NULL,
  frame_unit_price_usd      numeric(10,4) NOT NULL,
  material_unit_price_usd   numeric(10,4) NOT NULL,
  fixed_cost_usd            numeric(10,2) NOT NULL DEFAULT 0,
  colours                   text[] NOT NULL DEFAULT '{}',
  is_active                 boolean NOT NULL DEFAULT true,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Windows can have an awning configuration alongside an optional blind
ALTER TABLE public.windows
  ADD COLUMN awning_product_id uuid REFERENCES public.awning_products(id),
  ADD COLUMN awning_colour     text;

-- Line items get a type discriminator; the existing blind-shaped columns
-- are reused for awning rows (width/height store awning width/depth, etc.)
ALTER TABLE public.quote_line_items
  ADD COLUMN line_type          text NOT NULL DEFAULT 'blind',
  ADD COLUMN awning_product_id  uuid REFERENCES public.awning_products(id);

-- Constraint: line_type is one of a known set
ALTER TABLE public.quote_line_items
  ADD CONSTRAINT line_type_valid CHECK (line_type IN ('blind', 'awning', 'zero'));

-- ============================================================
-- Row Level Security (same pattern as products)
-- ============================================================
ALTER TABLE public.awning_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "awning_products_select_auth" ON public.awning_products
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "awning_products_insert_admin" ON public.awning_products
  FOR INSERT WITH CHECK (public.get_user_role() = 'administrator');
CREATE POLICY "awning_products_update_admin" ON public.awning_products
  FOR UPDATE USING (public.get_user_role() = 'administrator');
CREATE POLICY "awning_products_delete_admin" ON public.awning_products
  FOR DELETE USING (public.get_user_role() = 'administrator');

-- ============================================================
-- Seed a few sample awning products
-- ============================================================
INSERT INTO public.awning_products (id, make, model, depth_inches, frame_unit_price_usd, material_unit_price_usd, fixed_cost_usd, colours) VALUES
  ('b1000000-0000-0000-0000-000000000001', 'SunSetter', 'Motorized XL', 48, 0.85, 0.0065, 180.00,
   '{"beige","forest green","burgundy","navy","charcoal"}'),
  ('b1000000-0000-0000-0000-000000000002', 'Aleko', 'Retractable Standard', 36, 0.55, 0.0045, 95.00,
   '{"ivory","sand","grey","red stripe","blue stripe"}'),
  ('b1000000-0000-0000-0000-000000000003', 'Markilux', 'Cassette 930', 60, 1.25, 0.0095, 280.00,
   '{"white","silver","bronze","black","terracotta"}');
