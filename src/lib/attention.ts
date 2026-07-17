import { effectiveQuoteStatus } from '@/types/database'
import type { QuoteStatus, StageHistoryEntry, WorkflowStage } from '@/types/database'
import { WORKFLOW_STAGE_ORDER } from '@/lib/constants'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Minimal quote shape the attention queues need — a subset of {@link Quote}. */
export interface AttentionQuote {
  id: string
  status: QuoteStatus
  expires_at: string | null
  sent_at: string | null
  created_at: string
  total_ttd: number
}

/** Minimal job shape the attention queues need — a subset of {@link Job}. */
export interface AttentionJob {
  id: string
  workflow_stage: WorkflowStage
  stage_history: StageHistoryEntry[]
  scheduled_install_date: string | null
  created_at: string
}

/** The only stage a job can never be "stalled" in — there's nowhere further for it to go. */
const TERMINAL_STAGE: WorkflowStage = 'after_sales_follow_up'

/** Default "stalled" threshold for {@link stalledJobs} — see that function's docstring for the calendar-vs-business-day caveat. */
export const STALLED_JOB_THRESHOLD_DAYS = 5

/**
 * Quotes that are currently live ('sent', not yet expired) and expire within
 * `withinDays` of `now` — the "renew before it lapses" queue.
 *
 * Enriches each match with `daysLeft` (rounded up, so "expires in a few
 * hours" still reads as 1 day left, not 0). Quotes that have already lapsed
 * fall out on their own: {@link effectiveQuoteStatus} flips their effective
 * status to 'expired' once `expires_at` is in the past, so they never match
 * the `=== 'sent'` check below.
 *
 * Caveat: `effectiveQuoteStatus` compares `expires_at` against the real
 * wall clock (`new Date()`) internally, not the injected `now` — that's a
 * pre-existing characteristic of that helper (see types/database.ts),
 * unchanged here. Callers should pass a `now` close to the real current
 * time (e.g. `Date.now()`) for predictable results; this file's own date
 * arithmetic is otherwise fully driven by the injected `now`.
 */
export function expiringQuotes<T extends AttentionQuote>(
  quotes: T[],
  now: number,
  withinDays = 7
): Array<T & { daysLeft: number }> {
  const horizon = now + withinDays * MS_PER_DAY
  const out: Array<T & { daysLeft: number }> = []
  for (const q of quotes) {
    if (!q.expires_at || effectiveQuoteStatus(q) !== 'sent') continue
    const expiresAtMs = new Date(q.expires_at).getTime()
    if (expiresAtMs < now || expiresAtMs > horizon) continue
    out.push({ ...q, daysLeft: Math.ceil((expiresAtMs - now) / MS_PER_DAY) })
  }
  return out
}

/**
 * Quotes sent more than `olderThanDays` ago with no customer response yet
 * (still effectively 'sent' — accepting/declining would change the status).
 * Enriches each match with `daysSinceSent` (rounded down).
 */
export function awaitingResponse<T extends AttentionQuote>(
  quotes: T[],
  now: number,
  olderThanDays = 7
): Array<T & { daysSinceSent: number }> {
  const out: Array<T & { daysSinceSent: number }> = []
  for (const q of quotes) {
    if (!q.sent_at || effectiveQuoteStatus(q) !== 'sent') continue
    const sentAtMs = new Date(q.sent_at).getTime()
    const days = now - sentAtMs
    if (days <= olderThanDays * MS_PER_DAY) continue
    out.push({ ...q, daysSinceSent: Math.floor(days / MS_PER_DAY) })
  }
  return out
}

/**
 * Draft quotes that have sat unsent for more than `olderThanDays`. Enriches
 * each match with `daysAsDraft` (rounded down).
 */
export function agingDrafts<T extends AttentionQuote>(
  quotes: T[],
  now: number,
  olderThanDays = 3
): Array<T & { daysAsDraft: number }> {
  const out: Array<T & { daysAsDraft: number }> = []
  for (const q of quotes) {
    if (effectiveQuoteStatus(q) !== 'draft') continue
    const createdAtMs = new Date(q.created_at).getTime()
    const days = now - createdAtMs
    if (days <= olderThanDays * MS_PER_DAY) continue
    out.push({ ...q, daysAsDraft: Math.floor(days / MS_PER_DAY) })
  }
  return out
}

