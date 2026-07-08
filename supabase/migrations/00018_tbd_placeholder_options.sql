-- ============================================================
-- TBD placeholders (Mark, 2026-07-07): every hierarchy node whose children
-- are still TBD gets ONE clearly-temporary child, prefixed "T_", so the
-- full Type -> Opacity -> Style -> Colour chain can be completed and
-- tested end-to-end before Mike enters the real data. These are meant to
-- be renamed/replaced in Blind Management — the T_ prefix makes them easy
-- to spot (and to audit for leftovers later: `select * from blind_styles
-- where name like 'T\_%' escape '\'`).
--
-- 1. One "T_Standard" style under every opacity that has no styles
--    (Sliding Panel x4, Roller Shade x4, Neolux Shade x2 = 10 rows).
-- 2. One "T_White" colour (neutral #F5F5F5 swatch) under every style that
--    has no colours — the 12 real seeded styles plus the 10 placeholder
--    styles above (= 22 rows).
-- Valances need nothing: every Type already has real options.
--
-- sort_order 999 keeps placeholders below any real entries added later.
-- Guarded with NOT EXISTS so a re-run cannot duplicate.
-- ============================================================

insert into public.blind_styles (opacity_id, name, sort_order)
select o.id, 'T_Standard', 999
from public.blind_opacities o
where not exists (
  select 1 from public.blind_styles s where s.opacity_id = o.id
);

insert into public.blind_colours (style_id, name, hex_code, sort_order)
select s.id, 'T_White', '#F5F5F5', 999
from public.blind_styles s
where not exists (
  select 1 from public.blind_colours c where c.style_id = s.id
);

-- Verify: no opacity without a style, no style without a colour.
do $$
declare
  styleless_opacities int;
  colourless_styles   int;
begin
  select count(*) into styleless_opacities
  from public.blind_opacities o
  where not exists (select 1 from public.blind_styles s where s.opacity_id = o.id);

  select count(*) into colourless_styles
  from public.blind_styles s
  where not exists (select 1 from public.blind_colours c where c.style_id = s.id);

  if styleless_opacities <> 0 then
    raise exception 'placeholder seed left % opacities without styles', styleless_opacities;
  end if;
  if colourless_styles <> 0 then
    raise exception 'placeholder seed left % styles without colours', colourless_styles;
  end if;
end $$;
