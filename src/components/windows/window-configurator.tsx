'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  calculateBlindDimensions,
  calculateLineItem,
  calculateAwningLineItem,
  calculateAwningDimensions,
  lineItemTtd,
  resolveHardwareSpec,
} from '@/lib/quote-engine'
import type { PricedComponent } from '@/lib/quote-engine'
import { markupPctForRole } from '@/lib/estimates'
import type { EstimateConfig } from '@/lib/estimates'
import {
  opacitiesForType,
  stylesForOpacity,
  coloursForStyle,
  valancesForType,
  componentsForStyle,
  findTypeByName,
  findOpacityByName,
  findStyleByName,
  findColourByName,
  findValanceByName,
} from '@/lib/blind-hierarchy'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import { MOUNT_TYPE_LABELS, BLIND_TYPE_NAME_TO_PRODUCT_SLUG } from '@/lib/constants'
import { WindowDiagram } from '@/components/windows/window-diagram'
import type { Window as WindowType, AwningProduct, UserRole, HardwareSizeRule } from '@/types/database'
import type { GallerySelection } from '@/lib/gallery-style-query'

interface ColourSwatch {
  name: string
  hex_code: string | null
}

interface WindowConfiguratorProps {
  window: WindowType
  awningProducts: AwningProduct[]
  propertyId: string
  roomId: string
  /**
   * Only administrators see the internal USD cost breakdown. Salesmen and
   * customers see only marked-up TTD retail pricing (client feedback,
   * Batch 6 item 6) — the vendor cost structure vs. revenue split is
   * admin-eyes-only.
   */
  isAdmin: boolean
  /** Pricing config for the live TTD estimate. Null only if the config row failed to load. */
  pricing: EstimateConfig | null
  /** The property owner's customer type — drives the markup for the live estimate. */
  customerRole: UserRole
  /**
   * Legacy flat colour swatches (`legacy_colours`, renamed from `colours` in
   * Batch 7). Only used for awning colour swatch chips now — blind colour
   * swatches come from the selected {@link BlindHierarchy} colour node's own
   * `hex_code`.
   */
  colourSwatches: ColourSwatch[]
  /**
   * The blind option hierarchy (Batch 7): Type -> Opacity -> Style -> Colour,
   * plus Valance/Finisher per Type. Active nodes only (customer/salesperson
   * facing selection).
   */
  hierarchy: BlindHierarchy
  /**
   * Width-based hardware support rules (Batch 7 pre-work). Used to resolve
   * the live tube-size / control-type callout as width/mount change, and to
   * block saving when the fabricated width exceeds the fabrication max.
   */
  hardwareRules: HardwareSizeRule[]
  /**
   * A "Quote from style" selection carried through from the Style Gallery
   * (see `src/lib/gallery-style-query.ts`), or `null` on a normal visit.
   * Used only as a fallback default for fields the window doesn't already
   * have a value for — an already-configured window's own selection always
   * wins, so reconfiguring an existing window is never silently overwritten
   * by a stale gallery link. Batch 11 Part 1: the gallery now hands off a
   * real hierarchy Style id directly (gallery cards ARE styles), so this is
   * resolved unambiguously rather than by legacy free-text name matching.
   */
  gallerySelection?: GallerySelection | null
}

/** Hardware component category for grouped display. */
interface HardwareGroup {
  label: string
  items: string[]
}

/** Component-name → category mapping. */
const HARDWARE_CATEGORIES: Record<string, string> = {
  cassette: 'Casing',
  cassette_insert: 'Casing',
  tube: 'Mechanism',
  chain: 'Mechanism',
  bottom_rail: 'Rail',
  bottom_rail_insert: 'Rail',
  adhesive_bottom_rail: 'Rail',
  adhesive: 'Rail',
  adapters: 'Mounting',
  brackets: 'Mounting',
  end_caps: 'Mounting',
}

/** Category display order. */
const CATEGORY_ORDER = ['Casing', 'Rail', 'Mechanism', 'Mounting']

/**
 * Groups unique hardware component names by functional category.
 * Hardware = everything except `fabric`. The groups drive the checkbox layout.
 */
