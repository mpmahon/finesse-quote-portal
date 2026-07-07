import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PropertyList } from '@/components/properties/property-list'
import { estimateWindowsTotals, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import type { EstimateWindow } from '@/lib/estimates'
import { isStaffRole, isCustomerRole } from '@/types/database'
import type { UserRole } from '@/types/database'

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

  // Pull the pricing columns the shared estimate layer needs so card totals
  // match a freshly generated quote to the cent (WS1 §5.6). No USD or raw
  // rate is ever rendered — only the final TTD figure.
  const { data: pricing } = await supabase
    .from('pricing_config')
    .select(ESTIMATE_CONFIG_COLUMNS)
    .eq('id', 1)
    .single()

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
  // `profiles!user_id(...)` disambiguates the join — properties now has two
  // FKs to profiles (user_id = owner, created_by = staff who created on
  // their behalf). PostgREST rejects the ambiguous embed shape otherwise.
  let query = supabase
    .from('properties')
    .select(`
      *,
      profiles!user_id(id, first_name, last_name, email, role),
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
          excluded_components,
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

  // Calculate totals for each property via the shared estimate layer.
  const normalized = (properties || []).map(p => {
    const rooms = (p.rooms || []) as Array<{ id: string; windows: EstimateWindow[] }>
    const owner = Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles

    let totalWindows = 0
    let priceableWindows = 0
    let configuredWindows = 0
    let noBlindWindows = 0
    const allWindows: EstimateWindow[] = []

    for (const room of rooms) {
      for (const w of room.windows || []) {
        totalWindows++
        allWindows.push(w)
        const needsConfig = w.has_blind || w.has_awning
        if (needsConfig) priceableWindows++
        if (!w.has_blind && !w.has_awning) noBlindWindows++
        const blindOk = !w.has_blind || !!w.product_id
        const awningOk = !w.has_awning || !!w.awning_product_id
        if (needsConfig && blindOk && awningOk) configuredWindows++
      }
    }

    // Markup depends on the property OWNER's customer type — staff see the
    // owner's pricing; customers viewing their own list see their own.
    const ownerRole: UserRole =
      owner?.role && isCustomerRole(owner.role as UserRole)
        ? (owner.role as UserRole)
        : isCustomerRole(role)
          ? role
          : 'retail_customer'

    const totals = pricing
      ? estimateWindowsTotals(allWindows, pricing, ownerRole)
      : null

    return {
      ...p,
      profiles: owner,
      room_count: rooms.length,
      window_count: totalWindows,
      priceable_count: priceableWindows,
      configured_count: configuredWindows,
      no_blind_count: noBlindWindows,
      // Full-formula TTD estimate — matches a generated quote to the cent.
      preview_total_ttd: totals?.grand_total_ttd ?? 0,
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
