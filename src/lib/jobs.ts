import type { SupabaseClient } from '@supabase/supabase-js'
import type { StageHistoryEntry, WorkflowStage } from '@/types/database'

/**
 * Batch 11 — shared helper for moving a job to a new {@link WorkflowStage}
 * and appending an entry to its `stage_history` audit trail, used by both
 * `src/app/jobs/actions.ts` (staff-initiated stage moves) and
 * `src/app/quotes/actions.ts` (the quote-accepted / quote-sent lifecycle
 * hookups) so the append logic lives in exactly one place.
 *
 * Read-then-write (two round trips) rather than a Postgres jsonb-append
 * expression: supabase-js has no first-class jsonb concat operator on
 * `.update()`, and this table's write volume doesn't warrant a raw-SQL RPC
 * just to save one round trip.
 *
 * @param admin - Service-role Supabase client (bypasses RLS; callers must have already authorized the caller).
 * @param jobId - The job to move.
 * @param stage - The destination workflow stage.
 * @param actorId - Profile id of whoever triggered the move, recorded in the history entry.
 * @returns `{ error: null }` on success, or `{ error: <message> }` if the update failed.
 */
export async function advanceJobStage(
  admin: SupabaseClient,
  jobId: string,
  stage: WorkflowStage,
  actorId: string
): Promise<{ error: string | null }> {
  const { data: job, error: readError } = await admin
    .from('jobs')
    .select('stage_history')
    .eq('id', jobId)
    .single()
  if (readError) return { error: readError.message }

  const history: StageHistoryEntry[] = Array.isArray(job?.stage_history) ? job.stage_history : []
  const entry: StageHistoryEntry = { stage, at: new Date().toISOString(), actor_id: actorId }

  const { error } = await admin
    .from('jobs')
    .update({ workflow_stage: stage, stage_history: [...history, entry] })
    .eq('id', jobId)

  return { error: error?.message ?? null }
}