/**
 * When a job most recently entered its CURRENT `workflow_stage`, in ms.
 * Prefers the latest `stage_history` entry whose `stage` matches the job's
 * current stage; falls back to the latest entry overall (data anomaly — the
 * current stage has no matching history row); falls back to `created_at`
 * when there's no history at all (e.g. a job that has never moved stage).
 */
function stageEnteredAtMs(job: AttentionJob): number {
  const forCurrentStage = job.stage_history
    .filter(h => h.stage === job.workflow_stage)
    .map(h => new Date(h.at).getTime())
  if (forCurrentStage.length > 0) return Math.max(...forCurrentStage)

  const anyHistory = job.stage_history.map(h => new Date(h.at).getTime())
  if (anyHistory.length > 0) return Math.max(...anyHistory)

  return new Date(job.created_at).getTime()
}

/**
 * Jobs that have sat in their current `workflow_stage` for more than
 * `thresholdDays` and aren't at the terminal stage (nowhere further to
 * stall). Enriches each match with `enteredAt` (ISO string) and
 * `daysInStage` (rounded down).
 *
 * The client's process defines "stalled" as 5 *business* days; this
 * implementation approximates that as 5 *calendar* days — business-day
 * precision (skipping weekends/holidays) is deferred to a later pass.
 */
export function stalledJobs<T extends AttentionJob>(
  jobs: T[],
  now: number,
  thresholdDays = STALLED_JOB_THRESHOLD_DAYS
): Array<T & { enteredAt: string; daysInStage: number }> {
  const out: Array<T & { enteredAt: string; daysInStage: number }> = []
  for (const job of jobs) {
    if (job.workflow_stage === TERMINAL_STAGE) continue
    const enteredAtMs = stageEnteredAtMs(job)
    const days = now - enteredAtMs
    if (days <= thresholdDays * MS_PER_DAY) continue
    out.push({
      ...job,
      enteredAt: new Date(enteredAtMs).toISOString(),
      daysInStage: Math.floor(days / MS_PER_DAY),
    })
  }
  return out
}

export type AtRiskInstallKind = 'overdue' | 'at_risk'

/**
 * Jobs with a scheduled install date that's either already passed
 * (OVERDUE, and not yet marked installation-complete) or falls within the
 * next `atRiskWithinDays` (AT_RISK, and installation hasn't even been
 * confirmed/scheduled yet — see {@link WORKFLOW_STAGE_ORDER}). Each job
 * appears at most once — a job is checked for OVERDUE first, so an overdue
 * job is never also reported as AT_RISK.
 *
 * Date comparisons are calendar-date (not exact-timestamp) based, derived
 * from `now`, so a job scheduled for "today" is never OVERDUE (the day
 * hasn't finished yet) but is included in the AT_RISK window.
 */
export function atRiskInstalls<T extends AttentionJob>(
  jobs: T[],
  now: number,
  atRiskWithinDays = 3
): Array<T & { kind: AtRiskInstallKind; scheduled_install_date: string }> {
  const todayStr = new Date(now).toISOString().slice(0, 10)
  const horizonStr = new Date(now + atRiskWithinDays * MS_PER_DAY).toISOString().slice(0, 10)

  const out: Array<T & { kind: AtRiskInstallKind; scheduled_install_date: string }> = []
  for (const job of jobs) {
    if (!job.scheduled_install_date) continue
    const stageIdx = WORKFLOW_STAGE_ORDER[job.workflow_stage] ?? 0
    const date = job.scheduled_install_date

    const isOverdue = date < todayStr && stageIdx < WORKFLOW_STAGE_ORDER['installation_complete']
    if (isOverdue) {
      out.push({ ...job, kind: 'overdue', scheduled_install_date: date })
      continue
    }

    const isAtRisk = date >= todayStr && date <= horizonStr && stageIdx < WORKFLOW_STAGE_ORDER['installation_scheduled']
    if (isAtRisk) {
      out.push({ ...job, kind: 'at_risk', scheduled_install_date: date })
    }
  }
  return out
}
