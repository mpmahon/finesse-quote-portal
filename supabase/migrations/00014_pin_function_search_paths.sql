-- ============================================================
-- Pin search_path on SECURITY DEFINER / trigger functions
-- (Supabase security advisor 0011_function_search_path_mutable).
-- ============================================================

alter function public.set_updated_at() set search_path = public;
alter function public.get_user_role() set search_path = public;
