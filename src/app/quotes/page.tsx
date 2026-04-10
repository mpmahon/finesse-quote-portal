import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotesListClient } from '@/components/quotes/quotes-list-client'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'administrator'

  let query = supabase
    .from('quotes')
    .select('id, created_at, expires_at, total_ttd, status, properties(name), profiles(id, first_name, last_name, email)')
    .order('created_at', { ascending: false })

  if (!isAdmin) {
    query = query.eq('user_id', user.id)
  }

  const { data: quotes } = await query

  const normalized = (quotes || []).map(q => ({
    ...q,
    properties: Array.isArray(q.properties) ? q.properties[0] ?? null : q.properties,
    profiles: Array.isArray(q.profiles) ? q.profiles[0] ?? null : q.profiles,
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">
        {isAdmin ? 'All Quotes' : 'My Quotes'}
      </h1>
      <QuotesListClient quotes={normalized} showCustomer={isAdmin} />
    </div>
  )
}
