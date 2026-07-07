'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { updateJobStatusAction } from '@/app/jobs/actions'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/lib/constants'
import type { JobStatus } from '@/types/database'

/** Status dropdown used on the board and job detail — server-action backed. */
export function JobStatusSelect({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [value, setValue] = useState<JobStatus>(status)
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function change(next: string | null) {
    const nextStatus = (next ?? value) as JobStatus
    if (nextStatus === value) return
    setBusy(true)
    const prev = value
    setValue(nextStatus)
    const result = await updateJobStatusAction(jobId, nextStatus)
    setBusy(false)
    if (!result.ok) {
      setValue(prev)
      toast.error(result.error)
      return
    }
    toast.success(`Job moved to ${JOB_STATUS_LABELS[nextStatus]}`)
    router.refresh()
  }

  return (
    <Select value={value} onValueChange={change} disabled={busy}>
      <SelectTrigger className="h-8 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {JOB_STATUSES.map(s => (
          <SelectItem key={s} value={s}>{JOB_STATUS_LABELS[s]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
