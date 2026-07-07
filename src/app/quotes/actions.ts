'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { effectiveQuoteStatus, isStaffRole } from '@/types/database'
import type { QuoteNote, QuoteStatus, UserRole } from '@/types/database'

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
  revalidatePath(`/quotes/${quoteId}`)
  revalidatePath('/quotes')
  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Accept a sent quote. The owning customer accepts from their quote view;
 * staff may also mark a quote accepted (phone acceptance). Accepting
 * auto-creates the job in 'pending' (WS4 §9.2).
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

  // Auto-create the job (idempotent — quote_id is unique on jobs).
  const { error: jobError } = await admin
    .from('jobs')
    .upsert(
      {
        quote_id: quoteId,
        property_id: quote.property_id,
        status: 'pending',
        created_by: caller.user.id,
      },
      { onConflict: 'quote_id', ignoreDuplicates: true }
    )
  if (jobError) {
    // The acceptance stands; surface the job problem for staff to fix.
    await logTransition(caller.user.id, quoteId, 'job_create_failed', { error: jobError.message })
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
