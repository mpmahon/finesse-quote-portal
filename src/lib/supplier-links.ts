import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Supplier, SupplierLink, SupplierProduct } from '@/types/database'

/**
 * Which Finesse structure a `supplier_links` row targets — mirrors the DB's
 * `supplier_links_one_target` check (exactly one of `blind_style_id`,
 * `blind_colour_id`, `awning_product_id` is set per row, 00021).
 */
export type SupplierLinkTargetType = 'style' | 'colour' | 'awning'

/** Minimal shape needed to resolve a link's target — satisfied by a full `SupplierLink` row or a form-in-progress that hasn't been saved yet. */
export type LinkTargetFields = Pick<SupplierLink, 'blind_style_id' | 'blind_colour_id' | 'awning_product_id'>

/**
 * Stable string key for "what Finesse item does this link point at", used to
 * detect when two different `supplier_links` rows target the SAME style/
 * colour/awning product — the DB allows only one `is_primary_source = true`
 * row per target (00022 partial unique indexes on each of the three FK
 * columns). Returns null when no target is set yet (an in-progress form
 * draft before a target is chosen; never true for a persisted row).
 */
export function targetKey(link: LinkTargetFields): string | null {
  if (link.blind_style_id) return `style:${link.blind_style_id}`
  if (link.blind_colour_id) return `colour:${link.blind_colour_id}`
  if (link.awning_product_id) return `awning:${link.awning_product_id}`
  return null
}

/**
 * Human-readable breadcrumb for a link's target (e.g. "Roller Shade →
 * Sheer → Aurora → Ivory" for a colour, or "Sunsetter Elite (Awning)"),
 * used everywhere a link is listed so a raw UUID never reaches the UI.
 * Falls back to an "Unknown ..." label if the target node was since
 * deleted/renamed out from under a still-existing link.
 */
export function describeTarget(
  hierarchy: BlindHierarchy,
  awningProducts: AwningProduct[],
  link: LinkTargetFields
): string {
  if (link.awning_product_id) {
    const product = awningProducts.find(a => a.id === link.awning_product_id)
    return product ? `${product.make} ${product.model} (Awning)` : 'Unknown awning product'
  }
  if (link.blind_colour_id) {
    const colour = hierarchy.colours.find(c => c.id === link.blind_colour_id)
    if (!colour) return 'Unknown colour'
    const style = hierarchy.styles.find(s => s.id === colour.style_id)
    const opacity = style ? hierarchy.opacities.find(o => o.id === style.opacity_id) : undefined
    const type = opacity ? hierarchy.types.find(t => t.id === opacity.type_id) : undefined
    return [type?.name, opacity?.name, style?.name, colour.name].filter(Boolean).join(' → ')
  }
  if (link.blind_style_id) {
    const style = hierarchy.styles.find(s => s.id === link.blind_style_id)
    if (!style) return 'Unknown style'
    const opacity = hierarchy.opacities.find(o => o.id === style.opacity_id)
    const type = opacity ? hierarchy.types.find(t => t.id === opacity.type_id) : undefined
    return [type?.name, opacity?.name, style.name].filter(Boolean).join(' → ')
  }
  return 'No target set'
}

/**
 * Reconstructs the Type → Opacity → Style path for a given style id, so the
 * cascading target picker can be pre-filled when editing an existing
 * style-targeted link. Empty strings for any level that can't be resolved
 * (a since-deleted/renamed node).
 */
export function pathForStyle(hierarchy: BlindHierarchy, styleId: string | null | undefined) {
  const style = styleId ? hierarchy.styles.find(s => s.id === styleId) : undefined
  const opacity = style ? hierarchy.opacities.find(o => o.id === style.opacity_id) : undefined
  const type = opacity ? hierarchy.types.find(t => t.id === opacity.type_id) : undefined
  return { typeId: type?.id ?? '', opacityId: opacity?.id ?? '', styleId: style?.id ?? '' }
}

/** Reconstructs the Type → Opacity → Style → Colour path for a given colour id — same purpose as {@link pathForStyle}, one level deeper. */
export function pathForColour(hierarchy: BlindHierarchy, colourId: string | null | undefined) {
  const colour = colourId ? hierarchy.colours.find(c => c.id === colourId) : undefined
  const rest = pathForStyle(hierarchy, colour?.style_id)
  return { ...rest, colourId: colour?.id ?? '' }
}

/**
 * Finds the other `supplier_links` row (if any) currently marked primary
 * for the same target, excluding the row being edited. Used to pre-warn the
 * admin in the allocation form BEFORE a save would trip the DB's
 * one-primary-per-target partial unique index (00022) — saving a second
 * primary for the same target without demoting the first would otherwise
 * surface as a raw unique-violation error.
 */
export function findConflictingPrimary(
  allLinks: SupplierLink[],
  candidate: LinkTargetFields,
  excludeLinkId?: string
): SupplierLink | null {
  const key = targetKey(candidate)
  if (!key) return null
  return allLinks.find(l => l.id !== excludeLinkId && l.is_primary_source && targetKey(l) === key) ?? null
}

/** Read-only reference-cost shape surfaced next to a style's pricing components in `BlindStyleEditor` — see {@link buildPrimaryStyleCostMap}. */
export interface PrimaryStyleCostRef {
  supplierName: string
  productName: string
  costPrice: number | null
  currency: string
  unitOfMeasure: string | null
  quantityPer: number
  priceUpdatedAt: string | null
}

/**
 * Builds a `blind_style_id -> primary supplier cost reference` map for the
 * admin-only reference line shown in `BlindStyleEditor` (00022): join
 * `supplier_links` (is_primary_source only, so at most one entry per style —
 * DB-enforced by the 00022 partial unique index) → `supplier_products` →
 * `suppliers`. Reference/reporting only — the caller must never feed this
 * into the quote engine (see quote-engine.ts `PricedComponent`, which reads
 * only `blind_style_components`/`components`).
 */
export function buildPrimaryStyleCostMap(
  links: SupplierLink[],
  supplierProducts: SupplierProduct[],
  suppliers: Supplier[]
): Record<string, PrimaryStyleCostRef> {
  const map: Record<string, PrimaryStyleCostRef> = {}
  for (const link of links) {
    if (!link.blind_style_id || !link.is_primary_source) continue
    const product = supplierProducts.find(p => p.id === link.supplier_product_id)
    if (!product) continue
    const supplier = suppliers.find(s => s.id === product.supplier_id)
    map[link.blind_style_id] = {
      supplierName: supplier?.name ?? 'Unknown supplier',
      productName: product.name,
      costPrice: product.cost_price,
      currency: product.currency,
      unitOfMeasure: product.unit_of_measure,
      quantityPer: link.quantity_per,
      priceUpdatedAt: product.price_updated_at,
    }
  }
  return map
}
