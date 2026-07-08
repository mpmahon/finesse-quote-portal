import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { WindowList } from '@/components/windows/window-list'
import { PageBreadcrumb } from '@/components/layout/page-breadcrumb'
import { estimateWindowTtd, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import type { EstimateWindow } from '@/lib/estimates'
import { fetchBlindHierarchy } from '@/lib/blind-hierarchy'
import { isCustomerRole, isStaffRole } from '@/types/database'
import type { UserRole } from '@/types/database'
import { buildStyleQuerySuffix, parseGallerySelection } from '@/lib/gallery-style-query'

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; roomId: string }>
  /** Carries a "Quote from style" selection (see gallery-style-query.ts) through to the window list. Absent on normal visits. */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, roomId } = await params
  const resolvedSearchParams = await searchParams
  const styleQuery = buildStyleQuerySuffix(resolvedSearchParams)
  // Only used to default the "Add Window" dialog's Blind/Awning toggle — the
  // full selection (product/shade/style/colour) is re-parsed at the
  // configurator itself, once we know whether the window already has one.
  const defaultKind = parseGallerySelection(resolvedSearchParams)?.kind
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: property }, { data: viewerProfile }] = await Promise.all([
    supabase
      .from('properties')
      .select('name, profiles!user_id(role, first_name, last_name)')
      .eq('id', id)
      .single(),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])
  if (!property) notFound()

  const isStaff = isStaffRole((viewerProfile?.role ?? 'retail_customer') as UserRole)

  const ownerProfile = Array.isArray(property.profiles)
    ? property.profiles[0] ?? null
    : property.profiles
  const ownerRole: UserRole =
    ownerProfile?.role && isCustomerRole(ownerProfile.role as UserRole)
      ? (ownerProfile.role as UserRole)
      : 'retail_customer'

  // Staff see the owner's name in the breadcrumb; customers viewing their
  // own property don't need to see their own name repeated.
  const ownerName = ownerProfile ? `${ownerProfile.first_name} ${ownerProfile.last_name}` : null
  const propertyCrumbLabel = isStaff && ownerName ? `${ownerName} — ${property.name}` : property.name

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()
  if (!room) notFound()

  const { data: windows, error: windowsError } = await supabase
    .from('windows')
    .select('*, awning_products(*)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (windowsError) {
    throw new Error(`Failed to load windows: ${windowsError.message}`)
  }

  const [{ data: pricing }, hierarchy] = await Promise.all([
    supabase
      .from('pricing_config')
      .select(`${ESTIMATE_CONFIG_COLUMNS}, min_window_size_in, max_window_width_in, max_window_height_in`)
      .eq('id', 1)
      .single(),
    // Batch 11 Part 1: blind pricing lives on blind_styles now — the full
    // hierarchy (inactive included) resolves each window's already-saved
    // style even if it's since been deactivated.
    fetchBlindHierarchy(supabase, { activeOnly: false }),
  ])

  // Per-window TTD estimate via the shared estimate layer — full formula
  // including excluded components, quantity multipliers (this window's own
  // quantity x the room's), and the owner's markup tier. No USD is exposed
  // on this page.
  const windowsWithPricing = (windows || []).map(w => ({
    ...w,
    preview_ttd: pricing
      ? estimateWindowTtd(w as unknown as EstimateWindow, pricing, ownerRole, hierarchy, room.quantity)
      : null,
  }))

  const limits = {
    min_window_size_in: Number(pricing?.min_window_size_in ?? 6),
    max_window_width_in: Number(pricing?.max_window_width_in ?? 180),
    max_window_height_in: Number(pricing?.max_window_height_in ?? 120),
  }

  return (
    <div>
      <div className="mb-6">
        <PageBreadcrumb
          className="mb-2"
          segments={[
            { label: 'Properties', href: '/properties' },
            { label: propertyCrumbLabel, href: `/properties/${id}` },
            { label: room.name },
          ]}
        />
        <h1 className="text-2xl font-bold">{room.name}</h1>
      </div>

      <WindowList
        windows={windowsWithPricing}
        roomId={roomId}
        propertyId={id}
        limits={limits}
        styleQuery={styleQuery}
        defaultKind={defaultKind}
      />
    </div>
  )
}
