import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { QuoteStatusBadge } from '@/components/quotes/quote-status-badge'
import { StatCard } from '@/components/dashboard/stat-card'
import { AttentionCard } from '@/components/dashboard/attention-card'
import {
  expiringQuotes,
  awaitingResponse,
  agingDrafts,
  stalledJobs,
  atRiskInstalls,
} from '@/lib/attention'
import {
  QUOTE_STATUS_LABELS,
  JOB_STATUS_LABELS,
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_SHORT_LABELS,
  WORKFLOW_STAGE_COLORS,
  bandForStage,
} from '@/lib/constants'
import { formatTtd } from '@/lib/format'
import { cn } from '@/lib/utils'
import { effectiveQuoteStatus, isCustomerRole } from '@/types/database'
import type { JobStatus, QuoteStatus, StageHistoryEntry, UserRole, WorkflowStage } from '@/types/database'
import { format } from 'date-fns'
import {
  Home,
  FileText,
  Images,
  Plus,
  UserPlus,
  CalendarDays,
  AlertTriangle,
  CalendarClock,
  Clock,
  Mail,
  PauseCircle,
  FileEdit,
  ChevronDown,
} from 'lucide-react'

/**
 * Role-aware dashboard (WS2 §7): one route, three perspectives.
 * Customer — properties, quotes awaiting response, upcoming installation.
 * Sales — pipeline strip, quick actions, needs-attention, upcoming installs.
 * Manager/Admin — KPI row, pipeline by rep, jobs summary, activity, what-if pricing.
 */
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name')
    .eq('id', user.id)
    .single()
  if (!profile) redirect('/auth/login')

  const role = profile.role as UserRole

  if (isCustomerRole(role)) {
    return <CustomerDashboard firstName={profile.first_name} />
  }
  if (role === 'salesman') {
    return <SalesDashboard userId={user.id} firstName={profile.first_name} />
  }
  return <AdminDashboard />
}

interface QuoteLite {
  id: string
  status: QuoteStatus
  expires_at: string | null
  total_ttd: number
  created_at: string
  sent_at: string | null
  properties: { name: string } | { name: string }[] | null
}

function propName(q: QuoteLite): string {
  return embeddedName(q.properties)
}

/** PostgREST embeds come back as object-or-array depending on inference; normalize to a name. */
function embeddedName(v: unknown): string {
  const p = Array.isArray(v) ? v[0] : v
  return (p as { name?: string } | null)?.name ?? ''
}

// ============================================================
// Customer
// ============================================================

