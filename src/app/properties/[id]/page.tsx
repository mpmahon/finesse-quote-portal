import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { RoomList } from '@/components/rooms/room-list'
import { GenerateQuoteButton } from '@/components/quotes/generate-quote-button'
import { PageBreadcrumb } from '@/components/layout/page-breadcrumb'
import { estimateWindowsTotals, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import type { EstimateWindow } from '@/lib/estimates'
import { isCustomerRole, isStaffRole } from '@/types/database'
import type { UserRole } from '@/types/database'
import { buildStyleQuerySuffix } from '@/lib/gallery-style-query'

export default async function PropertyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** Carries a "Quote from style" selection (see gallery-style-query.ts) through to the room list. Absent on normal visits. */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const styleQuery = buildStyleQuerySuffix(await searchParams)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: property }, { data: viewerProfile }] = await Promise.all([
    supabase
      .from('properties')
      .select('*, profiles!user_id(role, first_name, last_name)')
      .eq('id', id)
      .single(),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])

  if (!property) notFound()

  const isStaff = isStaffRole((viewerProfile?.role ?? 'retail_customer') as UserRole)

  // Room estimates use the property OWNER's markup tier (WS1 §5.6).
  const ownerProfile = Array.isArray(property.profiles)
    ? property.profiles[0] ?? null
    : property.profiles
  const ownerRole: UserRole =
    ownerProfile?.role && isCustomerRole(ownerProfile.role as UserRole)
      ? (ownerProfile.role as UserRole)
      : 'retail_customer'

  // Staff see the owner's name in the breadcrumb trail; customers viewing
  // their own property never see it (it would just be redundant with them).
  const ownerName = ownerProfile ? `${ownerProfile.first_name} ${ownerProfile.last_name}` : null
  const propertyCrumbLabel = isStaff && ownerName ? `${ownerName} — ${property.name}` : property.name

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
        <PageBreadcrumb
          className="mb-2"
          segments={[
            { label: 'Properties', href: '/properties' },
            { label: propertyCrumbLabel },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{property.name}</h1>
            {property.address && <p className="text-muted-foreground">{property.address}</p>}
          </div>
          <GenerateQuoteButton propertyId={id} />
        </div>
      </div>

      <RoomList rooms={roomsWithTotals} propertyId={id} styleQuery={styleQuery} />
    </div>
  )
}
