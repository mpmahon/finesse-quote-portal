/**
 * Quote staleness detection
 *
 * A quote is considered "stale" if any pricing data that went into it has
 * been updated since the quote was created:
 *   - The global pricing_config row (exchange rate, markup, duty, fees)
 *   - Any components belonging to products referenced by the quote's line items
 *
 * The old quote is never mutated — it remains a historical snapshot with
 * the prices that were in effect at the time. Staleness is a display-layer
 * flag that prompts the user to regenerate if they want current pricing.
 */

export type StaleReason = 'config' | 'components' | 'both' | null

export interface StalenessResult {
  is_stale: boolean
  reason: StaleReason
}

export function computeStaleness(
  quoteCreatedAt: string,
  quoteProductIds: string[],
  pricingConfigUpdatedAt: string | null,
  productLatestUpdate: Record<string, string>
): StalenessResult {
  const configChanged = !!(
    pricingConfigUpdatedAt && pricingConfigUpdatedAt > quoteCreatedAt
  )

  let productsChanged = false
  for (const pid of quoteProductIds) {
    const ts = productLatestUpdate[pid]
    if (ts && ts > quoteCreatedAt) {
      productsChanged = true
      break
    }
  }

  if (configChanged && productsChanged) return { is_stale: true, reason: 'both' }
  if (configChanged) return { is_stale: true, reason: 'config' }
  if (productsChanged) return { is_stale: true, reason: 'components' }
  return { is_stale: false, reason: null }
}

/**
 * Builds a map of product_id -> latest components.updated_at for all
 * components in the database. A single query keeps this O(1) per quote.
 *
 * Legacy per-product staleness check — still relevant for quotes generated
 * before Batch 11 Part 1 (blind pricing moved to blind_styles), whose line
 * items may still carry a `product_id`. New blind lines never set one, so
 * this simply won't match anything for them; see
 * {@link buildStyleLatestMap} for the current pricing source.
 */
export function buildProductLatestMap(
  components: { product_id: string; updated_at: string }[]
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const c of components) {
    const current = map[c.product_id]
    if (!current || c.updated_at > current) {
      map[c.product_id] = c.updated_at
    }
  }
  return map
}

/**
 * Builds a map of style_id -> latest blind_style_components.updated_at.
 * Batch 11 Part 1 counterpart to {@link buildProductLatestMap} — blind
 * pricing now lives on `blind_styles`, so a quote must also react to Mike
 * editing a style's component prices in Blind Management, not just the
 * legacy per-product table. Callers should merge this with
 * `buildProductLatestMap`'s output (the id spaces never collide — they're
 * different tables' uuids) and pass the combined map + combined tracked-id
 * list into {@link computeStaleness}.
 */
export function buildStyleLatestMap(
  styleComponents: { style_id: string; updated_at: string }[]
): Record<string, string> {
  const map: Record<string, string> = {}
  for (const c of styleComponents) {
    const current = map[c.style_id]
    if (!current || c.updated_at > current) {
      map[c.style_id] = c.updated_at
    }
  }
  return map
}
