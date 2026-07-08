import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { CalendarDays } from 'lucide-react'
import { JobsBoardClient } from '@/components/jobs/jobs-board-client'
import { WORKFLOW_STAGES } from '@/lib/constants'
import { isStaffRole } from '@/types/database'
import type { UserRole, WorkflowStage } from '@/types/database'

/**
 * Staff/customer jobs board (Batch 11): grouped by the 16-stage order
 * workflow instead of the old 6-value status. Staff see every order and
 * get a per-card stage dropdown plus a "New Order" entry point for
 * pre-quote requests; customers (RLS-scoped to their own) see a read-only
 * view of their own order(s). Accepts `?stage=` so the admin dashboard's
 * workflow strip can deep-link into a single stage.
 */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>
}) {
  const { stage } = await searchParams
  const initialStage = stage && (WORKFLOW_STAGES as readonly string[]).includes(stage) ? stage : undefined
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

  const [{ data: jobs }, { data: staff }, { data: customerRows }, { data: propertyRows }] = await Promise.all([
    supabase
      .from('jobs')
      .select(`
        id, workflow_stage, scheduled_install_date, created_at,
        properties(name, profiles!user_id(first_name, last_name)),
        customer:profiles!customer_id(first_name, last_name),
        quotes(id, total_ttd),
        job_assignments(id, assignee_id, profiles!assignee_id(first_name, last_name))
      `)
      .order('created_at', { ascending: false }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('role', ['salesman', 'administrator'])
      .order('first_name'),
    // Only staff need the customer/property pickers for the New Order dialog.
    isStaff
      ? supabase
          .from('profiles')
          .select('id, first_name, last_name, email')
          .in('role', ['retail_customer', 'wholesale_customer'])
          .order('last_name', { ascending: true })
      : Promise.resolve({ data: [] }),
    isStaff
      ? supabase.from('properties').select('id, name, user_id').order('name', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  type Row = {
    id: string
    workflow_stage: WorkflowStage
    scheduled_install_date: string | null
    created_at: string
    properties: { name: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null } | Array<{ name: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }> | null
    customer: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
    quotes: { id: string; total_ttd: number } | { id: string; total_ttd: number }[] | null
    job_assignments: Array<{ id: string; assignee_id: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }>
  }

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  const cards = ((jobs ?? []) as Row[]).map(j => {
    const property = one(j.properties)
    const propertyOwner = property ? one(property.profiles) : null
    const customer = one(j.customer) ?? propertyOwner
    const quote = one(j.quotes)
    return {
      id: j.id,
      workflow_stage: j.workflow_stage,
      scheduled_install_date: j.scheduled_install_date,
      property_name: property?.name ?? 'No property yet',
      customer_name: customer ? `${customer.first_name} ${customer.last_name}`.trim() : '',
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
          <p className="text-muted-foreground">The full order workflow, from first request to after-sales follow-up.</p>
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
          isStaff={isStaff}
          customers={(customerRows ?? []).map(c => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email }))}
          properties={(propertyRows ?? []).map(p => ({ id: p.id, name: p.name, user_id: p.user_id }))}
          initialStage={initialStage as WorkflowStage | undefined}
        />
      </Suspense>
    </div>
  )
}
