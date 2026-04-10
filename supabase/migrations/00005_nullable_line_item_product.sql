-- ============================================================
-- Allow quote line items with no product (zero-cost windows)
-- ============================================================
-- Windows where both has_blind and has_awning are false are
-- included in quotes as zero-cost line items (used by salesmen
-- to track potential future business). These rows have no
-- product_id.
-- ============================================================

ALTER TABLE public.quote_line_items
  ALTER COLUMN product_id DROP NOT NULL;
