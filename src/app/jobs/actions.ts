'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { advanceJobStage } from '@/lib/jobs'
import { JOB_STATUSES, WORKFLOW_STAGES } from '@/lib/constants'
import { isStaffRole } from '@/types/database'
import type { JobStatus, UserRole, WorkflowStage } from '@/types/database'

/**
 * Job server actions (WS4 §9.2). Staff-only — RLS also enforces this, but
 * the actions verify the caller's role explicitly and audit every change.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

async function getStaffCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || !isStaffRole(profile.role as UserRole)) return null
  return { supabase, user }
}

function revalidateJobs(jobId?: string) {
  revalidatePath('/jobs')
  revalidatePath('/jobs/calendar')
  if (jobId) revalidatePath(`/jobs/${jobId}`)
  revalidatePath('/dashboard')
}

/** Move a job to a new status (board dropdown / detail stepper). */
export async function updateJobStatusAction(jobId: string, status: JobStatus): Promise<ActionResult> {
  const caller = await getStaffCaller()
  if (!caller) return { ok: false, error: 'Staff only' }
  if (!JOB_STATUSES.includes(status)) return { ok: false, error: 'Invalid status' }

  const { error } = await caller.supabase
    .from('jobs')
    .update({ status })
    .eq('id', jobId)
  if (error) return { ok: false, error: error.message }

  const admin = createAdminClient()
  await admin.from('audit_logs').insert({
    actor_id: caller.user.id,
    action_type: 'job_status_change',
    target_table: 'jobs',
    target_id: jobId,
    change_summary: { to: status },
  })

  revalidateJobs(jobId)
  return { ok: true }
}

/** Set or clear the scheduled install date and update install notes. */
export async function scheduleJobAction(
  jobId: string,
  installDate: string | null,
  installNotes?: string | null
): Promise<ActionResult> {
  const caller = await getStaffCaller()
  if (!caller) return { ok: false, error: 'Staff only' }
  if (installDate && !/^\d{4}-\d{2}-\d{2}$/.test(installDate)) {
    return { ok: false, error: 'Invalid date' }
  }

  const update: Record<string, unknown> = { scheduled_install_date: installDate }
  if (installNotes !== undefined) update.install_notes = installNotes?.trim() || null

  const { error } = await caller.supabase.from('jobs').update(update).eq('id', jobId)
  if (error) return { ok: false, error: error.message }

  const admin = createAdminClient()
  await admin.from('audit_logs').insert({
    actor_id: caller.user.id,
    action_type: 'job_scheduled',
    target_table: 'jobs',
    target_id: jobId,
    change_summary: { scheduled_install_date: installDate },
  })

  revalidateJobs(jobId)
  return { ok: true }
}

/** Assign a staff member to a job (installer for v1 — role field reserved). */
export async function assignJobAction(jobId: string, assigneeId: string): Promise<ActionResult> {
  const caller = await getStaffCaller()
  if (!caller) return { ok: false, error: 'Staff only' }

  const { error } = await caller.supabase
    .from('job_assignments')
    .insert({ job_id: jobId, assignee_id: assigneeId })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Already assigned to this job' }
    return { ok: false, error: error.message }
  }

  revalidateJobs(jobId)
  return { ok: true }
}

/** Remove an assignment from a job. */
export async function unassignJobAction(assignmentId: string, jobId: string): Promise<ActionResult> {
  const caller = await getStaffCaller()
  if (!caller) return { ok: false, error: 'Staff only' }

  const { error } = await caller.supabase
    .from('job_assignments')
    .delete()
    .eq('id', assignmentId)
  if (error) return { ok: false, error: error.message }

  revalidateJobs(jobId)
  return { ok: true }
}

// ============================================================
// Batch 11: 16-stage order workflow (migration 00020)
// ============================================================

/**
 * Move a job to any of the 16 workflow stages (board dropdown / detail
 * stepper). Staff-only; appends to `stage_history` via `advanceJobStage`
 * and audit-logs the transition.
 */
export async function updateJobWorkflowStageAction(
  jobId: string,
  stage: WorkflowStage
): Promise<ActionResult> {
  const caller = await getStaffCaller()
  if (!caller) return { ok: false, error: 'Staff only' }
  if (!WORKFLOW_STAGES.includes(stage)) return { ok: false, error: 'Invalid stage' }

  const admin = createAdminClient()
  const { error } = await advanceJobStage(admin, jobId, stage, caller.user.id)
  if (error) return { ok: false, error }

  await admin.from('audit_logs').insert({
    actor_id: caller.user.id,
    action_type: 'job_stage_change',
    target_table: 'jobs',
    target_id: jobId,
    change_summary: { to: stage },
  })

  revalidateJobs(jobId)
  return { ok: true }
}

export interface CreateOrderInput {
  customer_id: string
  /** Optional — a fresh request may not have a property picked yet. */
  property_id: string | null
}

export type CreateOrderResult = { ok: true; job_id: string } | { ok: false; error: string }

/**
 * Staff "New Order" flow (Batch 11): creates a job at `request_received`
 * with no quote attached, for a walk-in request or a phone/site-visit
 * booking that predates any quote. `status` (the legacy field) is set to
 * `'pending'` since it's still `not null` in the DB; nothing reads it once
 * `workflow_stage` exists.
 */
export async function createOrderAction(input: CreateOrderInput): Promise<CreateOrderResult> {
  const caller = await getStaffCaller()
  if (!caller) return { ok: false, error: 'Staff only' }
  if (!input.customer_id) return { ok: false, error: 'A customer is required' }

  const admin = createAdminClient()
  const stage: WorkflowStage = 'request_received'
  const { data: job, error } = await admin
    .from('jobs')
    .insert({
      customer_id: input.customer_id,
      property_id: input.property_id,
      quote_id: null,
      status: 'pending',
      workflow_stage: stage,
      stage_history: [{ stage, at: new Date().toISOString(), actor_id: caller.user.id }],
      created_by: caller.user.id,
    })
    .select('id')
    .single()
  if (error || !job) return { ok: false, error: error?.message || 'Failed to create order' }

  await admin.from('audit_logs').insert({
    actor_id: caller.user.id,
    action_type: 'order_create',
    target_table: 'jobs',
    target_id: job.id,
    change_summary: { customer_id: input.customer_id, property_id: input.property_id },
  })

  revalidateJobs(job.id)
  return { ok: true, job_id: job.id }
}
