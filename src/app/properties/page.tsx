import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PropertyList } from '@/components/properties/property-list'
import { calculateLineItem, calculateAwningLineItem } from '@/lib/quote-engine'
import { isStaffRole } from '@/types/database'
import type { AwningProduct, Component, UserRole } from '@/types/database'

/**
 * Properties page — the primary landing view for customers, salesmen, and admins.
 *
 * Loads the viewer's visible properties (RLS-scoped), computes a rough per-property
 * TTD total from configured windows, and renders {@link PropertyList}. Staff
 * (salesman + administrator) also receives a list of existing customers so the
 * "Add Property" dialog can offer a customer picker.
 */
export default async function PropertiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role ?? 'retail_customer') as UserRole
  const isStaff = isStaffRole(role)
  const isAdmin = role === 'administrator'

  // Pull exchange_rate once so the list cards can display an estimate in TTD
  // without leaking USD into the customer-facing UI. Exchange rate is kept in
  // the DB but is never shown as a number (per Batch 1 UI-hiding rules).
  const { data: pricing } = await supabase
    .from('pricing_config')
    .select('exchange_rate')
    .eq('id', 1)
    .single()
  const exchangeRate = Number(pricing?.exchange_rate ?? 7)

  // Staff needs the full customer list for the Add-Property customer picker.
  // Customers don't see the picker, so skip the query for them.
  let customers: Array<{
    id: string
    first_name: string
    last_name: string
    email: string
    role: UserRole
  }> = []
  if (isStaff) {
    const { data: customerRows } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email, role')
      .in('role', ['retail_customer', 'wholesale_customer'])
      .order('last_name', { ascending: true })
    customers = (customerRows ?? []).map(c => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      role: c.role as UserRole,
    }))
  }

  // Staff (salesman + admin) and customers all see all of their visible properties
  // (RLS-scoped). Admins and salesmen see everything; customers see their own.
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
          has_blind,
          has_awning,
          product_id,
          awning_product_id,
          products(components(*)),
          awning_products(*)
        )
      )
    `)
    .order('created_at', { ascending: false })

  if (!isStaff) {
    query = query.eq('user_id', user.id)
  }

  const { data: properties, error: propertiesError } = await query
  if (propertiesError) {
    throw new Error(`Failed to load properties: ${propertiesError.message}`)
  }

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
        awning_product_id: string | null
        products: { components: Component[] } | null
        awning_products: AwningProduct | null
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
        const needsConfig = w.has_blind || w.has_awning
        if (needsConfig) priceableWindows++
        if (!w.has_blind && !w.has_awning) noBlindWindows++

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
        }

        if (w.has_awning && w.awning_product_id && w.awning_products) {
          const result = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
          totalUsd += result.costs.line_total_usd
        }

        const blindOk = !w.has_blind || !!w.product_id
        const awningOk = !w.has_awning || !!w.awning_product_id
        if (needsConfig && blindOk && awningOk) configuredWindows++
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
      // Rough TTD estimate for the card. Pre-markup. Batch 4 will refine.
      preview_total_ttd: totalUsd * exchangeRate,
    }
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {isStaff ? 'All Properties' : 'My Properties'}
          </h1>
          <p className="text-muted-foreground">
            {isStaff
              ? 'View and manage properties across all customers'
              : 'Manage your properties and generate quotes'}
          </p>
        </div>
        <Link href="/properties?new=true">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Add Property
          </Button>
        </Link>
      </div>

      <Suspense>
        <PropertyList
          properties={normalized}
          userId={user.id}
          isStaff={isStaff}
          showCustomer={isAdmin || isStaff}
          customers={customers}
        />
      </Suspense>
    </div>
  )
}
