import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  BlindType,
  BlindOpacity,
  BlindStyle,
  BlindColour,
  BlindValance,
  BlindStyleComponent,
} from '@/types/database'

/**
 * The full blind option hierarchy (Batch 7): five flat, already-sorted
 * arrays, plus the pricing rows per style (Batch 11 Part 1 — blind pricing
 * moved from `products`/`components` to `blind_styles`). Use the `*for*`
 * helpers below to walk parent -> children rather than re-filtering inline.
 */
export interface BlindHierarchy {
  types: BlindType[]
  opacities: BlindOpacity[]
  styles: BlindStyle[]
  colours: BlindColour[]
  valances: BlindValance[]
  /** Pricing rows for every style, unfiltered (there's no active flag on pricing rows — a style's own `is_active` already governs selectability). */
  styleComponents: BlindStyleComponent[]
}

/**
 * Fetches the complete blind option hierarchy via six parallel selects
 * (five hierarchy levels + style pricing), each ordered by `sort_order` then
 * `name` (the seed's document order).
 *
 * @param supabase - Either the server or browser Supabase client; RLS
 *   (read-authenticated, write-administrator) governs access either way.
 * @param options.activeOnly - `true` (default) excludes deactivated nodes —
 *   use this for customer/salesperson-facing selection UI, where a
 *   retired option should never be choosable on a new window. Pass `false`
 *   in the Blind Management admin screen, and for server-side pricing
 *   resolution of ALREADY-SAVED windows (quote generation, estimates,
 *   staleness), so a since-deactivated style still resolves correctly.
 */
export async function fetchBlindHierarchy(
  supabase: SupabaseClient,
  { activeOnly = true }: { activeOnly?: boolean } = {}
): Promise<BlindHierarchy> {
  const typesQuery = supabase.from('blind_types').select('*').order('sort_order').order('name')
  const opacitiesQuery = supabase.from('blind_opacities').select('*').order('sort_order').order('name')
  const stylesQuery = supabase.from('blind_styles').select('*').order('sort_order').order('name')
  const coloursQuery = supabase.from('blind_colours').select('*').order('sort_order').order('name')
  const valancesQuery = supabase.from('blind_valances').select('*').order('sort_order').order('name')
  const styleComponentsQuery = supabase.from('blind_style_components').select('*')

  const [types, opacities, styles, colours, valances, styleComponents] = await Promise.all([
    activeOnly ? typesQuery.eq('is_active', true) : typesQuery,
    activeOnly ? opacitiesQuery.eq('is_active', true) : opacitiesQuery,
    activeOnly ? stylesQuery.eq('is_active', true) : stylesQuery,
    activeOnly ? coloursQuery.eq('is_active', true) : coloursQuery,
    activeOnly ? valancesQuery.eq('is_active', true) : valancesQuery,
    styleComponentsQuery,
  ])

  return {
    types: (types.data ?? []) as BlindType[],
    opacities: (opacities.data ?? []) as BlindOpacity[],
    styles: (styles.data ?? []) as BlindStyle[],
    colours: (colours.data ?? []) as BlindColour[],
    valances: (valances.data ?? []) as BlindValance[],
    styleComponents: (styleComponents.data ?? []) as BlindStyleComponent[],
  }
}

/** All Opacities belonging to the given Type id, in seed/sort order. */
export function opacitiesForType(hierarchy: BlindHierarchy, typeId: string | null | undefined): BlindOpacity[] {
  if (!typeId) return []
  return hierarchy.opacities.filter(o => o.type_id === typeId)
}

/** All Styles belonging to the given Opacity id, in seed/sort order. */
export function stylesForOpacity(hierarchy: BlindHierarchy, opacityId: string | null | undefined): BlindStyle[] {
  if (!opacityId) return []
  return hierarchy.styles.filter(s => s.opacity_id === opacityId)
}

/** All Colours belonging to the given Style id, in seed/sort order. */
export function coloursForStyle(hierarchy: BlindHierarchy, styleId: string | null | undefined): BlindColour[] {
  if (!styleId) return []
  return hierarchy.colours.filter(c => c.style_id === styleId)
}

/** All Valance/Finisher options belonging to the given Type id, in seed/sort order. */
export function valancesForType(hierarchy: BlindHierarchy, typeId: string | null | undefined): BlindValance[] {
  if (!typeId) return []
  return hierarchy.valances.filter(v => v.type_id === typeId)
}

/** All pricing component rows belonging to the given Style id — the blind's cost source (Batch 11 Part 1, replacing per-product components). */
export function componentsForStyle(hierarchy: BlindHierarchy, styleId: string | null | undefined): BlindStyleComponent[] {
  if (!styleId) return []
  return hierarchy.styleComponents.filter(c => c.style_id === styleId)
}

/** Finds a Type by name (case-sensitive — names are stored exactly as seeded/entered). Used to resolve a stored `windows.shade_type` string back to its hierarchy node. */
export function findTypeByName(hierarchy: BlindHierarchy, name: string | null | undefined): BlindType | null {
  if (!name) return null
  return hierarchy.types.find(t => t.name === name) ?? null
}

/** Finds an Opacity by name within a given Type id. */
export function findOpacityByName(
  hierarchy: BlindHierarchy,
  typeId: string | null | undefined,
  name: string | null | undefined
): BlindOpacity | null {
  if (!typeId || !name) return null
  return opacitiesForType(hierarchy, typeId).find(o => o.name === name) ?? null
}

/** Finds a Style by name within a given Opacity id. */
export function findStyleByName(
  hierarchy: BlindHierarchy,
  opacityId: string | null | undefined,
  name: string | null | undefined
): BlindStyle | null {
  if (!opacityId || !name) return null
  return stylesForOpacity(hierarchy, opacityId).find(s => s.name === name) ?? null
}

/** Finds a Colour by name within a given Style id. */
export function findColourByName(
  hierarchy: BlindHierarchy,
  styleId: string | null | undefined,
  name: string | null | undefined
): BlindColour | null {
  if (!styleId || !name) return null
  return coloursForStyle(hierarchy, styleId).find(c => c.name === name) ?? null
}

/** Finds a Valance option by name within a given Type id. */
export function findValanceByName(
  hierarchy: BlindHierarchy,
  typeId: string | null | undefined,
  name: string | null | undefined
): BlindValance | null {
  if (!typeId || !name) return null
  return valancesForType(hierarchy, typeId).find(v => v.name === name) ?? null
}

/**
 * Resolves a window/quote-line-item's stored hierarchy NAME snapshot
 * (Type/Opacity/Style) back to the Style's id, for server-side pricing
 * consumers (quote generation, estimates, staleness) that only have the
 * text snapshot rather than live cascading UI state — mirrors the same
 * top-down name-walk the configurator uses to pre-fill an existing
 * window's selection. Returns null if any link in the chain doesn't
 * resolve (a since-renamed/deleted node, or a pre-Batch-7 window still
 * using the old flat vocabulary).
 */
export function resolveStyleId(
  hierarchy: BlindHierarchy,
  names: { shadeType: string | null; opacity: string | null; style: string | null }
): string | null {
  if (!names.style) return null
  const type = findTypeByName(hierarchy, names.shadeType)
  const opacity = findOpacityByName(hierarchy, type?.id, names.opacity)
  const style = findStyleByName(hierarchy, opacity?.id, names.style)
  return style?.id ?? null
}
