'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { scheduleJobAction, assignJobAction, unassignJobAction } from '@/app/jobs/actions'
import { WorkflowStageSelect } from '@/components/jobs/workflow-stage-select'
import { WorkflowStepper } from '@/components/jobs/workflow-stepper'
import { StageHistoryList } from '@/components/jobs/stage-history-list'
import type { StageHistoryEntry, WorkflowStage } from '@/types/database'

interface JobDetailControlsProps {
  jobId: string
  workflowStage: WorkflowStage
  stageHistory: StageHistoryEntry[]
  /** actor_id -> display name, resolved server-side for the stage-history list. */
  actorNames: Record<string, string>
  /** Only staff can move the workflow stage — gates the stage dropdown. Schedule/assignee actions were already staff-only server-side before this batch and are unchanged. */
  isStaff: boolean
  scheduledInstallDate: string | null
  installNotes: string | null
  assignments: { id: string; assignee_id: string; name: string }[]
  staff: { id: string; name: string }[]
}

/**
 * Job detail controls (Batch 11): the 16-stage workflow stepper + stage
 * dropdown + stage-history list, plus the pre-existing install date picker,
 * notes, and assignee management — all through staff-only server actions.
 * Replaces the old 6-value status stepper (`JobStatusSelect`/`JOB_STATUSES`)
 * as the primary progression control on this page.
 */
export function JobDetailControls({
  jobId,
  workflowStage,
  stageHistory,
  actorNames,
  isStaff,
  scheduledInstallDate,
  installNotes,
  assignments,
  staff,
}: JobDetailControlsProps) {
  const [date, setDate] = useState(scheduledInstallDate ?? '')
  const [notes, setNotes] = useState(installNotes ?? '')
  const [assignee, setAssignee] = useState('')
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function saveSchedule() {
    setBusy(true)
    const result = await scheduleJobAction(jobId, date || null, notes)
    setBusy(false)
    if (!result.ok) { toast.error(result.error); return }
    toast.success('Schedule saved')
    router.refresh()
  }

  async function addAssignee() {
    if (!assignee) return
    setBusy(true)
    const result = await assignJobAction(jobId, assignee)
    setBusy(false)
    if (!result.ok) { toast.error(result.error); return }
    toast.success('Assigned')
    setAssignee('')
    router.refresh()
  }

  async function removeAssignee(assignmentId: string) {
    const result = await unassignJobAction(assignmentId, jobId)
    if (!result.ok) { toast.error(result.error); return }
    toast.success('Removed')
    router.refresh()
  }

  const available = staff.filter(s => !assignments.some(a => a.assignee_id === s.id))

  return (
    <div className="space-y-6">
      {/* Workflow stage stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Order Workflow</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <WorkflowStepper stage={workflowStage} />
          {isStaff && <WorkflowStageSelect jobId={jobId} stage={workflowStage} />}
        </CardContent>
      </Card>

      <StageHistoryList history={stageHistory} actorNames={actorNames} />

      {/* Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Installation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="install-date">Scheduled install date</Label>
            <Input
              id="install-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="install-notes">Install notes</Label>
            <Textarea
              id="install-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Access instructions, parking, ladder needed…"
            />
          </div>
          <Button onClick={saveSchedule} disabled={busy} size="sm">
            {busy ? 'Saving…' : 'Save Schedule'}
          </Button>
        </CardContent>
      </Card>

      {/* Assignees */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assigned team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No one assigned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {assignments.map(a => (
                <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                  {a.name}
                  <button
                    onClick={() => removeAssignee(a.id)}
                    className="rounded-full p-0.5 hover:bg-black/10"
                    aria-label={`Remove ${a.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {available.length > 0 && (
            <div className="flex gap-2">
              <Select value={assignee} onValueChange={v => setAssignee(v ?? '')}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Pick a team member">
                    {(v: string) => staff.find(s => s.id === v)?.name ?? 'Pick a team member'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {available.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addAssignee} disabled={!assignee || busy} size="sm">
                Assign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
