'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { updateJobWorkflowStageAction } from '@/app/jobs/actions'
import { WORKFLOW_STAGES, WORKFLOW_STAGE_SHORT_LABELS } from '@/lib/constants'
import type { WorkflowStage } from '@/types/database'

interface WorkflowStageSelectProps {
  jobId: string
  stage: WorkflowStage
  /** Compact sizing for board cards vs. the fuller detail-page control. */
  size?: 'sm' | 'default'
}

/**
 * 16-stage workflow dropdown (Batch 11) used on the jobs board and the
 * job-detail stepper — staff-only server-action backed. Replaces the old
 * 6-value `JobStatusSelect` as the primary stage-move control; that
 * component (and the `status` field it drives) is left in place for
 * backward compatibility but is no longer wired into the board/detail UI.
 *
 * Uses the explicit `SelectValue` render-function pattern (this codebase's
 * recurring raw-UUID/label-registry bug with Base UI's Select) even though
 * the value here is a stable slug, not a UUID — kept for consistency with
 * every other Select in the jobs area and to guard against the same
 * remount-loses-label issue if this is ever driven by an id in the future.
 */
export function WorkflowStageSelect({ jobId, stage, size = 'default' }: WorkflowStageSelectProps) {
  const [value, setValue] = useState<WorkflowStage>(stage)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function change(next: string | null) {
    const nextStage = (next ?? value) as WorkflowStage
    if (nextStage === value) return
    setBusy(true)
    const prev = value
    setValue(nextStage)
    const result = await updateJobWorkflowStageAction(jobId, nextStage)
    setBusy(false)
    if (!result.ok) {
      setValue(prev)
      toast.error(result.error)
      return
    }
    toast.success(`Moved to ${WORKFLOW_STAGE_SHORT_LABELS[nextStage]}`)
    router.refresh()
  }

  return (
    <Select value={value} onValueChange={change} disabled={busy}>
      <SelectTrigger className={size === 'sm' ? 'h-8 w-full text-xs' : 'w-full'}>
        <SelectValue>{(v: string) => WORKFLOW_STAGE_SHORT_LABELS[v] ?? v}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {WORKFLOW_STAGES.map(s => (
          <SelectItem key={s} value={s}>{WORKFLOW_STAGE_SHORT_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
