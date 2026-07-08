/**
 * Formats a TTD amount with a thousands separator, e.g. `formatTtd(8631)` ->
 * `"TTD $8,631"`. No formatter with a thousands separator existed anywhere
 * in the app before this (every other call site does `TTD $${n.toFixed(2)}`
 * inline with no grouping) — this is a new, minimal, reusable helper rather
 * than an inline one-off, so future call sites can adopt it instead of
 * repeating the `toLocaleString` options. Introduced for the admin
 * dashboard KPI row (client feedback, 2026-07-07 QA); not retrofitted onto
 * unrelated existing call sites, which were not flagged as needing it.
 *
 * @param amount - The TTD amount.
 * @param decimals - Decimal places to show (default 0, matching the KPI row's existing `toFixed(0)` style).
 */
export function formatTtd(amount: number, decimals = 0): string {
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return `TTD $${formatted}`
}
