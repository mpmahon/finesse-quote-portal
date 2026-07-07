import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { WindowConfigurator } from '@/components/windows/window-configurator'
import { ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import { isCustomerRole, isStaffRole } from '@/types/database'
import type { UserRole } from '@/types/database'

export default async function WindowConfigPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string; windowId: string }>
}) {
  const { id, roomId, windowId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: property } = await supabase
    .from('properties')
    .select('name, profiles!user_id(role)')
    .eq('id', id)
    .single()
  if (!property) notFound()

  const { data: room } = await supabase.from('rooms').select('name').eq('id', roomId).single()
  if (!room) notFound()

  const { data: window } = await supabase.from('windows').select('*').eq('id', windowId).single()
  if (!window) notFound()

  const [{ data: products }, { data: awningProducts }, { data: viewerProfile }, { data: pricing }, { data: colourSwatches }] = await Promise.all([
    supabase.from('products').select('*, components(*)').eq('is_active', true).order('make'),
    supabase.from('awning_products').select('*').eq('is_active', true).order('make'),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('pricing_config').select(ESTIMATE_CONFIG_COLUMNS).eq('id', 1).single(),
    supabase.from('colours').select('name, hex_code').eq('is_active', true),
  ])

  const viewerRole = (viewerProfile?.role ?? 'retail_customer') as UserRole
  const isStaff = isStaffRole(viewerRole)

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

  return (
    <div>
      <div className="mb-6">
        <Link href={`/properties/${id}/rooms/${roomId}`} className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to {room.name}
        </Link>
        <h1 className="text-2xl font-bold">Configure: {window.name}</h1>
        <p className="text-muted-foreground">
          {property.name} &gt; {room.name} &gt; {window.name}
        </p>
      </div>

      <WindowConfigurator
        window={window}
        products={products || []}
        awningProducts={awningProducts || []}
        propertyId={id}
        roomId={roomId}
        isStaff={isStaff}
        pricing={pricing}
        customerRole={customerRole}
        colourSwatches={colourSwatches || []}
      />
    </div>
  )
}
