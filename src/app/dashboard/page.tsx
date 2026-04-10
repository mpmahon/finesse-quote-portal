import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PropertyList } from '@/components/properties/property-list'
import { calculateLineItem } from '@/lib/quote-engine'
import type { Component } from '@/types/database'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'administrator'

  // Admins see all properties, others see their own (enforced by RLS)
  let query = supabase
    .from('properties')
    .select(`
      *,
      profiles(id, first_name, last_name, email),
      rooms(
        id,
        windows(
          id,
          width_inches,
          height_inches,
          mount_type,
          product_id,
          products(components(*))
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (!isAdmin) {
    query = query.eq('user_id', user.id)
  }

  const { data: properties } = await query

  // Calculate totals for each property
  const normalized = (properties || []).map(p => {
    const rooms = (p.rooms || []) as Array<{
      id: string
      windows: Array<{
        width_inches: number
        height_inches: number
        mount_type: 'inside' | 'outside'
        has_blind: boolean
        has_awning: boolean
        product_id: string | null
        products: { components: Component[] } | null
      }>
    }>

    let totalUsd = 0
    let totalWindows = 0
    let priceableWindows = 0
    let configuredWindows = 0
    let noBlindWindows = 0

    for (const room of rooms) {
      for (const w of room.windows || []) {
        totalWindows++
        if (w.has_blind) priceableWindows++
        if (!w.has_blind && !w.has_awning) noBlindWindows++

        if (w.has_blind && w.product_id && w.products?.components?.length) {
          configuredWindows++
          const result = calculateLineItem(
            {
              width_inches: Number(w.width_inches),
              height_inches: Number(w.height_inches),
              mount_type: w.mount_type,
            },
            w.products.components
          )
          totalUsd += result.costs.line_total_usd
        }
      }
    }

    return {
      ...p,
      profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
      room_count: rooms.length,
      window_count: totalWindows,
      priceable_count: priceableWindows,
      configured_count: configuredWindows,
      no_blind_count: noBlindWindows,
      preview_total_usd: totalUsd,
    }
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isAdmin ? 'All Properties' : 'My Properties'}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'View and manage properties across all customers' : 'Manage your properties and generate quotes'}
          </p>
        </div>
        {!isAdmin && (
          <Link href="/dashboard?new=true">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </Link>
        )}
      </div>

      <Suspense>
        <PropertyList properties={normalized} userId={user.id} showCustomer={isAdmin} />
      </Suspense>
    </div>
  )
}
