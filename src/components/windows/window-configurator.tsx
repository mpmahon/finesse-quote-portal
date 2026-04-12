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
import {
  calculateBlindDimensions,
  calculateLineItem,
  calculateAwningLineItem,
  calculateAwningDimensions,
} from '@/lib/quote-engine'
import { MOUNT_TYPE_LABELS } from '@/lib/constants'
import type { Window as WindowType, Product, Component, AwningProduct } from '@/types/database'

interface WindowConfiguratorProps {
  window: WindowType
  products: (Product & { components: Component[] })[]
  awningProducts: AwningProduct[]
  propertyId: string
  roomId: string
}

/**
 * Identifies unique hardware component names from a product's component list.
 * Hardware = everything except `fabric`. These drive the checkboxes.
 */
function getHardwareNames(components: Component[]): string[] {
  const seen = new Set<string>()
  const names: string[] = []
  for (const c of components) {
    if (c.name === 'fabric') continue
    const key = c.name.toLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      names.push(c.name)
    }
  }
  return names
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

  // Hardware component names for the selected product
  const hardwareNames = useMemo(
    () => (selectedProduct ? getHardwareNames(selectedProduct.components) : []),
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

  const combinedTotal =
    (blindPreview?.costs.line_total_usd || 0) +
    (awningPreview?.costs.line_total_usd || 0)

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
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Blind Width:</span>{' '}
                    <span className="font-medium">{blindDims.blind_width}&quot;</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Blind Height:</span>{' '}
                    <span className="font-medium">{blindDims.blind_height}&quot;</span>
                  </div>
                </div>
              </>
            )}
            {hasAwning && awningDims && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Awning Width:</span>{' '}
                    <span className="font-medium">{awningDims.awning_width}&quot;</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Awning Depth:</span>{' '}
                    <span className="font-medium">{awningDims.awning_depth}&quot;</span>
                  </div>
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
                  <div className="space-y-2">
                    <Label>Shade Type</Label>
                    <Select value={shadeType} onValueChange={v => setShadeType(v ?? '')}>
                      <SelectTrigger><SelectValue placeholder="Select shade type" /></SelectTrigger>
                      <SelectContent>
                        {selectedProduct.shade_types.map(st => (
                          <SelectItem key={st} value={st} className="capitalize">{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Style</Label>
                    <Select value={style} onValueChange={v => setStyle(v ?? '')}>
                      <SelectTrigger><SelectValue placeholder="Select style" /></SelectTrigger>
                      <SelectContent>
                        {selectedProduct.styles.map(s => (
                          <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Colour</Label>
                    <Select value={colour} onValueChange={v => setColour(v ?? '')}>
                      <SelectTrigger><SelectValue placeholder="Select colour" /></SelectTrigger>
                      <SelectContent>
                        {selectedProduct.colours.map(c => (
                          <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Hardware component checkboxes */}
                  {hardwareNames.length > 0 && (
                    <div className="space-y-2">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        Hardware
                      </Label>
                      <div className="space-y-1.5">
                        {hardwareNames.map(name => {
                          const isExcluded = excludedComponents.includes(name.toLowerCase())
                          return (
                            <label
                              key={name}
                              className="flex items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-accent/50 cursor-pointer"
                            >
                              <Checkbox
                                checked={!isExcluded}
                                onCheckedChange={() => toggleComponent(name)}
                              />
                              <span className={isExcluded ? 'text-muted-foreground line-through' : ''}>
                                {formatComponentName(name)}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      {excludedComponents.length > 0 && (
                        <p className="text-xs italic text-muted-foreground">
                          {excludedComponents.map(n => formatComponentName(n)).join(', ')} not included
                        </p>
                      )}
                    </div>
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
                      <Select value={awningColour} onValueChange={v => setAwningColour(v ?? '')}>
                        <SelectTrigger><SelectValue placeholder="Select colour" /></SelectTrigger>
                        <SelectContent>
                          {selectedAwning.colours.map(c => (
                            <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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

      {/* Right: Live Cost Preview — internal/staff view only in future; for now still shows USD breakdown */}
      <div className="space-y-6">
        {hasBlind && (
          <Card>
            <CardHeader>
              <CardTitle>Blind Cost Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {blindPreview ? (
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
                  {blindPreview.excluded_names.length > 0 && (
                    <p className="text-xs italic text-muted-foreground">
                      {blindPreview.excluded_names.map(n => formatComponentName(n)).join(', ')} not included
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a blind to see cost preview.</p>
              )}
            </CardContent>
          </Card>
        )}

        {hasAwning && (
          <Card>
            <CardHeader>
              <CardTitle>Awning Cost Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {awningPreview ? (
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
              ) : (
                <p className="text-sm text-muted-foreground">Select an awning to see cost preview.</p>
              )}
            </CardContent>
          </Card>
        )}

        {hasBlind && hasAwning && combinedTotal > 0 && (
          <Card className="border-primary/40">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Combined Total (USD)</span>
                <span className="text-primary">${combinedTotal.toFixed(2)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Final quote applies markup, currency conversion, labour, and installation.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
