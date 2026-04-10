import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotesListClient } from '@/components/quotes/quotes-list-client'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, created_at, expires_at, total_ttd, status, properties(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const normalized = (quotes || []).map(q => ({
    ...q,
    properties: Array.isArray(q.properties) ? q.properties[0] ?? null : q.properties,
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Quotes</h1>
      <QuotesListClient quotes={normalized} />
    </div>
  )
}
