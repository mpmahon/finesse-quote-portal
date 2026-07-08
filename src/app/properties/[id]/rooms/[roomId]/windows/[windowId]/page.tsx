import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { WindowConfigurator } from '@/components/windows/window-configurator'
import { PageBreadcrumb } from '@/components/layout/page-breadcrumb'
import { ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import { isCustomerRole, isStaffRole } from '@/types/database'
import type { UserRole } from '@/types/database'
import { parseGallerySelection } from '@/lib/gallery-style-query'
import { fetchBlindHierarchy } from '@/lib/blind-hierarchy'

export default async function WindowConfigPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; roomId: string; windowId: string }>
  /** Carries a "Quote from style" selection (see gallery-style-query.ts) — used only to pre-fill a window that has no configuration of its own yet. Absent on normal visits. */
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id, roomId, windowId } = await params
  const gallerySelection = parseGallerySelection(await searchParams)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: property } = await supabase
    .from('properties')
    .select('name, profiles!user_id(role, first_name, last_name)')
    .eq('id', id)
    .single()
  if (!property) notFound()

  const { data: room } = await supabase.from('rooms').select('name').eq('id', roomId).single()
  if (!room) notFound()

  const { data: window } = await supabase.from('windows').select('*').eq('id', windowId).single()
  if (!window) notFound()

  const [
    { data: awningProducts },
    { data: viewerProfile },
    { data: pricing },
    { data: colourSwatches },
    { data: hardwareRules },
    hierarchy,
  ] = await Promise.all([
    supabase.from('awning_products').select('*').eq('is_active', true).order('make'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('pricing_config').select(ESTIMATE_CONFIG_COLUMNS).eq('id', 1).single(),
    // Legacy flat colours (renamed from `colours` in Batch 7) — used only
    // for awning colour swatch chips now; blind colour swatches come from
    // the hierarchy's own blind_colours.hex_code.
    supabase.from('legacy_colours').select('name, hex_code').eq('is_active', true),
    // Width-based hardware support rules (Batch 7 pre-work) — small,
    // admin-managed table, fetched in full for the live spec preview.
    supabase.from('hardware_size_rules').select('*'),
    // Blind option hierarchy (Batch 7) — active nodes only, this is
    // customer/salesperson-facing selection.
    fetchBlindHierarchy(supabase),
  ])

  const viewerRole = (viewerProfile?.role ?? 'retail_customer') as UserRole
  const isStaff = isStaffRole(viewerRole)
  // Cost breakdown (internal USD) is administrator-only — salesmen see only
  // marked-up TTD retail pricing, same as customers (client feedback,
  // Batch 6 item 6).
  const isAdmin = viewerRole === 'administrator'

  // Live pricing uses the property OWNER's markup tier.
  const ownerProfile = Array.isArray(property.profiles)
    ? property.profiles[0] ?? null
    : property.profiles
  const customerRole: UserRole =
    ownerProfile?.role && isCustomerRole(ownerProfile.role as UserRole)
      ? (ownerProfile.role as UserRole)
      : isCustomerRole(viewerRole)
        ? viewerRole
        : 'retail_customer'

  // Staff see the owner's name in the breadcrumb; customers viewing their
  // own property don't need to see their own name repeated.
  const ownerName = ownerProfile ? `${ownerProfile.first_name} ${ownerProfile.last_name}` : null
  const propertyCrumbLabel = isStaff && ownerName ? `${ownerName} — ${property.name}` : property.name

  return (
    <div>
      <div className="mb-6">
        <PageBreadcrumb
          className="mb-2"
          segments={[
            { label: 'Properties', href: '/properties' },
            { label: propertyCrumbLabel, href: `/properties/${id}` },
            { label: room.name, href: `/properties/${id}/rooms/${roomId}` },
            { label: window.name },
          ]}
        />
        <h1 className="text-2xl font-bold">Configure: {window.name}</h1>
      </div>

      <WindowConfigurator
        window={window}
        awningProducts={awningProducts || []}
        propertyId={id}
        roomId={roomId}
        isAdmin={isAdmin}
        pricing={pricing}
        customerRole={customerRole}
        colourSwatches={colourSwatches || []}
        hierarchy={hierarchy}
        hardwareRules={hardwareRules || []}
        gallerySelection={gallerySelection}
      />
    </div>
  )
}
