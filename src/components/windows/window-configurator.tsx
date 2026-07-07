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
} from '@/lib/quote-engine'
import { markupPctForRole } from '@/lib/estimates'
import type { EstimateConfig } from '@/lib/estimates'
import { MOUNT_TYPE_LABELS } from '@/lib/constants'
import { WindowDiagram } from '@/components/windows/window-diagram'
import type { Window as WindowType, Product, Component, AwningProduct, UserRole } from '@/types/database'

interface ColourSwatch {
  name: string
  hex_code: string | null
}

interface WindowConfiguratorProps {
  window: WindowType
  products: (Product & { components: Component[] })[]
  awningProducts: AwningProduct[]
  propertyId: string
  roomId: string
  /** Staff see the internal USD component breakdown; customers never do. */
  isStaff: boolean
  /** Pricing config for the live TTD estimate. Null only if the config row failed to load. */
  pricing: EstimateConfig | null
  /** The property owner's customer type — drives the markup for the live estimate. */
  customerRole: UserRole
  /** Catalog colours with optional hex codes for swatch chips. */
  colourSwatches: ColourSwatch[]
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
function getHardwareGroups(components: Component[]): HardwareGroup[] {
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
  products,
  awningProducts,
  propertyId,
  roomId,
  isStaff,
  pricing,
  customerRole,
  colourSwatches,
}: WindowConfiguratorProps) {
  // Feature toggles
  const [hasBlind, setHasBlind] = useState(win.has_blind)
  const [hasAwning, setHasAwning] = useState(win.has_awning)

  // Blind state
  const [productId, setProductId] = useState(win.product_id || '')
  const [shadeType, setShadeType] = useState(win.shade_type || '')
  const [style, setStyle] = useState(win.style || '')
  const [colour, setColour] = useState(win.colour || '')

  // Hardware exclusion state — initialised from the window's stored value.
  // Each entry is a lowercase component name that has been UNCHECKED.
  const [excludedComponents, setExcludedComponents] = useState<string[]>(
    win.excluded_components || []
  )

  // Awning state
  const [awningProductId, setAwningProductId] = useState(win.awning_product_id || '')
  const [awningColour, setAwningColour] = useState(win.awning_colour || '')

  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const selectedProduct = products.find(p => p.id === productId)
  const selectedAwning = awningProducts.find(p => p.id === awningProductId)

  // Map catalog colour name → hex for swatch chips + the diagram.
  const hexByColour = useMemo(() => {
    const map: Record<string, string> = {}
    for (const c of colourSwatches) {
      if (c.hex_code) map[c.name.toLowerCase()] = c.hex_code
    }
    return map
  }, [colourSwatches])
  const selectedHex = colour ? hexByColour[colour.toLowerCase()] ?? null : null

  // Hardware component groups for the selected product
  const hardwareGroups = useMemo(
    () => (selectedProduct ? getHardwareGroups(selectedProduct.components) : []),
    [selectedProduct]
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

  const blindPreview = useMemo(() => {
    if (!selectedProduct) return null
    return calculateLineItem(
      {
        width_inches: Number(win.width_inches),
        height_inches: Number(win.height_inches),
        mount_type: win.mount_type,
      },
      selectedProduct.components,
      excludedComponents
    )
  }, [selectedProduct, win.width_inches, win.height_inches, win.mount_type, excludedComponents])

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

  async function handleSave() {
    if (hasBlind && (!productId || !shadeType || !style || !colour)) {
      toast.error('Please complete blind configuration')
      return
    }
    if (hasAwning && (!awningProductId || !awningColour)) {
      toast.error('Please complete awning configuration')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const updates = {
      has_blind: hasBlind,
      has_awning: hasAwning,
      product_id: hasBlind ? productId : null,
      shade_type: hasBlind ? shadeType : null,
      style: hasBlind ? style : null,
      colour: hasBlind ? colour : null,
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
            {hasBlind && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="secondary">Blind {blindDims.blind_width}&quot; × {blindDims.blind_height}&quot;</Badge>
                  {blindPreview && (
                    <Badge variant="secondary">Chain {blindPreview.chain_length.toFixed(1)}&quot;</Badge>
                  )}
                </div>
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
              {/* Product selector — full width since the label text is long */}
              <div className="space-y-2">
                <Label>Make / Model</Label>
                <Select value={productId} onValueChange={v => { setProductId(v ?? ''); setShadeType(''); setStyle(''); setColour(''); setExcludedComponents([]) }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a product">
                      {(value: string) => {
                        const p = products.find(x => x.id === value)
                        return p ? `${p.make} ${p.model}` : 'Select a product'
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.make} {p.model}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedProduct && (
                <>
                  {/* Options: shade type + style selects, colour as swatch chips */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Shade Type</Label>
                      <Select value={shadeType} onValueChange={v => setShadeType(v ?? '')}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {selectedProduct.shade_types.map(st => (
                            <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Style</Label>
                      <Select value={style} onValueChange={v => setStyle(v ?? '')}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {selectedProduct.styles.map(s => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Colour</Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedProduct.colours.map(c => {
                        const hex = hexByColour[c.toLowerCase()]
                        const active = colour === c
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setColour(c)}
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

                  {/* Hardware — grouped by category, multi-column layout */}
                  {hardwareGroups.length > 0 && (
                    <>
                      <Separator />
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
                    </>
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
            (hasBlind && (!productId || !shadeType || !style || !colour)) ||
            (hasAwning && (!awningProductId || !awningColour))
          }
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Right: diagram + live price. USD breakdown is staff-only. */}
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

        {isStaff && hasBlind && blindPreview && (
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

        {isStaff && hasAwning && awningPreview && (
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

        {isStaff && hasBlind && hasAwning && combinedUsd > 0 && (
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
