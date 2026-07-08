-- ============================================================
-- Batch 6 (WS-B): window description field + "Undecided" mount type.
--
-- 1. `windows.description` — optional free-text field for window-specific
--    notes (e.g. "faces the pool, arched top"), shown alongside the window
--    name on the room/window views.
-- 2. `mount_type` enum gains a third value, 'undecided', for salespeople who
--    haven't decided inside vs. outside mount yet. The application treats
--    'undecided' as outside-mount for dimension/costing purposes (the
--    `calculateBlindDimensions` branch in quote-engine.ts only special-cases
--    'inside'; anything else — including 'undecided' — already falls through
--    to the outside-mount formula, so no engine change is required) and
--    renders a muted "mount TBD" note wherever mount type is displayed.
-- 3. Default mount_type changed from 'inside' to 'outside' per client
--    request — most jobs are outside mount and salespeople want that as
--    the starting point, correcting to inside only when needed.
--
-- Single file: nothing in this migration writes a row using the new enum
-- value, so there's no same-transaction USE-before-COMMIT problem (unlike
-- the 00007/00008 pair, which backfilled data with the new value).
-- ============================================================

alter table public.windows
  add column if not exists description text;

alter type public.mount_type add value if not exists 'undecided';

alter table public.windows
  alter column mount_type set default 'outside';