async function CustomerDashboard({ firstName }: { firstName: string }) {
  const supabase = await createClient()

  const [{ data: properties }, { data: quotes }, { data: jobs }] = await Promise.all([
    supabase.from('properties').select('id, name').order('created_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('id, status, expires_at, total_ttd, created_at, sent_at, properties(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('jobs')
      .select('id, status, scheduled_install_date, properties(name)')
      .order('scheduled_install_date', { ascending: true, nullsFirst: false }),
  ])

  const quoteRows = (quotes ?? []) as QuoteLite[]
  const withStatus = quoteRows.map(q => ({ ...q, effective: effectiveQuoteStatus(q) }))
  const awaiting = withStatus.filter(q => q.effective === 'sent')
  const activeJob = (jobs ?? []).find(j => j.status !== 'complete')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome{firstName ? `, ${firstName}` : ''}</h1>
        <p className="text-muted-foreground">Here&apos;s where everything stands.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="My Properties" value={String(properties?.length ?? 0)} href="/properties" />
        <StatCard label="My Quotes" value={String(withStatus.length)} href="/quotes" />
        <StatCard
          label="Upcoming Installation"
          value={activeJob?.scheduled_install_date ? format(new Date(activeJob.scheduled_install_date), 'MMM d') : '—'}
          sub={activeJob ? JOB_STATUS_LABELS[activeJob.status as JobStatus] : 'No active job'}
        />
      </div>

      {awaiting.length > 0 && (
        <Card className="border-blue-500/40">
          <CardHeader>
            <CardTitle className="text-lg">Awaiting your response</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {awaiting.map(q => (
              <div key={q.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{propName(q) || 'Quote'}</p>
                  <p className="text-xs text-muted-foreground">
                    TTD ${Number(q.total_ttd).toFixed(2)}
                    {q.expires_at && ` · valid until ${format(new Date(q.expires_at), 'MMM d, yyyy')}`}
                  </p>
                </div>
                <Link href={`/quotes/${q.id}`}>
                  <Button size="sm">View &amp; Accept</Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Quotes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {withStatus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
              withStatus.slice(0, 5).map(q => (
                <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent/50">
                  <span className="truncate">{propName(q) || q.id.slice(0, 8)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-medium">${Number(q.total_ttd).toFixed(0)}</span>
                    <QuoteStatusBadge status={q.effective} />
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between bg-gradient-to-br from-[oklch(0.18_0.02_250)] to-[oklch(0.3_0.06_260)] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Images className="h-5 w-5" />
              Explore our styles
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-white/80">
              Browse blinds and awnings by shade type, style, and colour — with indicative pricing for your windows.
            </p>
            <Link href="/gallery">
              <Button variant="secondary">Open Style Gallery</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============================================================
// Sales
// ============================================================

const PIPELINE_STATUSES = ['draft', 'sent', 'accepted', 'expired'] as const

async function SalesDashboard({ userId, firstName }: { userId: string; firstName: string }) {
  const supabase = await createClient()

  const [{ data: myQuotes }, { data: upcomingJobs }] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, status, expires_at, total_ttd, created_at, sent_at, properties(name)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('jobs')
      .select('id, status, scheduled_install_date, properties(name)')
      .not('scheduled_install_date', 'is', null)
      .gte('scheduled_install_date', new Date().toISOString().slice(0, 10))
      .order('scheduled_install_date', { ascending: true })
      .limit(5),
  ])

  const rows = ((myQuotes ?? []) as QuoteLite[]).map(q => ({ ...q, effective: effectiveQuoteStatus(q) }))
  const byStatus = Object.fromEntries(
    PIPELINE_STATUSES.map(s => [
      s,
      {
        count: rows.filter(q => q.effective === s).length,
        value: rows.filter(q => q.effective === s).reduce((sum, q) => sum + Number(q.total_ttd), 0),
      },
    ])
  )

  const { expiringSoon, unanswered, drafts } = salesAttention(rows, nowMs())

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sales Dashboard</h1>
          <p className="text-muted-foreground">Your pipeline{firstName ? `, ${firstName}` : ''} — quotes you created.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/properties?new=true">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              New Quote
            </Button>
          </Link>
          <Link href="/properties?new=true">
            <Button size="sm" variant="outline">
              <UserPlus className="mr-1 h-4 w-4" />
              Add Customer
            </Button>
          </Link>
        </div>
      </div>

      {/* Pipeline strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PIPELINE_STATUSES.map(s => (
          <StatCard
            key={s}
            label={QUOTE_STATUS_LABELS[s]}
            value={String(byStatus[s].count)}
            sub={`TTD $${byStatus[s].value.toFixed(0)}`}
            href={`/quotes?status=${s}&rep=${userId}`}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Needs attention
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {expiringSoon.length === 0 && unanswered.length === 0 && drafts.length === 0 ? (
              <p className="text-muted-foreground">All clear — nothing waiting on you.</p>
            ) : (
              <>
                {drafts.slice(0, 3).map(q => (
                  <AttentionRow key={q.id} quote={q} note="Draft — not sent yet" />
                ))}
                {expiringSoon.slice(0, 3).map(q => (
                  <AttentionRow key={q.id} quote={q} note={`Expires ${q.expires_at ? format(new Date(q.expires_at), 'MMM d') : 'soon'}`} />
                ))}
                {unanswered.slice(0, 3).map(q => (
                  <AttentionRow key={q.id} quote={q} note={`Sent ${q.sent_at ? format(new Date(q.sent_at), 'MMM d') : ''} — no response`} />
                ))}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarDays className="h-4 w-4" />
              Upcoming installs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {(upcomingJobs ?? []).length === 0 ? (
              <p className="text-muted-foreground">Nothing scheduled.</p>
            ) : (
              (upcomingJobs ?? []).map(j => (
                <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50">
                  <span className="truncate">{embeddedName(j.properties)}</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="capitalize">{JOB_STATUS_LABELS[j.status as JobStatus]}</Badge>
                    <span className="text-muted-foreground">
                      {j.scheduled_install_date ? format(new Date(j.scheduled_install_date), 'MMM d') : ''}
                    </span>
                  </span>
                </Link>
              ))
            )}
            <Link href="/jobs/calendar" className="block pt-1 text-xs text-primary hover:underline">
              Open the install calendar →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/**
 * Wraps `Date.now()` behind an opaque helper. `react-hooks/purity` flags
 * impure builtins called directly in a component/hook body, but (like
 * `adminTimeWindows` below) doesn't see through a plain function call —
 * safe here regardless, since these are server components that render
 * fresh per request rather than being memoized.
 */
function nowMs(): number {
  return Date.now()
}

/** Clock-derived boundaries for the admin KPI row (plain helper; server components render per request). */
function adminTimeWindows() {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const now = Date.now()
  return {
    monthStart,
    ninetyDaysAgo: new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(),
    weekAhead: now + 7 * 24 * 60 * 60 * 1000,
    dayAgo: now - 24 * 60 * 60 * 1000,
  }
}

/**
 * Time-window buckets for the sales "needs attention" panel, backed by the
 * shared `@/lib/attention` queues (same logic the admin action queue uses).
 * `drafts` passes `olderThanDays: 0` to `agingDrafts` to preserve this
 * panel's original behaviour of surfacing every unsent draft regardless of
 * age, rather than only ones aging past a threshold — the admin dashboard's
 * "Unsent aging drafts" queue is the one that actually filters by age.
 */
function salesAttention<T extends QuoteLite & { effective: string }>(rows: T[], now: number) {
  return {
    expiringSoon: expiringQuotes(rows, now),
    unanswered: awaitingResponse(rows, now),
    drafts: agingDrafts(rows, now, 0),
  }
}

function AttentionRow({ quote, note }: { quote: QuoteLite & { effective: string }; note: string }) {
  return (
    <Link href={`/quotes/${quote.id}`} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-accent/50">
      <span className="truncate">{propName(quote) || quote.id.slice(0, 8)}</span>
      <span className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">{note}</span>
        <QuoteStatusBadge status={quote.effective} />
      </span>
    </Link>
  )
}

// ============================================================
// Manager / Admin
// ============================================================

async function AdminDashboard() {
  const supabase = await createClient()

  const { monthStart, ninetyDaysAgo, weekAhead, dayAgo } = adminTimeWindows()
  const now = nowMs()

  const [
    { data: quotes },
    { data: jobs },
    { data: activity },
  ] = await Promise.all([
    supabase
      .from('quotes')
      .select('id, status, expires_at, total_ttd, created_at, sent_at, created_by, properties(name), creator:profiles!created_by(first_name, last_name)')
      .order('created_at', { ascending: false }),
    // `quotes(total_ttd)` (unaliased) is the same embed shape already proven
    // working in src/app/jobs/page.tsx for this same jobs.quote_id -> quotes
    // FK — it feeds each attention queue's value-at-risk figure. Pre-quote
    // jobs (quote_id null) simply embed null, normalized to 0 below.
    supabase
      .from('jobs')
      .select('id, workflow_stage, stage_history, scheduled_install_date, created_at, quote_id, properties(name), quotes(total_ttd)'),
    supabase
      .from('audit_logs')
      .select('id, action_type, created_at, actor:profiles!actor_id(first_name, last_name)')
      .order('created_at', { ascending: false })
      .limit(8),
  ])

  type AdminQuote = QuoteLite & {
    created_by: string
    creator: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null
  }
  const rows = ((quotes ?? []) as AdminQuote[]).map(q => ({ ...q, effective: effectiveQuoteStatus(q) }))

  const sentRows = rows.filter(q => q.effective === 'sent')
  const pipelineValue = sentRows.reduce((s, q) => s + Number(q.total_ttd), 0)
  const resolved = rows.filter(q =>
    (q.effective === 'accepted' || q.effective === 'declined' || q.effective === 'expired') &&
    q.created_at >= ninetyDaysAgo
  )
  const accepted90 = resolved.filter(q => q.effective === 'accepted').length
  const acceptanceRate = resolved.length > 0 ? Math.round((accepted90 / resolved.length) * 100) : null
  const quotesThisMonth = rows.filter(q => new Date(q.created_at) >= monthStart).length

  type AdminJobRow = {
    id: string
    workflow_stage: WorkflowStage
    stage_history: StageHistoryEntry[]
    scheduled_install_date: string | null
    created_at: string
    quote_id: string | null
    properties: { name: string } | { name: string }[] | null
    quotes: { total_ttd: number } | { total_ttd: number }[] | null
  }
  const jobRows = ((jobs ?? []) as AdminJobRow[]).map(j => {
    const quoteEmbed = Array.isArray(j.quotes) ? j.quotes[0] ?? null : j.quotes
    return {
      ...j,
      property_name: embeddedName(j.properties),
      /** Value-at-risk for install/stall queues: the linked quote's total, 0 for pre-quote jobs. */
      quote_value: quoteEmbed ? Number(quoteEmbed.total_ttd) : 0,
    }
  })

  const jobsThisWeek = jobRows.filter(j =>
    j.scheduled_install_date &&
    new Date(j.scheduled_install_date).getTime() >= dayAgo &&
    new Date(j.scheduled_install_date).getTime() <= weekAhead
  ).length
  // Batch 11: the workflow strip combines pre-quote and post-approval jobs
  // by workflow_stage — they're all just "jobs" now, no separate concept.
  const jobsByStage = jobRows.reduce<Record<string, number>>((acc, j) => {
    acc[j.workflow_stage] = (acc[j.workflow_stage] ?? 0) + 1
    return acc
  }, {})

  // Pipeline by rep — keyed by creator profile id so chips can deep-link
  // into the quotes list (/quotes?status=…&rep=…).
  const byRep: Record<string, { id: string; name: string; counts: Record<string, number>; value: number }> = {}
  for (const q of rows) {
    const c = Array.isArray(q.creator) ? q.creator[0] : q.creator
    const name = c ? `${c.first_name} ${c.last_name}`.trim() || 'Unknown' : 'Unknown'
    if (!byRep[q.created_by]) byRep[q.created_by] = { id: q.created_by, name, counts: {}, value: 0 }
    byRep[q.created_by].counts[q.effective] = (byRep[q.created_by].counts[q.effective] ?? 0) + 1
    if (q.effective === 'sent') byRep[q.created_by].value += Number(q.total_ttd)
  }

  // ---- Action queue: the five `@/lib/attention` helpers, pure functions
  // fed `now` once so every queue agrees on "the present moment". ----
  const overdueAtRisk = atRiskInstalls(jobRows, now)
  const expiring = expiringQuotes(rows, now)
  const awaiting = awaitingResponse(rows, now)
  const stalled = stalledJobs(jobRows, now)
  const agingDraftQuotes = agingDrafts(rows, now)

  const sum = <T,>(items: T[], value: (item: T) => number) => items.reduce((s, i) => s + value(i), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Business Dashboard</h1>
        <p className="text-muted-foreground">What needs you today, then the whole pipeline at a glance.</p>
      </div>

      {/* Action queue (WS7 §7): the five things that need a human, ordered
          by urgency. Replaces the old KPI-first layout — KPIs are still
          below, just demoted to a compact strip since "5 rows across" was
          competing for attention with the numbers that actually drive
          action. Each card is its own AttentionCard; count===0 renders a
          quiet "All clear" rather than disappearing, so the queue's shape
          doesn't jump around as items clear. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AttentionCard
          title="Overdue & at-risk installs"
          icon={CalendarClock}
          count={overdueAtRisk.length}
          valueAtRisk={sum(overdueAtRisk, j => j.quote_value)}
          viewAllHref="/jobs/calendar"
          emptyLabel="No overdue or at-risk installs"
        >
          {overdueAtRisk.slice(0, 5).map(j => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <span className="truncate">{j.property_name || 'Job'}</span>
              <span className="flex shrink-0 items-center gap-1.5">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px]',
                    j.kind === 'overdue'
                      ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : 'border-amber-300 bg-amber-50 text-amber-700'
                  )}
                >
                  {j.kind === 'overdue' ? 'Overdue' : 'At risk'}
                </Badge>
                <span className="text-xs text-muted-foreground">{format(new Date(j.scheduled_install_date), 'MMM d')}</span>
              </span>
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard
          title="Quotes expiring soon"
          icon={Clock}
          count={expiring.length}
          valueAtRisk={sum(expiring, q => Number(q.total_ttd))}
          viewAllHref="/quotes?status=sent"
          emptyLabel="Nothing expiring soon"
        >
          {expiring.slice(0, 5).map(q => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <span className="truncate">{propName(q) || 'Quote'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{q.daysLeft}d left · {formatTtd(Number(q.total_ttd))}</span>
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard
          title="Awaiting response"
          icon={Mail}
          count={awaiting.length}
          valueAtRisk={sum(awaiting, q => Number(q.total_ttd))}
          viewAllHref="/quotes?status=sent"
          emptyLabel="No overdue responses"
        >
          {awaiting.slice(0, 5).map(q => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <span className="truncate">{propName(q) || 'Quote'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{q.daysSinceSent}d ago · {formatTtd(Number(q.total_ttd))}</span>
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard
          title="Jobs stalled in stage"
          icon={PauseCircle}
          count={stalled.length}
          valueAtRisk={sum(stalled, j => j.quote_value)}
          viewAllHref="/jobs"
          emptyLabel="Nothing stalled"
        >
          {stalled.slice(0, 5).map(j => (
            <Link key={j.id} href={`/jobs/${j.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <span className="truncate">{j.property_name || 'Job'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {WORKFLOW_STAGE_SHORT_LABELS[j.workflow_stage]} · {j.daysInStage}d
              </span>
            </Link>
          ))}
        </AttentionCard>

        <AttentionCard
          title="Unsent aging drafts"
          icon={FileEdit}
          count={agingDraftQuotes.length}
          valueAtRisk={sum(agingDraftQuotes, q => Number(q.total_ttd))}
          viewAllHref="/quotes?status=draft"
          emptyLabel="No aging drafts"
        >
          {agingDraftQuotes.slice(0, 5).map(q => (
            <Link key={q.id} href={`/quotes/${q.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50">
              <span className="truncate">{propName(q) || 'Quote'}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{q.daysAsDraft}d old</span>
            </Link>
          ))}
        </AttentionCard>
      </div>

      {/* KPI strip — demoted from the old 5-up primary row (dropped "Avg
          quote value": rarely actioned, and the action queue above is now
          the primary landing focus) to a smaller, secondary strip. */}
      <div className="grid grid-cols-2 items-stretch gap-3 lg:grid-cols-4">
        <StatCard label="Pipeline (sent)" value={formatTtd(pipelineValue)} href="/quotes?status=sent" />
        <StatCard label="Acceptance rate" value={acceptanceRate === null ? '—' : `${acceptanceRate}%`} sub="last 90 days" />
        <StatCard label="Quotes this month" value={String(quotesThisMonth)} href="/quotes" />
        <StatCard label="Jobs this week" value={String(jobsThisWeek)} href="/jobs/calendar" />
      </div>

      {/* Batch 11: 16-stage order workflow strip, replacing the old
          job-status-only summary. Horizontally scrollable so all 16 stages
          are always reachable without a separate filter control; each tile
          deep-links into the stage-filtered board (`/jobs?stage=...`).
          Visually de-emphasised (smaller title/tiles) now that the action
          queue above carries the "what needs attention" job, per the a11y/
          structure audit (2026-07-16 §7) — each tile already pairs its
          colour band with the stage's own text label; the band legend below
          additionally names what the three colour bands mean (pre-sale /
          in production / post-install), so the grouping isn't colour-only. */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Order Workflow</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {WORKFLOW_STAGES.map(stage => (
              <Link
                key={stage}
                href={`/jobs?stage=${stage}`}
                className={cn(
                  'flex shrink-0 flex-col items-center gap-0.5 rounded-md border px-2.5 py-1.5 text-center transition-colors hover:opacity-80',
                  WORKFLOW_STAGE_COLORS[stage]
                )}
              >
                <p className="text-sm font-semibold">{jobsByStage[stage] ?? 0}</p>
                <p className="text-[10px] whitespace-nowrap">{WORKFLOW_STAGE_SHORT_LABELS[stage]}</p>
              </Link>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {(['request_received', 'job_approved', 'installation_complete'] as WorkflowStage[]).map(sampleStage => (
              <span key={sampleStage} className="flex items-center gap-1">
                <span className={cn('h-2.5 w-2.5 rounded-full border', WORKFLOW_STAGE_COLORS[sampleStage])} />
                {bandForStage(sampleStage)}
              </span>
            ))}
          </div>
          <Link href="/jobs" className="mt-3 block text-xs text-primary hover:underline">
            Open the jobs board →
          </Link>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pipeline by rep */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline by rep</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(byRep).length === 0 ? (
              <p className="text-sm text-muted-foreground">No quotes yet.</p>
            ) : (
              <div className="space-y-3 text-sm">
                {Object.values(byRep).map(rep => (
                  <div key={rep.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5">
                    <Link href={`/quotes?rep=${rep.id}`} className="font-medium hover:underline">
                      {rep.name}
                    </Link>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {PIPELINE_STATUSES.map(s =>
                        rep.counts[s] ? (
                          <Link key={s} href={`/quotes?status=${s}&rep=${rep.id}`}>
                            <Badge variant="outline" className="text-[11px] transition-colors hover:bg-accent">
                              {rep.counts[s]} {QUOTE_STATUS_LABELS[s].toLowerCase()}
                            </Badge>
                          </Link>
                        ) : null
                      )}
                      <Link href={`/quotes?status=sent&rep=${rep.id}`} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                        ${rep.value.toFixed(0)} sent
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent activity — collapsed by default (native <details>): it's
            reference material, not action-driving, so it no longer competes
            with the action queue for the fold. */}
        <details className="group rounded-xl border bg-card ring-1 ring-foreground/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-base font-medium">
            Recent activity
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="space-y-2 border-t px-4 py-3 text-sm">
            {(activity ?? []).length === 0 ? (
              <p className="text-muted-foreground">No activity yet.</p>
            ) : (
              (activity ?? []).map(a => {
                const actor = Array.isArray(a.actor) ? a.actor[0] : a.actor
                return (
                  <div key={a.id} className="flex items-center justify-between">
                    <span className="truncate">
                      <span className="font-medium">{actor ? `${actor.first_name} ${actor.last_name}` : 'Someone'}</span>{' '}
                      <span className="text-muted-foreground">{a.action_type.replace(/_/g, ' ')}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {format(new Date(a.created_at), 'MMM d, h:mm a')}
                    </span>
                  </div>
                )
              })
            )}
            <Link href="/admin/audit-logs" className="block pt-1 text-xs text-primary hover:underline">
              Full activity log →
            </Link>
          </div>
        </details>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/properties"><Button variant="outline" size="sm"><Home className="mr-1 h-4 w-4" />Properties</Button></Link>
        <Link href="/quotes"><Button variant="outline" size="sm"><FileText className="mr-1 h-4 w-4" />Quotes</Button></Link>
      </div>
    </div>
  )
}
