import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { JOB_STATUS_LABELS } from '@/lib/constants'
import { addDays, format, startOfWeek } from 'date-fns'
import type { JobStatus } from '@/types/database'

/**
 * Install calendar (WS4 §9.2): a simple CSS-grid week view of scheduled
 * installs — no calendar dependency. Navigate weeks via ?week=YYYY-MM-DD.
 */
export default async function JobsCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const { week } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const anchor = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00`) : new Date()
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 })
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const from = format(weekStart, 'yyyy-MM-dd')
  const to = format(addDays(weekStart, 6), 'yyyy-MM-dd')

  const { data: jobs } = await supabase
    .from('jobs')
    .select(`
      id, status, scheduled_install_date,
      properties(name),
      job_assignments(profiles!assignee_id(first_name))
    `)
    .gte('scheduled_install_date', from)
    .lte('scheduled_install_date', to)
    .order('scheduled_install_date')

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const byDay: Record<string, Array<{ id: string; status: JobStatus; name: string; assignees: string[] }>> = {}
  for (const j of jobs ?? []) {
    if (!j.scheduled_install_date) continue
    const key = j.scheduled_install_date
    if (!byDay[key]) byDay[key] = []
    byDay[key].push({
      id: j.id,
      status: j.status as JobStatus,
      name: one(j.properties)?.name ?? 'Job',
      assignees: (j.job_assignments ?? [])
        .map((a: { profiles: { first_name: string } | { first_name: string }[] | null }) => one(a.profiles)?.first_name ?? '')
        .filter(Boolean),
    })
  }

  const prevWeek = format(addDays(weekStart, -7), 'yyyy-MM-dd')
  const nextWeek = format(addDays(weekStart, 7), 'yyyy-MM-dd')
  const today = format(new Date(), 'yyyy-MM-dd')

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/jobs" className="mb-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to Jobs
          </Link>
          <h1 className="text-2xl font-bold">Install Calendar</h1>
          <p className="text-muted-foreground">
            Week of {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/jobs/calendar?week=${prevWeek}`}>
            <Button variant="outline" size="icon" aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <Link href="/jobs/calendar">
            <Button variant="outline" size="sm">Today</Button>
          </Link>
          <Link href={`/jobs/calendar?week=${nextWeek}`}>
            <Button variant="outline" size="icon" aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd')
          const dayJobs = byDay[key] ?? []
          const isToday = key === today
          return (
            <div
              key={key}
              className={`min-h-28 rounded-lg border p-2 ${isToday ? 'border-primary bg-primary/5' : 'bg-muted/20'}`}
            >
              <p className={`mb-2 text-xs font-semibold ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                {format(day, 'EEE d')}
              </p>
              <div className="space-y-1.5">
                {dayJobs.map(j => (
                  <Link key={j.id} href={`/jobs/${j.id}`} className="block rounded-md border bg-card p-1.5 text-xs hover:bg-accent/50">
                    <p className="truncate font-medium">{j.name}</p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Badge variant="outline" className="text-[9px]">{JOB_STATUS_LABELS[j.status]}</Badge>
                      {j.assignees.map(a => (
                        <span key={a} className="text-[10px] text-muted-foreground">{a}</span>
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
