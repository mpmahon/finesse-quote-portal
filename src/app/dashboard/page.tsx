import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PropertyList } from '@/components/properties/property-list'

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
    .select('*, rooms(count), profiles(id, first_name, last_name, email)')
    .order('created_at', { ascending: false })

  if (!isAdmin) {
    query = query.eq('user_id', user.id)
  }

  const { data: properties } = await query

  const normalized = (properties || []).map(p => ({
    ...p,
    profiles: Array.isArray(p.profiles) ? p.profiles[0] ?? null : p.profiles,
  }))

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
