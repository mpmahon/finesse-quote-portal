import { describe, expect, it } from 'vitest'
import {
  agingDrafts,
  atRiskInstalls,
  awaitingResponse,
  expiringQuotes,
  stalledJobs,
  type AttentionJob,
  type AttentionQuote,
} from '@/lib/attention'

/**
 * `now` is captured once (real wall-clock, matching this test run) rather
 * than an arbitrary constant, because {@link expiringQuotes} /
 * {@link awaitingResponse} / {@link agingDrafts} delegate 'sent'/'draft'
 * normalisation to `effectiveQuoteStatus`, which itself compares
 * `expires_at` against the REAL current time (see attention.ts docstring).
 * All fixtures below are built as offsets from this single `now`, so the
 * day-scale boundaries under test are unaffected by the few milliseconds
 * of drift between this line and each assertion running.
 */
const now = Date.now()
const DAY = 24 * 60 * 60 * 1000

function quote(overrides: Partial<AttentionQuote> = {}): AttentionQuote {
  return {
    id: 'q-default',
    status: 'draft',
    expires_at: null,
    sent_at: null,
    created_at: new Date(now).toISOString(),
    total_ttd: 1000,
    ...overrides,
  }
}

function job(overrides: Partial<AttentionJob> = {}): AttentionJob {
  return {
    id: 'j-default',
    workflow_stage: 'request_received',
    stage_history: [],
    scheduled_install_date: null,
    created_at: new Date(now).toISOString(),
    ...overrides,
  }
}

describe('expiringQuotes', () => {
  it('includes a sent quote expiring exactly at the withinDays boundary', () => {
    const q = quote({ id: 'q1', status: 'sent', expires_at: new Date(now + 7 * DAY).toISOString() })
    const result = expiringQuotes([q], now, 7)
    expect(result).toHaveLength(1)
    expect(result[0].daysLeft).toBe(7)
  })

  it('excludes a sent quote expiring just past the withinDays boundary', () => {
    const q = quote({ id: 'q2', status: 'sent', expires_at: new Date(now + 8 * DAY).toISOString() })
    expect(expiringQuotes([q], now, 7)).toHaveLength(0)
  })

  it('excludes an already-expired quote (effective status flips to expired)', () => {
    const q = quote({ id: 'q3', status: 'sent', expires_at: new Date(now - DAY).toISOString() })
    expect(expiringQuotes([q], now, 7)).toHaveLength(0)
  })

  it('returns an empty array when nothing matches', () => {
    expect(expiringQuotes([], now, 7)).toEqual([])
  })
})

describe('awaitingResponse', () => {
  it('includes a sent quote just past the olderThanDays boundary', () => {
    const q = quote({ id: 'q4', status: 'sent', sent_at: new Date(now - 7 * DAY - 1).toISOString() })
    const result = awaitingResponse([q], now, 7)
    expect(result).toHaveLength(1)
    expect(result[0].daysSinceSent).toBe(7)
  })

  it('excludes a sent quote exactly at the olderThanDays boundary', () => {
    const q = quote({ id: 'q5', status: 'sent', sent_at: new Date(now - 7 * DAY).toISOString() })
    expect(awaitingResponse([q], now, 7)).toHaveLength(0)
  })

  it('returns an empty array when nothing is sent', () => {
    expect(awaitingResponse([quote({ status: 'draft' })], now, 7)).toEqual([])
  })
})

describe('agingDrafts', () => {
  it('includes a draft just past the olderThanDays boundary', () => {
    const q = quote({ id: 'q6', status: 'draft', created_at: new Date(now - 3 * DAY - 1).toISOString() })
    const result = agingDrafts([q], now, 3)
    expect(result).toHaveLength(1)
    expect(result[0].daysAsDraft).toBe(3)
  })

  it('excludes a draft exactly at the olderThanDays boundary', () => {
    const q = quote({ id: 'q7', status: 'draft', created_at: new Date(now - 3 * DAY).toISOString() })
    expect(agingDrafts([q], now, 3)).toHaveLength(0)
  })

  it('returns an empty array when nothing is a draft', () => {
    expect(agingDrafts([quote({ status: 'sent', sent_at: new Date(now).toISOString() })], now, 3)).toEqual([])
  })
})

