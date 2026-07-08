/**
 * Style Gallery "Quote from style" query-param plumbing.
 *
 * The gallery CTA hands a chosen product/awning off to the property → room →
 * window-configurator chain purely via URL search params (no client state,
 * no server session) so the selection survives full page navigations and
 * server-refreshed links. Every page in the chain is expected to:
 *   1. Read its own `searchParams` and compute {@link buildStyleQuerySuffix}.
 *   2. Append that suffix to any Link that hands off further down the chain
 *      (room cards, "Configure" buttons).
 *   3. At the window configurator, call {@link parseGallerySelection} and
 *      pass the result down as a pre-fill hint — used only as a fallback
 *      when the window itself has no stored selection yet, so an already-
 *      configured window is never silently overwritten by a stale link.
 *
 * When no gallery keys are present (the normal, non-gallery flow), every
 * function here is a no-op — `buildStyleQuerySuffix` returns `''` and
 * `parseGallerySelection` returns `null`.
 */

/** Search-param keys that carry a Style Gallery selection. */
export const GALLERY_STYLE_QUERY_KEYS = [
  'kind',
  'productId',
  'awningProductId',
  'shadeType',
  'style',
  'colour',
] as const

export type GalleryStyleQueryKey = (typeof GALLERY_STYLE_QUERY_KEYS)[number]

/** Loosely-typed search params shape shared by Next.js server components and plain client-side objects. */
export type StyleQuerySource = Record<string, string | string[] | undefined> | undefined | null

/** A resolved gallery selection, ready to pre-fill the window configurator. */
export interface GallerySelection {
  kind: 'blind' | 'awning'
  productId?: string
  awningProductId?: string
  shadeType?: string
  style?: string
  colour?: string
}

function firstValue(source: StyleQuerySource, key: GalleryStyleQueryKey): string | undefined {
  if (!source) return undefined
  const value = source[key]
  const v = Array.isArray(value) ? value[0] : value
  return v || undefined
}

/**
 * Builds the query-string suffix (including a leading `?`, or `''` if there's
 * nothing to carry) that forwards a Style Gallery selection across a Link
 * href. Safe to call with any searchParams-shaped object — unrelated keys
 * (e.g. `?new=true`, `?status=sent`) are ignored, so it composes cleanly
 * with a page's own query params.
 */
export function buildStyleQuerySuffix(source: StyleQuerySource): string {
  const params = new URLSearchParams()
  for (const key of GALLERY_STYLE_QUERY_KEYS) {
    const v = firstValue(source, key)
    if (v) params.set(key, v)
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

/**
 * Parses a Style Gallery selection out of a page's resolved `searchParams`.
 * Returns `null` when there's no recognizable selection (normal, non-gallery
 * visit, or a malformed/partial link) so callers can treat absence uniformly.
 */
export function parseGallerySelection(source: StyleQuerySource): GallerySelection | null {
  const kind = firstValue(source, 'kind')
  if (kind !== 'blind' && kind !== 'awning') return null

  if (kind === 'blind') {
    const productId = firstValue(source, 'productId')
    if (!productId) return null
    return {
      kind,
      productId,
      shadeType: firstValue(source, 'shadeType'),
      style: firstValue(source, 'style'),
      colour: firstValue(source, 'colour'),
    }
  }

  const awningProductId = firstValue(source, 'awningProductId')
  if (!awningProductId) return null
  return { kind, awningProductId, colour: firstValue(source, 'colour') }
}
