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
