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
import { calculateBlindDimensions, calculateLineItem } from '@/lib/quote-engine'
import { MOUNT_TYPE_LABELS } from '@/lib/constants'
import type { Window as WindowType, Product, Component } from '@/types/database'

interface WindowConfiguratorProps {
  window: WindowType
  products: (Product & { components: Component[] })[]
  propertyId: string
  roomId: string
}

export function WindowConfigurator({ window: win, products, propertyId, roomId }: WindowConfiguratorProps) {
  const [productId, setProductId] = useState(win.product_id || '')
  const [shadeType, setShadeType] = useState(win.shade_type || '')
  const [style, setStyle] = useState(win.style || '')
  const [colour, setColour] = useState(win.colour || '')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const selectedProduct = products.find(p => p.id === productId)

  const dims = useMemo(() =>
    calculateBlindDimensions({
      width_inches: Number(win.width_inches),
      height_inches: Number(win.height_inches),
      mount_type: win.mount_type,
    }), [win.width_inches, win.height_inches, win.mount_type]
  )

  const costPreview = useMemo(() => {
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

  async function handleSave() {
    if (!productId || !shadeType || !style || !colour) {
      toast.error('Please complete all selections')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('windows')
      .update({ product_id: productId, shade_type: shadeType, style, colour })
      .eq('id', win.id)

    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Window configured successfully')
    setLoading(false)
    router.push(`/properties/${propertyId}/rooms/${roomId}`)
    router.refresh()
  }

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
            <Separator />
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Blind Width:</span>{' '}
                <span className="font-medium">{dims.blind_width}&quot;</span>
              </div>
              <div>
                <span className="text-muted-foreground">Blind Height:</span>{' '}
                <span className="font-medium">{dims.blind_height}&quot;</span>
              </div>
            </div>
          </CardContent>
        </Card>

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

            <Button onClick={handleSave} className="w-full" disabled={loading || !productId || !shadeType || !style || !colour}>
              {loading ? 'Saving...' : 'Save Configuration'}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right: Live Cost Preview */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Cost Preview (USD)</CardTitle>
          </CardHeader>
          <CardContent>
            {costPreview ? (
              <div className="space-y-3">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fabric Area</span>
                    <span>{costPreview.fabric_area.toFixed(1)} sq in</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Chain Length</span>
                    <span>{costPreview.chain_length.toFixed(1)}&quot;</span>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Cassette</span>
                    <span>${costPreview.costs.cassette_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tube</span>
                    <span>${costPreview.costs.tube_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Bottom Rail</span>
                    <span>${costPreview.costs.bottom_rail_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Chain</span>
                    <span>${costPreview.costs.chain_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fabric</span>
                    <span>${costPreview.costs.fabric_cost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fixed (Adapters, Brackets, etc.)</span>
                    <span>${costPreview.costs.fixed_costs.toFixed(2)}</span>
                  </div>
                </div>
                <Separator />
                <div className="flex justify-between text-base font-semibold">
                  <span>Window Total (USD)</span>
                  <span>${costPreview.costs.line_total_usd.toFixed(2)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Final quote will include markup, duty, currency conversion, labor, installation, and shipping.
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a product to see cost preview.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