describe('stalledJobs', () => {
  it('includes a job just past the threshold in its current stage', () => {
    const j = job({
      id: 'j1',
      workflow_stage: 'fabrication_scheduled',
      stage_history: [{ stage: 'fabrication_scheduled', at: new Date(now - 5 * DAY - 1).toISOString(), actor_id: 'a' }],
    })
    const result = stalledJobs([j], now, 5)
    expect(result).toHaveLength(1)
    expect(result[0].daysInStage).toBe(5)
  })

  it('excludes a job exactly at the threshold', () => {
    const j = job({
      id: 'j2',
      workflow_stage: 'fabrication_scheduled',
      stage_history: [{ stage: 'fabrication_scheduled', at: new Date(now - 5 * DAY).toISOString(), actor_id: 'a' }],
    })
    expect(stalledJobs([j], now, 5)).toHaveLength(0)
  })

  it('falls back to created_at when stage_history is empty', () => {
    const enteredAt = new Date(now - 10 * DAY)
    const j = job({ id: 'j3', workflow_stage: 'internal_order', stage_history: [], created_at: enteredAt.toISOString() })
    const result = stalledJobs([j], now, 5)
    expect(result).toHaveLength(1)
    expect(result[0].enteredAt).toBe(enteredAt.toISOString())
  })

  it('excludes a job at the terminal stage regardless of time-in-stage', () => {
    const j = job({
      id: 'j4',
      workflow_stage: 'after_sales_follow_up',
      stage_history: [],
      created_at: new Date(now - 365 * DAY).toISOString(),
    })
    expect(stalledJobs([j], now, 5)).toHaveLength(0)
  })
})

describe('atRiskInstalls', () => {
  const today = new Date(now).toISOString().slice(0, 10)
  function daysFromNow(n: number) {
    return new Date(now + n * DAY).toISOString().slice(0, 10)
  }

  it('flags a past-due install as overdue when not yet installation_complete', () => {
    const j = job({ id: 'j5', workflow_stage: 'fabrication_scheduled', scheduled_install_date: daysFromNow(-2) })
    const result = atRiskInstalls([j], now, 3)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('overdue')
  })

  it('does not flag a past-due install that is already installation_complete', () => {
    const j = job({ id: 'j6', workflow_stage: 'installation_complete', scheduled_install_date: daysFromNow(-2) })
    expect(atRiskInstalls([j], now, 3)).toHaveLength(0)
  })

  it('flags an imminent install as at_risk when not yet installation_scheduled', () => {
    const j = job({ id: 'j7', workflow_stage: 'production_complete', scheduled_install_date: daysFromNow(2) })
    const result = atRiskInstalls([j], now, 3)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('at_risk')
  })

  it('does not flag an imminent install once installation_scheduled or later', () => {
    const j = job({ id: 'j8', workflow_stage: 'installation_scheduled', scheduled_install_date: daysFromNow(2) })
    expect(atRiskInstalls([j], now, 3)).toHaveLength(0)
  })

  it('does not flag an install beyond the at-risk window', () => {
    const j = job({ id: 'j9', workflow_stage: 'production_complete', scheduled_install_date: daysFromNow(10) })
    expect(atRiskInstalls([j], now, 3)).toHaveLength(0)
  })

  it('treats an install scheduled today as at_risk, not overdue', () => {
    const j = job({ id: 'j10', workflow_stage: 'production_complete', scheduled_install_date: today })
    const result = atRiskInstalls([j], now, 3)
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('at_risk')
  })

  it('dedupes: an overdue job is reported once, never also as at_risk', () => {
    const j = job({ id: 'j11', workflow_stage: 'fabrication_scheduled', scheduled_install_date: daysFromNow(-1) })
    const result = atRiskInstalls([j], now, 3)
    expect(result.filter(r => r.id === 'j11')).toHaveLength(1)
    expect(result[0].kind).toBe('overdue')
  })

  it('returns an empty array when no jobs have a scheduled install date', () => {
    expect(atRiskInstalls([job({ scheduled_install_date: null })], now, 3)).toEqual([])
  })
})
