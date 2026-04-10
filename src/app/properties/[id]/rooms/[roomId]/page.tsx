import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { WindowList } from '@/components/windows/window-list'
import { calculateLineItem, calculateAwningLineItem } from '@/lib/quote-engine'
import type { AwningProduct, Component } from '@/types/database'

export default async function RoomPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>
}) {
  const { id, roomId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: property } = await supabase
    .from('properties')
    .select('name')
    .eq('id', id)
    .single()
  if (!property) notFound()

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()
  if (!room) notFound()

  const { data: windows } = await supabase
    .from('windows')
    .select('*, products(id, make, model, components(*)), awning_products(*)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  const { data: products } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('make')

  // Pre-calculate preview pricing for each configured window.
  // Sums blind + awning costs where applicable.
  const windowsWithPricing = (windows || []).map(w => {
    let previewUsd: number | null = null

    if (w.has_blind && w.product_id && w.products && 'components' in w.products) {
      const components = (w.products as unknown as { components: Component[] }).components
      if (components && components.length > 0) {
        const result = calculateLineItem(
          {
            width_inches: Number(w.width_inches),
            height_inches: Number(w.height_inches),
            mount_type: w.mount_type,
          },
          components
        )
        previewUsd = (previewUsd || 0) + result.costs.line_total_usd
      }
    }

    if (w.has_awning && w.awning_product_id && w.awning_products) {
      const awningProduct = w.awning_products as unknown as AwningProduct
      const result = calculateAwningLineItem(Number(w.width_inches), awningProduct)
      previewUsd = (previewUsd || 0) + result.costs.line_total_usd
    }

    return { ...w, preview_usd: previewUsd }
  })

  return (
    <div>
      <div className="mb-6">
        <Link href={`/properties/${id}`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to {property.name}
        </Link>
        <h1 className="text-2xl font-bold">{room.name}</h1>
      </div>

      <WindowList
        windows={windowsWithPricing}
        roomId={roomId}
        propertyId={id}
        products={products || []}
      />
    </div>
  )
}
