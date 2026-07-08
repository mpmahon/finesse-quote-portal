import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WORKFLOW_STAGES, WORKFLOW_STAGE_ORDER, WORKFLOW_STAGE_SHORT_LABELS } from '@/lib/constants'
import type { WorkflowStage } from '@/types/database'

interface WorkflowStepperProps {
  stage: WorkflowStage
  className?: string
}

/**
 * Compact horizontally-scrollable stepper across all 16 workflow stages —
 * done / current / upcoming, replacing the old 6-value status stepper on
 * the job detail page. Horizontal + scroll (rather than a full vertical
 * list) keeps the detail page usable on desktop where 16 steps would
 * otherwise dominate the layout; `overflow-x-auto` handles narrow screens.
 */
export function WorkflowStepper({ stage, className }: WorkflowStepperProps) {
  const currentIdx = WORKFLOW_STAGE_ORDER[stage] ?? 0

  return (
    <div className={cn('flex gap-1 overflow-x-auto pb-1', className)}>
      {WORKFLOW_STAGES.map((s, i) => {
        const done = i < currentIdx
        const current = i === currentIdx
        return (
          <div
            key={s}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs whitespace-nowrap',
              current && 'border-primary bg-primary/10 font-medium text-primary',
              done && !current && 'border-emerald-200 bg-emerald-50 text-emerald-700',
              !done && !current && 'border-border text-muted-foreground'
            )}
          >
            {done && !current ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{i + 1}</span>}
            {WORKFLOW_STAGE_SHORT_LABELS[s]}
          </div>
        )
      })}
    </div>
  )
}
