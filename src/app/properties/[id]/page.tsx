import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { RoomList } from '@/components/rooms/room-list'
import { GenerateQuoteButton } from '@/components/quotes/generate-quote-button'
import { calculateLineItem, calculateAwningLineItem } from '@/lib/quote-engine'
import type { AwningProduct, Component } from '@/types/database'

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single()

  if (!property) notFound()

  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select(`
      *,
      windows(
        id,
        width_inches,
        height_inches,
        mount_type,
        has_blind,
        has_awning,
        product_id,
        awning_product_id,
        products(components(*)),
        awning_products(*)
      )
    `)
    .eq('property_id', id)
    .order('created_at', { ascending: true })

  if (roomsError) {
    throw new Error(`Failed to load rooms: ${roomsError.message}`)
  }

  // Calculate per-room totals based on configured windows
  const roomsWithTotals = (rooms || []).map(room => {
    const windows = (room.windows || []) as Array<{
      width_inches: number
      height_inches: number
      mount_type: 'inside' | 'outside'
      has_blind: boolean
      has_awning: boolean
      product_id: string | null
      awning_product_id: string | null
      products: { components: Component[] } | null
      awning_products: AwningProduct | null
    }>

    let totalUsd = 0
    let configuredCount = 0
    let priceableCount = 0
    let noBlindCount = 0

    for (const w of windows) {
      const needsConfig = w.has_blind || w.has_awning
      if (needsConfig) priceableCount++
      if (!w.has_blind && !w.has_awning) noBlindCount++

      let windowConfigured = false

      if (w.has_blind && w.product_id && w.products?.components?.length) {
        const result = calculateLineItem(
          {
            width_inches: Number(w.width_inches),
            height_inches: Number(w.height_inches),
            mount_type: w.mount_type,
          },
          w.products.components
        )
        totalUsd += result.costs.line_total_usd
        windowConfigured = true
      }

      if (w.has_awning && w.awning_product_id && w.awning_products) {
        const result = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
        totalUsd += result.costs.line_total_usd
        windowConfigured = true
      }

      // A window counts as "configured" only when all its toggled features are set
      const blindOk = !w.has_blind || !!w.product_id
      const awningOk = !w.has_awning || !!w.awning_product_id
      if (needsConfig && blindOk && awningOk && windowConfigured) {
        configuredCount++
      }
    }

    return {
      ...room,
      window_count: windows.length,
      configured_count: configuredCount,
      priceable_count: priceableCount,
      no_blind_count: noBlindCount,
      preview_total_usd: totalUsd,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Properties
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{property.name}</h1>
            {property.address && <p className="text-muted-foreground">{property.address}</p>}
          </div>
          <GenerateQuoteButton propertyId={id} />
        </div>
      </div>

      <RoomList rooms={roomsWithTotals} propertyId={id} />
    </div>
  )
}
