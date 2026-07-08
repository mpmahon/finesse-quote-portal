'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { advanceJobStage } from '@/lib/jobs'
import { PRE_QUOTE_WORKFLOW_STAGES } from '@/lib/constants'
import { effectiveQuoteStatus, isStaffRole } from '@/types/database'
import type { QuoteNote, QuoteStatus, UserRole, WorkflowStage } from '@/types/database'

/**
 * Quote server actions (WS1 §5.1).
 *
 * Customers have zero direct write access to the quotes table (RLS, migration
 * 00009). Every quote mutation flows through here: the caller's session and
 * role are verified server-side, the mutation is scoped to an explicit column
 * whitelist, and privileged writes use the service-role client only after
 * authorization checks pass.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

/** Loads the caller's profile role, or null when unauthenticated. */
async function getCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) return null
  return { supabase, user, role: profile.role as UserRole }
}

/**
 * Update the notes on a quote. Staff can edit notes on any quote; a customer
 * may edit notes only on their own quote. Only the `notes` column is ever
 * written — pricing columns are unreachable regardless of input.
 */
export async function updateQuoteNotesAction(
  quoteId: string,
  notes: QuoteNote[]
): Promise<ActionResult> {
  const caller = await getCaller()
  if (!caller) return { ok: false, error: 'Not authenticated' }

  // Sanitize: keep only the expected shape, drop empty notes.
  const cleaned: QuoteNote[] = (notes ?? [])
    .filter(n => typeof n?.text === 'string' && n.text.trim().length > 0)
    .map(n => ({
      id: String(n.id ?? ''),
      text: n.text.trim(),
      show_on_pdf: Boolean(n.show_on_pdf),
    }))

  // The quote must be visible to the caller (RLS-scoped read).
  const { data: quote } = await caller.supabase
    .from('quotes')
    .select('id, user_id')
    .eq('id', quoteId)
    .single()
  if (!quote) return { ok: false, error: 'Quote not found' }

  const isStaff = isStaffRole(caller.role)
  if (!isStaff && quote.user_id !== caller.user.id) {
    return { ok: false, error: 'You can only edit notes on your own quotes' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('quotes')
    .update({ notes: cleaned })
    .eq('id', quoteId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/quotes/${quoteId}`)
  return { ok: true }
}

// ============================================================
// Lifecycle transitions (WS4 §9.1)
//
// draft → sent (staff) → accepted | declined (customer-owner or staff).
// 'expired' is derived from expires_at at read time; accepted quotes are
// immutable — changes require regeneration (existing staleness flow).
// Every transition writes audit_logs via the service-role client.
// ============================================================

interface QuoteRow {
  id: string
  user_id: string
  property_id: string
  status: QuoteStatus
  expires_at: string | null
}

type Caller = NonNullable<Awaited<ReturnType<typeof getCaller>>>
type LoadedQuote =
  | { kind: 'error'; message: string }
  | { kind: 'ok'; caller: Caller; quote: QuoteRow }

async function loadQuoteForTransition(quoteId: string): Promise<LoadedQuote> {
  const caller = await getCaller()
  if (!caller) return { kind: 'error', message: 'Not authenticated' }
  const { data: quote } = await caller.supabase
    .from('quotes')
    .select('id, user_id, property_id, status, expires_at')
    .eq('id', quoteId)
    .single()
  if (!quote) return { kind: 'error', message: 'Quote not found' }
  return { kind: 'ok', caller, quote: quote as QuoteRow }
}

async function logTransition(actorId: string, quoteId: string, action: string, summary: Record<string, unknown>) {
  const admin = createAdminClient()
  await admin.from('audit_logs').insert({
    actor_id: actorId,
    action_type: action,
    target_table: 'quotes',
    target_id: quoteId,
    change_summary: summary,
  })
}

/** Staff marks a draft quote as sent to the customer (stamps sent_at). */
export async function sendQuoteAction(quoteId: string): Promise<ActionResult> {
  const loaded = await loadQuoteForTransition(quoteId)
  if (loaded.kind === 'error') return { ok: false, error: loaded.message }
  const { caller, quote } = loaded

  if (!isStaffRole(caller.role)) {
    return { ok: false, error: 'Only staff can send quotes' }
  }
  const status = effectiveQuoteStatus(quote)
  if (status !== 'draft') {
    return { ok: false, error: `Only draft quotes can be sent (this quote is ${status})` }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('quotes')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', quoteId)
  if (error) return { ok: false, error: error.message }

  await logTransition(caller.user.id, quoteId, 'quote_sent', { from: 'draft', to: 'sent' })
  await advancePreQuoteJobOnSend(admin, quoteId, quote.user_id, quote.property_id, caller.user.id)
  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/quotes')
  revalidatePath('/dashboard')
  revalidatePath('/jobs')
  return { ok: true }
}

/**
 * Batch 11 lifecycle hookup: when a staff-created quote is sent, best-effort
 * match it to a pre-quote order (workflow stages 1-5, no quote attached yet)
 * for the same customer + property, and advance that order to `quote_sent` —
 * linking `quote_id` at the same time so the later accept-quote upsert
 * (keyed on `quote_id`) updates this same row instead of creating a
 * duplicate order. Ambiguous matches (more than one candidate) are skipped
 * silently rather than guessing which one this quote is for; so is the
 * case where the customer has no matching pre-quote order at all (the
 * normal case for a customer-self-generated quote, which never has one).
 */
async function advancePreQuoteJobOnSend(
  admin: ReturnType<typeof createAdminClient>,
  quoteId: string,
  customerId: string,
  propertyId: string,
  actorId: string
) {
  const { data: candidates } = await admin
    .from('jobs')
    .select('id')
    .is('quote_id', null)
    .eq('customer_id', customerId)
    .eq('property_id', propertyId)
    .in('workflow_stage', PRE_QUOTE_WORKFLOW_STAGES)

  if (!candidates || candidates.length !== 1) return

  const jobId = candidates[0].id
  const stage: WorkflowStage = 'quote_sent'
  await admin.from('jobs').update({ quote_id: quoteId }).eq('id', jobId)
  await advanceJobStage(admin, jobId, stage, actorId)
}

/**
 * Accept a sent quote. The owning customer accepts from their quote view;
 * staff may also mark a quote accepted (phone acceptance). Accepting
 * auto-creates the job (or advances an existing pre-quote order) at the
 * `job_approved` workflow stage (Batch 11, migration 00020).
 */
export async function acceptQuoteAction(quoteId: string): Promise<ActionResult> {
  const loaded = await loadQuoteForTransition(quoteId)
  if (loaded.kind === 'error') return { ok: false, error: loaded.message }
  const { caller, quote } = loaded

  const isStaff = isStaffRole(caller.role)
  if (!isStaff && quote.user_id !== caller.user.id) {
    return { ok: false, error: 'You can only accept your own quotes' }
  }
  const status = effectiveQuoteStatus(quote)
  if (status !== 'sent') {
    return {
      ok: false,
      error: status === 'expired'
        ? 'This quote has expired — ask us to re-issue it with current pricing'
        : `Only sent quotes can be accepted (this quote is ${status})`,
    }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('quotes')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: caller.user.id,
    })
    .eq('id', quoteId)
  if (error) return { ok: false, error: error.message }

  // Auto-create the job, or advance it if one already exists. Batch 11: a
  // pre-quote order may already be linked to this quote_id via
  // `advancePreQuoteJobOnSend` (fired when the quote was sent) — in that
  // case we must ADVANCE its existing row to `job_approved` rather than
  // upsert-with-ignoreDuplicates, which would silently no-op on the
  // existing row and leave it stuck at `quote_sent` forever. Acceptance
  // starts the order at `job_approved` (stage 6) rather than the old
  // `pending`, since acceptance is exactly the "written confirmation +
  // deposit" stage.
  const stage: WorkflowStage = 'job_approved'
  const { data: existingJob } = await admin
    .from('jobs')
    .select('id')
    .eq('quote_id', quoteId)
    .maybeSingle()

  let jobErrorMessage: string | null = null
  if (existingJob) {
    const { error: advanceError } = await advanceJobStage(admin, existingJob.id, stage, caller.user.id)
    jobErrorMessage = advanceError
    if (!advanceError) {
      await admin
        .from('jobs')
        .update({ customer_id: quote.user_id, property_id: quote.property_id })
        .eq('id', existingJob.id)
    }
  } else {
    const { error: insertError } = await admin.from('jobs').insert({
      quote_id: quoteId,
      property_id: quote.property_id,
      customer_id: quote.user_id,
      status: 'pending',
      workflow_stage: stage,
      stage_history: [{ stage, at: new Date().toISOString(), actor_id: caller.user.id }],
      created_by: caller.user.id,
    })
    // Race guard: two near-simultaneous "Accept" clicks could both see no
    // existing row and both attempt an insert; quote_id's unique
    // constraint rejects the second one (Postgres 23505) — treat that as
    // "already created by the other request" rather than a real failure.
    jobErrorMessage = insertError && insertError.code !== '23505' ? insertError.message : null
  }
  if (jobErrorMessage) {
    // The acceptance stands; surface the job problem for staff to fix.
    await logTransition(caller.user.id, quoteId, 'job_create_failed', { error: jobErrorMessage })
  }

  await logTransition(caller.user.id, quoteId, 'quote_accepted', { from: 'sent', to: 'accepted' })
  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/quotes')
  revalidatePath('/jobs')
  revalidatePath('/dashboard')
  return { ok: true }
}

/** Decline a sent quote (owner or staff), with an optional reason. */
export async function declineQuoteAction(quoteId: string, reason?: string): Promise<ActionResult> {
  const loaded = await loadQuoteForTransition(quoteId)
  if (loaded.kind === 'error') return { ok: false, error: loaded.message }
  const { caller, quote } = loaded

  const isStaff = isStaffRole(caller.role)
  if (!isStaff && quote.user_id !== caller.user.id) {
    return { ok: false, error: 'You can only decline your own quotes' }
  }
  const status = effectiveQuoteStatus(quote)
  if (status !== 'sent') {
    return { ok: false, error: `Only sent quotes can be declined (this quote is ${status})` }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('quotes')
    .update({
      status: 'declined',
      declined_at: new Date().toISOString(),
      decline_reason: reason?.trim() || null,
    })
    .eq('id', quoteId)
  if (error) return { ok: false, error: error.message }

  await logTransition(caller.user.id, quoteId, 'quote_declined', {
    from: 'sent',
    to: 'declined',
    reason: reason?.trim() || null,
  })
  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/quotes')
  revalidatePath('/dashboard')
  return { ok: true }
}
