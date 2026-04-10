import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QuotesListClient } from '@/components/quotes/quotes-list-client'
import { computeStaleness, buildProductLatestMap } from '@/lib/quote-staleness'

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

  const [
    { data: quotes },
    { data: config },
    { data: components },
  ] = await Promise.all([
    (() => {
      let query = supabase
        .from('quotes')
        .select(`
          id,
          created_at,
          expires_at,
          total_ttd,
          status,
          properties(name),
          profiles(id, first_name, last_name, email),
          quote_line_items(product_id)
        `)
        .order('created_at', { ascending: false })
      if (!isAdmin) query = query.eq('user_id', user.id)
      return query
    })(),
    supabase.from('pricing_config').select('updated_at').eq('id', 1).single(),
    supabase.from('components').select('product_id, updated_at'),
  ])

  const productLatest = buildProductLatestMap(components || [])

  const normalized = (quotes || []).map(q => {
    const productIds = Array.from(
      new Set(((q.quote_line_items || []) as { product_id: string }[]).map(li => li.product_id))
    )
    const staleness = computeStaleness(
      q.created_at,
      productIds,
      config?.updated_at || null,
      productLatest
    )
    return {
      id: q.id,
      created_at: q.created_at,
      expires_at: q.expires_at,
      total_ttd: q.total_ttd,
      status: q.status,
      properties: Array.isArray(q.properties) ? q.properties[0] ?? null : q.properties,
      profiles: Array.isArray(q.profiles) ? q.profiles[0] ?? null : q.profiles,
      is_stale: staleness.is_stale,
      stale_reason: staleness.reason,
    }
  })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">
        {isAdmin ? 'All Quotes' : 'My Quotes'}
      </h1>
      <QuotesListClient quotes={normalized} showCustomer={isAdmin} />
    </div>
  )
}
