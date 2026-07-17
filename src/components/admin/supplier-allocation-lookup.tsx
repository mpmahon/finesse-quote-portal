'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Star } from 'lucide-react'
import { SupplierTargetPicker, BLANK_TARGET, resolveTargetIds, isTargetComplete, type TargetPickerValue } from '@/components/admin/supplier-target-picker'
import { targetKey } from '@/lib/supplier-links'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Supplier, SupplierLink, SupplierProduct } from '@/types/database'

interface SupplierAllocationLookupProps {
  hierarchy: BlindHierarchy
  awningProducts: AwningProduct[]
  supplierLinks: SupplierLink[]
  supplierProducts: SupplierProduct[]
  suppliers: Supplier[]
}

/**
 * Reverse ("style-centric") view of the allocation data: pick a Finesse
 * blind style/colour/awning product and see every supplier item allocated
 * to it, primary source first. Complements {@link SupplierLinkManager}'s
 * supplier-product-centric view — same {@link SupplierTargetPicker} so
 * target selection behaves identically in both places.
 */
export function SupplierAllocationLookup({ hierarchy, awningProducts, supplierLinks, supplierProducts, suppliers }: SupplierAllocationLookupProps) {
  const [target, setTarget] = useState<TargetPickerValue>(BLANK_TARGET)

  const matches = useMemo(() => {
    if (!isTargetComplete(target)) return []
    const key = targetKey(resolveTargetIds(target))
    return supplierLinks
      .filter(l => targetKey(l) === key)
      .map(link => {
        const product = supplierProducts.find(p => p.id === link.supplier_product_id)
        const supplier = product ? suppliers.find(s => s.id === product.supplier_id) : undefined
        return { link, product, supplier }
      })
      .sort((a, b) => Number(b.link.is_primary_source) - Number(a.link.is_primary_source))
  }, [target, supplierLinks, supplierProducts, suppliers])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <SupplierTargetPicker hierarchy={hierarchy} awningProducts={awningProducts} value={target} onChange={setTarget} />
        </CardContent>
      </Card>

      {isTargetComplete(target) && (
        <Card>
          <CardContent className="pt-6">
            {matches.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No supplier is currently allocated to this target.</p>
            ) : (
              <div className="space-y-2">
                {/* Wrapping rows rather than a fixed-column table, so supplier,
                    item, cost, colour code and source never force horizontal
                    scroll on narrow widths. */}
                {matches.map(({ link, product, supplier }) => (
                  <div
                    key={link.id}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">
                        {product?.name ?? <span className="font-normal text-muted-foreground">Unknown item</span>}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">
                        {supplier?.name ?? 'Unknown supplier'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:shrink-0 sm:justify-end">
                      <span className="whitespace-nowrap">
                        {product?.cost_price != null
                          ? `$${Number(product.cost_price).toFixed(4)} ${product.currency}${product.unit_of_measure ? ` / ${product.unit_of_measure}` : ''}`
                          : <span className="text-muted-foreground">No cost set</span>}
                      </span>
                      <span className="whitespace-nowrap">
                        <span className="text-muted-foreground">Code </span>
                        {link.supplier_colour_code ?? '—'}
                      </span>
                      {link.is_primary_source ? (
                        <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>
                      ) : (
                        <Badge variant="outline">Alternate</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