function getHardwareGroups(components: PricedComponent[]): HardwareGroup[] {
  const seen = new Set<string>()
  const byCategory: Record<string, string[]> = {}

  for (const c of components) {
    if (c.name === 'fabric') continue
    const key = c.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const category = HARDWARE_CATEGORIES[key] || 'Other'
    if (!byCategory[category]) byCategory[category] = []
    byCategory[category].push(c.name)
  }

  // Return in the predefined order, then any "Other" at the end
  const groups: HardwareGroup[] = []
  for (const cat of CATEGORY_ORDER) {
    if (byCategory[cat]) groups.push({ label: cat, items: byCategory[cat] })
  }
  if (byCategory['Other']) groups.push({ label: 'Other', items: byCategory['Other'] })
  return groups
}

/** Pretty-print a component name for the UI: underscore → space, title-case. */
function formatComponentName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

export function WindowConfigurator({
  window: win,
  awningProducts,
  propertyId,
  roomId,
  isAdmin,
  pricing,
  customerRole,
  colourSwatches,
  hierarchy,
  hardwareRules,
  gallerySelection = null,
}: WindowConfiguratorProps) {
  // Style Gallery fallback hints — only meaningful for the matching feature,
  // and only ever used as a fallback below (the window's own stored value
  // always takes priority).
  const blindHint = gallerySelection?.kind === 'blind' ? gallerySelection : null
  const awningHint = gallerySelection?.kind === 'awning' ? gallerySelection : null

  // Feature toggles
  const [hasBlind, setHasBlind] = useState(win.has_blind)
  const [hasAwning, setHasAwning] = useState(win.has_awning)

  // Blind hierarchy state — IDs, not names, so the cascade is unambiguous
  // even where the same name appears under different parents (e.g. "Full
  // Privacy" is an Opacity under several Types). Resolved once on mount from
  // the window's stored name strings (the normal path), or — when the
  // window has no selection of its own yet — from the gallery's hinted
  // Style id, walked bottom-up to its Opacity/Type (the gallery hands off a
  // real Style id directly, so this is unambiguous; no name matching).
  const hintStyle = blindHint?.styleId ? hierarchy.styles.find(s => s.id === blindHint.styleId) ?? null : null
  const hintOpacity = hintStyle ? hierarchy.opacities.find(o => o.id === hintStyle.opacity_id) ?? null : null
  const hintType = hintOpacity ? hierarchy.types.find(t => t.id === hintOpacity.type_id) ?? null : null

  const initialType = findTypeByName(hierarchy, win.shade_type) ?? hintType
  const initialOpacity =
    findOpacityByName(hierarchy, initialType?.id, win.opacity) ??
    (initialType && hintType && initialType.id === hintType.id ? hintOpacity : null)
  const initialStyle =
    findStyleByName(hierarchy, initialOpacity?.id, win.style) ??
    (initialOpacity && hintOpacity && initialOpacity.id === hintOpacity.id ? hintStyle : null)
  const initialColour = findColourByName(hierarchy, initialStyle?.id, win.colour ?? blindHint?.colour)
  const initialValance = findValanceByName(hierarchy, initialType?.id, win.valance)

  const [typeId, setTypeId] = useState(initialType?.id ?? '')
  const [opacityId, setOpacityId] = useState(initialOpacity?.id ?? '')
  const [styleId, setStyleId] = useState(initialStyle?.id ?? '')
  const [colourId, setColourId] = useState(initialColour?.id ?? '')
  const [valanceId, setValanceId] = useState(initialValance?.id ?? '')

  // Hardware exclusion state — initialised from the window's stored value.
  // Each entry is a lowercase component name that has been UNCHECKED.
  const [excludedComponents, setExcludedComponents] = useState<string[]>(
    win.excluded_components || []
  )

  // Awning state
  const [awningProductId, setAwningProductId] = useState(win.awning_product_id || awningHint?.awningProductId || '')
  const [awningColour, setAwningColour] = useState(win.awning_colour || awningHint?.colour || '')

  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Cascade children of the current selection.
  const availableOpacities = useMemo(() => opacitiesForType(hierarchy, typeId), [hierarchy, typeId])
  const availableStyles = useMemo(() => stylesForOpacity(hierarchy, opacityId), [hierarchy, opacityId])
  const availableColours = useMemo(() => coloursForStyle(hierarchy, styleId), [hierarchy, styleId])
  const availableValances = useMemo(() => valancesForType(hierarchy, typeId), [hierarchy, typeId])

  const selectedType = hierarchy.types.find(t => t.id === typeId) ?? null
  const selectedOpacity = availableOpacities.find(o => o.id === opacityId) ?? null
  const selectedStyle = availableStyles.find(s => s.id === styleId) ?? null
  const selectedColour = availableColours.find(c => c.id === colourId) ?? null
  const selectedValance = availableValances.find(v => v.id === valanceId) ?? null

  // Width-based hardware sizing (Batch 7 pre-work) keys off the selected
  // Type's name via the same slug map that used to filter the (now-removed)
  // product list — Roller Shade / Neolux Shade are the only Types with
  // hardware-size rules today; every other Type resolves to no rule.
  const hardwareTypeSlug = selectedType ? BLIND_TYPE_NAME_TO_PRODUCT_SLUG[selectedType.name] : undefined

  // Cascade resets: each child clears when its parent changes so a stale
  // selection from a different branch can never be saved.
  function handleTypeChange(nextTypeId: string) {
    setTypeId(nextTypeId)
    setOpacityId('')
    setStyleId('')
    setColourId('')
    setValanceId('')
    setExcludedComponents([])
  }
  function handleOpacityChange(nextOpacityId: string) {
    setOpacityId(nextOpacityId)
    setStyleId('')
    setColourId('')
  }
  function handleStyleChange(nextStyleId: string) {
    setStyleId(nextStyleId)
    setColourId('')
    // Excluded-hardware selections are specific to a style's component set —
    // reset on style change so an excluded name from a different style's
    // blueprint can't silently carry over.
    setExcludedComponents([])
  }

  // Blind pricing components (Batch 11 Part 1) — the selected Style's own
  // blend_style_components rows, replacing the old per-product components.
  const selectedStyleComponents = useMemo(
    () => componentsForStyle(hierarchy, styleId),
    [hierarchy, styleId]
  )
  const selectedAwning = awningProducts.find(p => p.id === awningProductId)

  // Map legacy colour name → hex, for awning swatch chips only (blind
  // colour swatches use the selected hierarchy colour's own hex_code).
  const hexByColour = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of colourSwatches) {
      if (c.hex_code) map[c.name.toLowerCase()] = c.hex_code
    }
    return map
  }, [colourSwatches])
  const selectedHex = selectedColour?.hex_code ?? null

  // Hardware component groups for the selected style
  const hardwareGroups = useMemo(
    () => (selectedStyleComponents.length > 0 ? getHardwareGroups(selectedStyleComponents) : []),
    [selectedStyleComponents]
  )

  function toggleComponent(name: string) {
    const key = name.toLowerCase()
    setExcludedComponents(prev =>
      prev.includes(key) ? prev.filter(n => n !== key) : [...prev, key]
    )
  }

  // Blind dimensions + preview (respects excluded components)
  const blindDims = useMemo(() =>
    calculateBlindDimensions({
      width_inches: Number(win.width_inches),
      height_inches: Number(win.height_inches),
      mount_type: win.mount_type,
    }), [win.width_inches, win.height_inches, win.mount_type]
  )

  // Width-based hardware spec (Batch 7 pre-work) — resolved from the
  // selected Type's hardware slug (see `hardwareTypeSlug` above) and the
  // window's FABRICATED width (blindDims.blind_width, not the raw window
  // width). Width and mount type are fixed per this window (edited on the
  // room's Add/Edit Window dialog, not here); this recomputes live whenever
  // the Type selection changes, the same reactive path the TTD estimate
  // below already uses.
  const hardwareResolution = useMemo(
    () => resolveHardwareSpec(hardwareTypeSlug ?? null, blindDims.blind_width, hardwareRules),
    [hardwareTypeSlug, blindDims.blind_width, hardwareRules]
  )
  const matchedHardwareRule = useMemo(() => {
    if (!hardwareResolution.spec) return null
    return hardwareRules.find(r => r.id === hardwareResolution.spec!.rule_id) ?? null
  }, [hardwareResolution.spec, hardwareRules])

  const blindPreview = useMemo(() => {
    if (selectedStyleComponents.length === 0) return null
    return calculateLineItem(
      {
        width_inches: Number(win.width_inches),
        height_inches: Number(win.height_inches),
        mount_type: win.mount_type,
      },
      selectedStyleComponents,
      excludedComponents,
      matchedHardwareRule
    )
  }, [selectedStyleComponents, win.width_inches, win.height_inches, win.mount_type, excludedComponents, matchedHardwareRule])

  // Awning dimensions + preview
  const awningDims = useMemo(() => {
    if (!selectedAwning) return null
    return calculateAwningDimensions(Number(win.width_inches), selectedAwning)
  }, [selectedAwning, win.width_inches])

  const awningPreview = useMemo(() => {
    if (!selectedAwning) return null
    return calculateAwningLineItem(Number(win.width_inches), selectedAwning)
  }, [selectedAwning, win.width_inches])

  // Live customer-visible TTD estimate — same math as a generated quote line
  // (markup by customer type + conversion + labour rolled in per line).
  const markupPct = pricing ? markupPctForRole(customerRole, pricing) : null
  const blindTtd = pricing && markupPct !== null && hasBlind && blindPreview
    ? lineItemTtd(blindPreview.costs.line_total_usd, markupPct, Number(pricing.exchange_rate), Number(pricing.labor_cost_ttd))
    : null
  const awningTtd = pricing && markupPct !== null && hasAwning && awningPreview
    ? lineItemTtd(awningPreview.costs.line_total_usd, markupPct, Number(pricing.exchange_rate), Number(pricing.labor_cost_ttd))
    : null
  const totalTtd = (blindTtd ?? 0) + (awningTtd ?? 0)

  const combinedUsd =
    ((hasBlind ? blindPreview?.costs.line_total_usd : 0) || 0) +
    ((hasAwning ? awningPreview?.costs.line_total_usd : 0) || 0)

  // A level is only mandatory when its parent has options to choose from —
  // TBD nodes (empty child lists) are skippable and saved as null, per the
  // spec's "options pending" rule.
  const opacityRequired = availableOpacities.length > 0
  const styleRequired = Boolean(opacityId) && availableStyles.length > 0
  const colourRequired = Boolean(styleId) && availableColours.length > 0
  const valanceRequired = availableValances.length > 0

  const blindConfigIncomplete =
    !typeId ||
    (opacityRequired && !opacityId) ||
    (styleRequired && !styleId) ||
    (colourRequired && !colourId) ||
    (valanceRequired && !valanceId)

  async function handleSave() {
    if (hasBlind && blindConfigIncomplete) {
      toast.error('Please complete blind configuration')
      return
    }
    if (hasAwning && (!awningProductId || !awningColour)) {
      toast.error('Please complete awning configuration')
      return
    }
    // Client-side guard against fabrication-max overruns (server stays
    // tolerant — see /api/quotes/calculate — this just stops a doomed save
    // before it happens).
    if (hasBlind && hardwareResolution.exceedsMax) {
      toast.error('This blind exceeds the maximum fabricable width for its type. Reduce the width or choose a narrower blind type/style.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    // `product_id` is intentionally left out of this update — Batch 11 Part
    // 1 removed the blind Make/Model pick (pricing now comes from the
    // selected Style's own components), so the column is unused for new
    // configs. Leaving it out preserves whatever legacy value a
    // pre-Batch-11 window may still carry rather than nulling history.
    const updates = {
      has_blind: hasBlind,
      has_awning: hasAwning,
      // Type name goes in the historical `shade_type` column (semantic
      // change only — see migration 00017); Opacity/Valance snapshot into
      // the two new columns.
      shade_type: hasBlind ? (selectedType?.name ?? null) : null,
      style: hasBlind ? (selectedStyle?.name ?? null) : null,
      colour: hasBlind ? (selectedColour?.name ?? null) : null,
      opacity: hasBlind ? (selectedOpacity?.name ?? null) : null,
      valance: hasBlind ? (selectedValance?.name ?? null) : null,
      awning_product_id: hasAwning ? awningProductId : null,
      awning_colour: hasAwning ? awningColour : null,
      excluded_components: hasBlind ? excludedComponents : [],
    }

    const { error } = await supabase
      .from('windows')
      .update(updates)
      .eq('id', win.id)

    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Window saved')
    setLoading(false)
    router.push(`/properties/${propertyId}/rooms/${roomId}`)
    router.refresh()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: Window Info + Configuration */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Window Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Width:</span>{' '}
                <span className="font-medium">{win.width_inches}&quot;</span>
              </div>
              <div>
                <span className="text-muted-foreground">Height:</span>{' '}
                <span className="font-medium">{win.height_inches}&quot;</span>
              </div>
              <div>
                <span className="text-muted-foreground">Mount:</span>{' '}
                <Badge variant="outline">{MOUNT_TYPE_LABELS[win.mount_type]}</Badge>
              </div>
              {win.depth_inches && (
                <div>
                  <span className="text-muted-foreground">Depth:</span>{' '}
                  <span className="font-medium">{win.depth_inches}&quot;</span>
                </div>
              )}
            </div>
            {win.mount_type === 'undecided' && (
              <p className="text-xs italic text-amber-600">
                Mount TBD — priced and diagrammed as outside mount until the customer decides.
              </p>
            )}
            {win.description && (
              <p className="text-sm text-muted-foreground">{win.description}</p>
            )}
            {hasBlind && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="secondary">Blind {blindDims.blind_width}&quot; × {blindDims.blind_height}&quot;</Badge>
                  {blindPreview && (
                    <Badge variant="secondary">Chain {blindPreview.chain_length.toFixed(1)}&quot;</Badge>
                  )}
                </div>
                {/* Width-based hardware support (Batch 7 pre-work) — tube size
                    + control type for the fabricated width, live as the
                    product selection changes. */}
                {hardwareResolution.spec && (
                  <p className="text-xs text-muted-foreground">
                    Support hardware: {hardwareResolution.spec.tube_size} tube · {hardwareResolution.spec.control_type} control
                  </p>
                )}
                {hardwareResolution.spec?.is_motorized && (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-900 dark:text-amber-200">
                    At this width, this blind requires motorized control.
                  </p>
                )}
                {hardwareResolution.exceedsMax && (
                  <p className="rounded-md bg-destructive/10 px-2 py-1.5 text-xs font-medium text-destructive">
                    Exceeds the maximum fabricable width (228&quot;) for this blind type.
                  </p>
                )}
              </>
            )}
            {hasAwning && awningDims && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="secondary">Awning {awningDims.awning_width}&quot; × {awningDims.awning_depth}&quot; projection</Badge>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="feat-blind">Blind</Label>
                <p className="text-xs text-muted-foreground">Toggle off to remove blind from quote</p>
              </div>
              <Switch id="feat-blind" checked={hasBlind} onCheckedChange={setHasBlind} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="feat-awning">Awning</Label>
                <p className="text-xs text-muted-foreground">Toggle off to remove awning from quote</p>
              </div>
              <Switch id="feat-awning" checked={hasAwning} onCheckedChange={setHasAwning} />
            </div>
            {!hasBlind && !hasAwning && (
              <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                With neither feature enabled, this window will appear on the quote with zero cost — useful for tracking future sales opportunities.
              </p>
            )}
          </CardContent>
        </Card>

        {hasBlind && (
          <Card>
            <CardHeader>
              <CardTitle>Blind Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Hierarchy: Type -> Opacity -> Style -> Colour, plus Valance
                  (parallel to the chain, sourced by Type only). */}
              <div className="space-y-1.5">
                <Label className="text-xs">Blind Type</Label>
                <Select value={typeId} onValueChange={v => handleTypeChange(v ?? '')}>
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Select a blind type">
                      {(value: string) => hierarchy.types.find(t => t.id === value)?.name ?? 'Select a blind type'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {hierarchy.types.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {typeId && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Opacity</Label>
                    {availableOpacities.length === 0 ? (
                      <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                        Options pending — add in Blind Management
                      </p>
                    ) : (
                      <Select value={opacityId} onValueChange={v => handleOpacityChange(v ?? '')}>
                        <SelectTrigger className="h-9 w-full">
                          {/* Explicit render function — Select.Value resolves
                              labels from its mounted-Select.Item registry,
                              which is unreliable for id-keyed values (same
                              pitfall as the gallery quote-from-style dialog);
                              without this it renders the raw uuid instead of
                              the name. */}
                          <SelectValue placeholder="Select">
                            {(value: string) => availableOpacities.find(o => o.id === value)?.name ?? 'Select'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableOpacities.map(o => (
                            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Valance / Finisher</Label>
                    {availableValances.length === 0 ? (
                      <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                        Options pending — add in Blind Management
                      </p>
                    ) : (
                      <Select value={valanceId} onValueChange={v => setValanceId(v ?? '')}>
                        <SelectTrigger className="h-9 w-full">
                          {/* Same explicit render-function requirement as Opacity above. */}
                          <SelectValue placeholder="Select">
                            {(value: string) => availableValances.find(v => v.id === value)?.name ?? 'Select'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {availableValances.map(v => (
                            <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              )}

              {opacityId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Style</Label>
                  {availableStyles.length === 0 ? (
                    <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                      Options pending — add in Blind Management
                    </p>
                  ) : (
                    <Select value={styleId} onValueChange={v => handleStyleChange(v ?? '')}>
                      <SelectTrigger className="h-9 w-full">
                        {/* Same explicit render-function requirement as Opacity above. */}
                        <SelectValue placeholder="Select">
                          {(value: string) => availableStyles.find(s => s.id === value)?.name ?? 'Select'}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {availableStyles.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}

              {styleId && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Colour</Label>
                  {availableColours.length === 0 ? (
                    <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                      Options pending — add in Blind Management
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {availableColours.map(c => {
                        const active = colourId === c.id
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setColourId(c.id)}
                            className={cn(
                              'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                              active
                                ? 'border-primary bg-primary/10 font-medium text-primary'
                                : 'hover:bg-accent'
                            )}
                            aria-pressed={active}
                          >
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
                              style={{ backgroundColor: c.hex_code || '#e2e8f0' }}
                            />
                            {c.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {selectedStyle && (
                <>
                  <Separator />
                  {/* Hardware — grouped by category, multi-column layout */}
                  {hardwareGroups.length > 0 ? (
                    <div>
                      <Label className="mb-2 block text-xs uppercase tracking-wider text-muted-foreground">
                        Hardware Components
                      </Label>
                      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                        {hardwareGroups.map(group => (
                          <div key={group.label}>
                            <p className="mb-1 text-[11px] font-medium text-muted-foreground/70">{group.label}</p>
                            <div className="space-y-0.5">
                              {group.items.map(name => {
                                const isExcluded = excludedComponents.includes(name.toLowerCase())
                                return (
                                  <label
                                    key={name}
                                    className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[13px] hover:bg-accent/50 cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={!isExcluded}
                                      onCheckedChange={() => toggleComponent(name)}
                                      className="h-3.5 w-3.5"
                                    />
                                    <span className={isExcluded ? 'text-muted-foreground line-through' : ''}>
                                      {formatComponentName(name)}
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      {excludedComponents.length > 0 && (
                        <p className="mt-2 text-xs italic text-muted-foreground">
                          {excludedComponents.map(n => formatComponentName(n)).join(', ')} not included
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed px-2.5 py-2 text-xs text-muted-foreground">
                      No pricing components set up for this style yet — add them in Admin &gt; Blind Management.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {hasAwning && (
          <Card>
            <CardHeader>
              <CardTitle>Awning Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {awningProducts.length === 0 ? (
                <p className="text-sm text-amber-600">
                  No awning products available. Add some in Admin &gt; Awning Products.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Make / Model</Label>
                    <Select value={awningProductId} onValueChange={v => { setAwningProductId(v ?? ''); setAwningColour('') }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an awning">
                          {(value: string) => {
                            const p = awningProducts.find(x => x.id === value)
                            return p ? `${p.make} ${p.model}` : 'Select an awning'
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {awningProducts.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.make} {p.model} ({p.depth_inches}&quot; projection)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedAwning && (
                    <div className="space-y-2">
                      <Label>Colour</Label>
                      <div className="flex flex-wrap gap-2">
                        {selectedAwning.colours.map(c => {
                          const hex = hexByColour[c.toLowerCase()]
                          const active = awningColour === c
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setAwningColour(c)}
                              className={cn(
                                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs capitalize transition-colors',
                                active
                                  ? 'border-primary bg-primary/10 font-medium text-primary'
                                  : 'hover:bg-accent'
                              )}
                              aria-pressed={active}
                            >
                              <span
                                className="inline-block h-3.5 w-3.5 rounded-full border border-black/10"
                                style={{ backgroundColor: hex || '#e2e8f0' }}
                              />
                              {c}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        <Button
          onClick={handleSave}
          className="w-full"
          disabled={
            loading ||
            (hasBlind && blindConfigIncomplete) ||
            (hasAwning && (!awningProductId || !awningColour)) ||
            (hasBlind && hardwareResolution.exceedsMax)
          }
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Right: diagram + live price. USD breakdown is administrator-only. */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <WindowDiagram
              widthInches={Number(win.width_inches)}
              heightInches={Number(win.height_inches)}
              mountType={win.mount_type}
              blindColour={selectedHex}
              showBlind={hasBlind}
              className="mx-auto w-full max-w-sm"
            />
          </CardContent>
        </Card>

        {(hasBlind || hasAwning) && (
          <Card className="border-primary/40">
            <CardHeader>
              <CardTitle>Estimated Price</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {hasBlind && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Blind</span>
                  <span className="font-medium">
                    {blindTtd !== null ? `TTD $${blindTtd.toFixed(2)}` : '—'}
                  </span>
                </div>
              )}
              {hasAwning && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Awning</span>
                  <span className="font-medium">
                    {awningTtd !== null ? `TTD $${awningTtd.toFixed(2)}` : '—'}
                  </span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-semibold">
                <span>Window Total</span>
                <span className="text-primary">
                  {totalTtd > 0 ? `TTD $${totalTtd.toFixed(2)}` : '—'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Estimate updates live as you configure. Installation is added on the final quote{customerRole === 'wholesale_customer' ? ' (not applicable for wholesale)' : ''}.
              </p>
              {blindPreview && blindPreview.excluded_names.length > 0 && (
                <p className="text-xs italic text-muted-foreground">
                  {blindPreview.excluded_names.map(n => formatComponentName(n)).join(', ')} not included
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && hasBlind && blindPreview && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Blind Cost Breakdown
                <Badge variant="outline" className="text-[10px] uppercase">Internal — USD</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fabric Area</span>
                    <span>{blindPreview.fabric_area.toFixed(1)} sq in</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chain Length</span>
                    <span>{blindPreview.chain_length.toFixed(1)}&quot;</span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className={blindPreview.costs.cassette_cost === 0 && excludedComponents.includes('cassette') ? 'text-muted-foreground line-through' : ''}>Cassette</span>
                    <span>${blindPreview.costs.cassette_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={blindPreview.costs.tube_cost === 0 && excludedComponents.includes('tube') ? 'text-muted-foreground line-through' : ''}>Tube</span>
                    <span>${blindPreview.costs.tube_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bottom Rail</span>
                    <span>${blindPreview.costs.bottom_rail_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={blindPreview.costs.chain_cost === 0 && excludedComponents.includes('chain') ? 'text-muted-foreground line-through' : ''}>Chain</span>
                    <span>${blindPreview.costs.chain_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fabric</span>
                    <span>${blindPreview.costs.fabric_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fixed (Adapters, Brackets, etc.)</span>
                    <span>${blindPreview.costs.fixed_costs.toFixed(2)}</span>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Blind Total</span>
                  <span>${blindPreview.costs.line_total_usd.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isAdmin && hasAwning && awningPreview && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Awning Cost Breakdown
                <Badge variant="outline" className="text-[10px] uppercase">Internal — USD</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Material Area</span>
                    <span>{awningPreview.material_area.toFixed(1)} sq in</span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Frame</span>
                    <span>${awningPreview.costs.frame_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Material</span>
                    <span>${awningPreview.costs.material_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fixed (Brackets, Arms, Motor)</span>
                    <span>${awningPreview.costs.fixed_cost.toFixed(2)}</span>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Awning Total</span>
                  <span>${awningPreview.costs.line_total_usd.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isAdmin && hasBlind && hasAwning && combinedUsd > 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Combined Cost (USD)</span>
                <span>${combinedUsd.toFixed(2)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Internal supplier cost before markup, conversion, labour, and installation.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
