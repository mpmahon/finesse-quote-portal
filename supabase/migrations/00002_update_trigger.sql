-- ============================================================
-- Update handle_new_user trigger to capture contact_number
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, last_name, email, contact_number, role)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'first_name', ''),
    coalesce(new.raw_user_meta_data->>'last_name', ''),
    coalesce(new.email, ''),
    NULLIF(new.raw_user_meta_data->>'contact_number', ''),
    coalesce(
      NULLIF(new.raw_user_meta_data->>'role', '')::user_role,
      'customer'
    )
  );
  RETURN new;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;
