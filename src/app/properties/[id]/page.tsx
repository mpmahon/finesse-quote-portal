import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { RoomList } from '@/components/rooms/room-list'
import { GenerateQuoteButton } from '@/components/quotes/generate-quote-button'
import { estimateWindowsTotals, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import type { EstimateWindow } from '@/lib/estimates'
import { isCustomerRole } from '@/types/database'
import type { UserRole } from '@/types/database'

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: property } = await supabase
    .from('properties')
    .select('*, profiles!user_id(role)')
    .eq('id', id)
    .single()

  if (!property) notFound()

  // Room estimates use the property OWNER's markup tier (WS1 §5.6).
  const ownerProfile = Array.isArray(property.profiles)
    ? property.profiles[0] ?? null
    : property.profiles
  const ownerRole: UserRole =
    ownerProfile?.role && isCustomerRole(ownerProfile.role as UserRole)
      ? (ownerProfile.role as UserRole)
      : 'retail_customer'

  const { data: pricing } = await supabase
    .from('pricing_config')
    .select(ESTIMATE_CONFIG_COLUMNS)
    .eq('id', 1)
    .single()

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
        excluded_components,
        products(components(*)),
        awning_products(*)
      )
    `)
    .eq('property_id', id)
    .order('created_at', { ascending: true })

  if (roomsError) {
    throw new Error(`Failed to load rooms: ${roomsError.message}`)
  }

  // Per-room totals via the shared estimate layer — full formula, matches a
  // generated quote to the cent.
  const roomsWithTotals = (rooms || []).map(room => {
    const windows = (room.windows || []) as EstimateWindow[]

    let configuredCount = 0
    let priceableCount = 0
    let noBlindCount = 0

    for (const w of windows) {
      const needsConfig = w.has_blind || w.has_awning
      if (needsConfig) priceableCount++
      if (!w.has_blind && !w.has_awning) noBlindCount++
      const blindOk = !w.has_blind || !!w.product_id
      const awningOk = !w.has_awning || !!w.awning_product_id
      if (needsConfig && blindOk && awningOk) configuredCount++
    }

    const totals = pricing ? estimateWindowsTotals(windows, pricing, ownerRole) : null

    return {
      ...room,
      window_count: windows.length,
      configured_count: configuredCount,
      priceable_count: priceableCount,
      no_blind_count: noBlindCount,
      preview_total_ttd: totals?.grand_total_ttd ?? 0,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <Link href="/properties" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
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
