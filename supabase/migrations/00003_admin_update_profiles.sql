-- ============================================================
-- Allow administrators to update other users' profiles
-- ============================================================

CREATE POLICY "profiles_update_admin"
  ON public.profiles
  FOR UPDATE
  USING (public.get_user_role() = 'administrator')
  WITH CHECK (public.get_user_role() = 'administrator');
