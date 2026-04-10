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

export function WindowConfigurator({
  window: win,
  products,
  awningProducts,
  propertyId,
  roomId,
}: WindowConfiguratorProps) {
  // Blind state
  const [productId, setProductId] = useState(win.product_id || '')
  const [shadeType, setShadeType] = useState(win.shade_type || '')
  const [style, setStyle] = useState(win.style || '')
  const [colour, setColour] = useState(win.colour || '')

  // Awning state
  const [awningProductId, setAwningProductId] = useState(win.awning_product_id || '')
  const [awningColour, setAwningColour] = useState(win.awning_colour || '')

  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const selectedProduct = products.find(p => p.id === productId)
  const selectedAwning = awningProducts.find(p => p.id === awningProductId)

  // Blind dimensions + preview
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
      selectedProduct.components
    )
  }, [selectedProduct, win.width_inches, win.height_inches, win.mount_type])

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

  // Early return: no blind AND no awning
  if (!win.has_blind && !win.has_awning) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <p className="mb-2 text-lg font-medium">This window has no blind or awning</p>
          <p className="max-w-md text-sm text-muted-foreground">
            It will be included on the quote with zero cost. To add a blind or awning, edit the window from the room page and toggle one on.
          </p>
        </CardContent>
      </Card>
    )
  }

  async function handleSave() {
    // Validate what's configured based on toggles
    if (win.has_blind && (!productId || !shadeType || !style || !colour)) {
      toast.error('Please complete blind configuration')
      return
    }
    if (win.has_awning && (!awningProductId || !awningColour)) {
      toast.error('Please complete awning configuration')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const updates = {
      product_id: win.has_blind ? productId : null,
      shade_type: win.has_blind ? shadeType : null,
      style: win.has_blind ? style : null,
      colour: win.has_blind ? colour : null,
      awning_product_id: win.has_awning ? awningProductId : null,
      awning_colour: win.has_awning ? awningColour : null,
    }

    const { error } = await supabase
      .from('windows')
      .update(updates)
      .eq('id', win.id)

    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Window configured successfully')
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
            {win.has_blind && (
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
            {win.has_awning && awningDims && (
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

        {win.has_blind && (
          <Card>
            <CardHeader>
              <CardTitle>Blind Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Make / Model</Label>
                <Select value={productId} onValueChange={v => { setProductId(v ?? ''); setShadeType(''); setStyle(''); setColour('') }}>
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
                </>
              )}
            </CardContent>
          </Card>
        )}

        {win.has_awning && (
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
            (win.has_blind && (!productId || !shadeType || !style || !colour)) ||
            (win.has_awning && (!awningProductId || !awningColour))
          }
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Right: Live Cost Preview */}
      <div className="space-y-6">
        {win.has_blind && (
          <Card>
            <CardHeader>
              <CardTitle>Blind Cost (USD)</CardTitle>
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
                      <span>Cassette</span>
                      <span>${blindPreview.costs.cassette_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tube</span>
                      <span>${blindPreview.costs.tube_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Bottom Rail</span>
                      <span>${blindPreview.costs.bottom_rail_cost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Chain</span>
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
              ) : (
                <p className="text-sm text-muted-foreground">Select a blind to see cost preview.</p>
              )}
            </CardContent>
          </Card>
        )}

        {win.has_awning && (
          <Card>
            <CardHeader>
              <CardTitle>Awning Cost (USD)</CardTitle>
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

        {win.has_blind && win.has_awning && combinedTotal > 0 && (
          <Card className="border-primary/40">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Combined Total (USD)</span>
                <span className="text-primary">${combinedTotal.toFixed(2)}</span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Final quote adds markup, duty, currency conversion, labor, installation, and shipping.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
