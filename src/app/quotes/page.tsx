import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { QuotesListClient } from '@/components/quotes/quotes-list-client'
import { PageBreadcrumb } from '@/components/layout/page-breadcrumb'
import { computeStaleness, buildProductLatestMap, buildStyleLatestMap } from '@/lib/quote-staleness'
import { fetchBlindHierarchy, resolveStyleId } from '@/lib/blind-hierarchy'
import { effectiveQuoteStatus, isStaffRole } from '@/types/database'
import type { QuoteStatus, UserRole } from '@/types/database'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const isStaff = isStaffRole((profile?.role ?? 'retail_customer') as UserRole)

  const [
    { data: quotes },
    { data: config },
    { data: components },
    { data: styleComponentRows },
    hierarchy,
  ] = await Promise.all([
    (() => {
      // `profiles!user_id(...)` disambiguates the join — quotes now has two
      // FKs to profiles (user_id = customer, created_by = staff). PostgREST
      // rejects the ambiguous embed shape otherwise.
      let query = supabase
        .from('quotes')
        .select(`
          id,
          created_at,
          expires_at,
          total_ttd,
          status,
          created_by,
          properties(name),
          profiles!user_id(id, first_name, last_name, email),
          quote_line_items(product_id, line_type, shade_type, opacity, style)
        `)
        .order('created_at', { ascending: false })
      if (!isStaff) query = query.eq('user_id', user.id)
      return query
    })(),
    supabase.from('pricing_config').select('updated_at').eq('id', 1).single(),
    supabase.from('components').select('product_id, updated_at'),
    // Batch 11 Part 1: blind pricing lives on blind_styles now — feeds the
    // staleness check alongside the legacy per-product one below.
    supabase.from('blind_style_components').select('style_id, updated_at'),
    fetchBlindHierarchy(supabase, { activeOnly: false }),
  ])

  const productLatest = buildProductLatestMap(components || [])
  const styleLatest = buildStyleLatestMap(styleComponentRows || [])
  const combinedLatest = { ...productLatest, ...styleLatest }

  const normalized = (quotes || []).map(q => {
    type LineItemRef = { product_id: string | null; line_type: string; shade_type: string | null; opacity: string | null; style: string | null }
    const lineItemRefs = (q.quote_line_items || []) as LineItemRef[]
    const productIds = lineItemRefs.map(li => li.product_id).filter((pid): pid is string => !!pid)
    const styleIds = lineItemRefs
      .filter(li => li.line_type === 'blind')
      .map(li => resolveStyleId(hierarchy, { shadeType: li.shade_type, opacity: li.opacity, style: li.style }))
      .filter((sid): sid is string => !!sid)
    const trackedIds = Array.from(new Set([...productIds, ...styleIds]))
    const staleness = computeStaleness(
      q.created_at,
      trackedIds,
      config?.updated_at || null,
      combinedLatest
    )
    return {
      id: q.id,
      created_at: q.created_at,
      expires_at: q.expires_at,
      total_ttd: q.total_ttd,
      created_by: q.created_by as string,
      status: effectiveQuoteStatus({ status: q.status as QuoteStatus, expires_at: q.expires_at }),
      properties: Array.isArray(q.properties) ? q.properties[0] ?? null : q.properties,
      profiles: Array.isArray(q.profiles) ? q.profiles[0] ?? null : q.profiles,
      is_stale: staleness.is_stale,
      stale_reason: staleness.reason,
    }
  })

  return (
    <div>
      <PageBreadcrumb className="mb-2" segments={[{ label: 'Quotes' }]} />
      <h1 className="mb-6 text-2xl font-bold">
        {isStaff ? 'All Quotes' : 'My Quotes'}
      </h1>
      <Suspense>
        <QuotesListClient quotes={normalized} showCustomer={isStaff} />
      </Suspense>
    </div>
  )
}
