import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { CalendarDays } from 'lucide-react'
import { JobsBoardClient } from '@/components/jobs/jobs-board-client'

/**
 * Staff jobs board (WS4 §9.2): kanban by status with a status dropdown per
 * card (drag/drop deliberately skipped in favour of a dependable control),
 * filterable by assignee.
 */
export default async function JobsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: jobs }, { data: staff }] = await Promise.all([
    supabase
      .from('jobs')
      .select(`
        id, status, scheduled_install_date, created_at,
        properties(name, profiles!user_id(first_name, last_name)),
        quotes(id, total_ttd),
        job_assignments(id, assignee_id, profiles!assignee_id(first_name, last_name))
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('role', ['salesman', 'administrator'])
      .order('first_name'),
  ])

  type Row = {
    id: string
    status: string
    scheduled_install_date: string | null
    created_at: string
    properties: { name: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null } | Array<{ name: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }> | null
    quotes: { id: string; total_ttd: number } | { id: string; total_ttd: number }[] | null
    job_assignments: Array<{ id: string; assignee_id: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }>
  }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  const cards = ((jobs ?? []) as Row[]).map(j => {
    const property = one(j.properties)
    const owner = property ? one(property.profiles) : null
    const quote = one(j.quotes)
    return {
      id: j.id,
      status: j.status,
      scheduled_install_date: j.scheduled_install_date,
      property_name: property?.name ?? 'Unknown property',
      customer_name: owner ? `${owner.first_name} ${owner.last_name}`.trim() : '',
      total_ttd: quote ? Number(quote.total_ttd) : null,
      assignees: (j.job_assignments ?? []).map(a => {
        const p = one(a.profiles)
        return { id: a.assignee_id, name: p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown' }
      }),
    }
  })

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Jobs</h1>
          <p className="text-muted-foreground">Accepted quotes become jobs — track them from measure to complete.</p>
        </div>
        <Link href="/jobs/calendar">
          <Button variant="outline" size="sm">
            <CalendarDays className="mr-2 h-4 w-4" />
            Install Calendar
          </Button>
        </Link>
      </div>

      <Suspense>
        <JobsBoardClient
          cards={cards}
          staff={(staff ?? []).map(s => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim() }))}
        />
      </Suspense>
    </div>
  )
}
