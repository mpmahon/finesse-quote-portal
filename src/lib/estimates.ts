import {
  calculateAwningLineItem,
  calculateLineItem,
  calculateQuoteTotals,
  lineItemTtd,
} from '@/lib/quote-engine'
import type { PricingParams, QuoteTotals } from '@/lib/quote-engine'
import type { AwningProduct, Component, MountType, UserRole } from '@/types/database'

/**
 * Shared estimate layer (WS1 §5.6).
 *
 * Every card/list "estimate" in the app goes through these functions so that
 * a property/room estimate always equals a freshly generated quote to the
 * cent. Do NOT re-implement summation loops in pages — extend this instead.
 */

/** Window shape as loaded by the properties/rooms pages (with embedded product data). */
export interface EstimateWindow {
  width_inches: number | string
  height_inches: number | string
  mount_type: MountType
  has_blind: boolean
  has_awning: boolean
  product_id: string | null
  awning_product_id: string | null
  excluded_components: string[] | null
  products: { components: Component[] } | null
  awning_products: AwningProduct | null
}

/** The pricing_config columns the estimate layer needs. */
export interface EstimateConfig {
  exchange_rate: number | string
  retail_markup_pct: number | string
  wholesale_markup_pct: number | string
  labor_cost_ttd: number | string
  installation_cost_ttd: number | string
}

/** Columns to select from pricing_config for estimates. */
export const ESTIMATE_CONFIG_COLUMNS =
  'exchange_rate, retail_markup_pct, wholesale_markup_pct, labor_cost_ttd, installation_cost_ttd'

/** Convert a pricing_config row into the engine's PricingParams. */
export function toPricingParams(config: EstimateConfig): PricingParams {
  return {
    exchange_rate: Number(config.exchange_rate),
    retail_markup_pct: Number(config.retail_markup_pct),
    wholesale_markup_pct: Number(config.wholesale_markup_pct),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
  }
}

/** The markup percentage a given customer role attracts. */
export function markupPctForRole(role: UserRole, config: EstimateConfig): number {
  return role === 'retail_customer'
    ? Number(config.retail_markup_pct)
    : Number(config.wholesale_markup_pct)
}

/**
 * USD line totals for one window — one entry per priceable line (blind and/or
 * awning), honouring excluded_components. Mirrors the calculate route exactly:
 * a window with both a blind and an awning contributes two lines (and so two
 * labour/installation charges).
 */
export function windowLineTotalsUsd(w: EstimateWindow): number[] {
  const lines: number[] = []
  if (w.has_blind && w.product_id && w.products?.components?.length) {
    const result = calculateLineItem(
      {
        width_inches: Number(w.width_inches),
        height_inches: Number(w.height_inches),
        mount_type: w.mount_type,
      },
      w.products.components,
      w.excluded_components || []
    )
    lines.push(result.costs.line_total_usd)
  }
  if (w.has_awning && w.awning_product_id && w.awning_products) {
    const result = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
    lines.push(result.costs.line_total_usd)
  }
  return lines
}

/**
 * Full-formula estimate for a set of windows — identical math to quote
 * generation: per-line markup by customer type, currency conversion, labour
 * per line, installation per line for retail customers only.
 */
export function estimateWindowsTotals(
  windows: EstimateWindow[],
  config: EstimateConfig,
  customerRole: UserRole
): QuoteTotals {
  const lineItems = windows
    .flatMap(windowLineTotalsUsd)
    .map(usd => ({ costs: { line_total_usd: usd } }))
  return calculateQuoteTotals(lineItems, toPricingParams(config), customerRole)
}

/**
 * Customer-visible TTD estimate for a single window (blind + awning lines,
 * labour rolled in per line; installation excluded — it is shown separately
 * on quotes). Returns null when nothing on the window is configured yet.
 */
export function estimateWindowTtd(
  w: EstimateWindow,
  config: EstimateConfig,
  customerRole: UserRole
): number | null {
  const lines = windowLineTotalsUsd(w)
  if (lines.length === 0) return null
  const markup = markupPctForRole(customerRole, config)
  const rate = Number(config.exchange_rate)
  const labor = Number(config.labor_cost_ttd)
  return lines.reduce((sum, usd) => sum + lineItemTtd(usd, markup, rate, labor), 0)
}
