'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JOB_STATUSES } from '@/lib/constants'
import { isStaffRole } from '@/types/database'
import type { JobStatus, UserRole } from '@/types/database'

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
