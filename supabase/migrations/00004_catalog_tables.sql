-- ============================================================
-- Catalog tables for shade types, styles, and colours
-- ============================================================
-- These become the canonical, admin-managed vocabulary for
-- product attributes. Products continue to store their selections
-- as text arrays (shade_types[], styles[], colours[]) but the
-- admin UI only allows picking from these tables to prevent
-- typos from creating duplicate categories.
-- ============================================================

CREATE TABLE public.shade_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.styles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.colours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Seed from existing products (preserve current vocabulary)
-- ============================================================
INSERT INTO public.shade_types (name)
SELECT DISTINCT unnest(shade_types) FROM public.products
WHERE shade_types IS NOT NULL AND array_length(shade_types, 1) > 0
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.styles (name)
SELECT DISTINCT unnest(styles) FROM public.products
WHERE styles IS NOT NULL AND array_length(styles, 1) > 0
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.colours (name)
SELECT DISTINCT unnest(colours) FROM public.products
WHERE colours IS NOT NULL AND array_length(colours, 1) > 0
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.shade_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colours ENABLE ROW LEVEL SECURITY;

-- Read policies: all authenticated users
CREATE POLICY "shade_types_select_auth" ON public.shade_types
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "styles_select_auth" ON public.styles
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "colours_select_auth" ON public.colours
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Write policies: admin only
CREATE POLICY "shade_types_insert_admin" ON public.shade_types
  FOR INSERT WITH CHECK (public.get_user_role() = 'administrator');
CREATE POLICY "shade_types_update_admin" ON public.shade_types
  FOR UPDATE USING (public.get_user_role() = 'administrator');
CREATE POLICY "shade_types_delete_admin" ON public.shade_types
  FOR DELETE USING (public.get_user_role() = 'administrator');

CREATE POLICY "styles_insert_admin" ON public.styles
  FOR INSERT WITH CHECK (public.get_user_role() = 'administrator');
CREATE POLICY "styles_update_admin" ON public.styles
  FOR UPDATE USING (public.get_user_role() = 'administrator');
CREATE POLICY "styles_delete_admin" ON public.styles
  FOR DELETE USING (public.get_user_role() = 'administrator');

CREATE POLICY "colours_insert_admin" ON public.colours
  FOR INSERT WITH CHECK (public.get_user_role() = 'administrator');
CREATE POLICY "colours_update_admin" ON public.colours
  FOR UPDATE USING (public.get_user_role() = 'administrator');
CREATE POLICY "colours_delete_admin" ON public.colours
  FOR DELETE USING (public.get_user_role() = 'administrator');
