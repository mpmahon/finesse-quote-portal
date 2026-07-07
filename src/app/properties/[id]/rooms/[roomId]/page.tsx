import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { WindowList } from '@/components/windows/window-list'
import { estimateWindowTtd, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import type { EstimateWindow } from '@/lib/estimates'
import { isCustomerRole } from '@/types/database'
import type { UserRole } from '@/types/database'

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
    .select('name, profiles!user_id(role)')
    .eq('id', id)
    .single()
  if (!property) notFound()

  const ownerProfile = Array.isArray(property.profiles)
    ? property.profiles[0] ?? null
    : property.profiles
  const ownerRole: UserRole =
    ownerProfile?.role && isCustomerRole(ownerProfile.role as UserRole)
      ? (ownerProfile.role as UserRole)
      : 'retail_customer'

  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', roomId)
    .single()
  if (!room) notFound()

  const { data: windows, error: windowsError } = await supabase
    .from('windows')
    .select('*, products(id, make, model, components(*)), awning_products(*)')
    .eq('room_id', roomId)
    .order('created_at', { ascending: true })

  if (windowsError) {
    throw new Error(`Failed to load windows: ${windowsError.message}`)
  }

  const { data: pricing } = await supabase
    .from('pricing_config')
    .select(`${ESTIMATE_CONFIG_COLUMNS}, min_window_size_in, max_window_width_in, max_window_height_in`)
    .eq('id', 1)
    .single()

  // Per-window TTD estimate via the shared estimate layer — full formula
  // including excluded components and the owner's markup tier. No USD is
  // exposed on this page.
  const windowsWithPricing = (windows || []).map(w => ({
    ...w,
    preview_ttd: pricing
      ? estimateWindowTtd(w as unknown as EstimateWindow, pricing, ownerRole)
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
        limits={limits}
      />
    </div>
  )
}
