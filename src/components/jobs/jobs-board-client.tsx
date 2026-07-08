'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WorkflowStageSelect } from '@/components/jobs/workflow-stage-select'
import { NewOrderDialog, type OrderCustomerOption, type OrderPropertyOption } from '@/components/jobs/new-order-dialog'
import {
  WORKFLOW_STAGES,
  WORKFLOW_STAGE_LABELS,
  WORKFLOW_STAGE_SHORT_LABELS,
  WORKFLOW_STAGE_COLORS,
} from '@/lib/constants'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WorkflowStage } from '@/types/database'

export interface JobCard {
  id: string
  workflow_stage: WorkflowStage
  scheduled_install_date: string | null
  property_name: string
  customer_name: string
  total_ttd: number | null
  assignees: { id: string; name: string }[]
}

interface JobsBoardClientProps {
  cards: JobCard[]
  staff: { id: string; name: string }[]
  /** Only staff can move a job's stage or create a new order. */
  isStaff: boolean
  /** Populated only for staff — powers the New Order dialog's pickers. */
  customers: OrderCustomerOption[]
  properties: OrderPropertyOption[]
  /** Deep-link support (e.g. from the admin dashboard's workflow strip tiles, `/jobs?stage=...`). */
  initialStage?: WorkflowStage
}

const ALL_STAGES_VALUE = 'all'

/**
 * 16-stage jobs board (Batch 11): one section per workflow stage in stage
 * order, collapsed/hidden when empty by default (16 sections would
 * otherwise dominate the page), with a stage filter that still reaches
 * empty stages, an assignee filter, and — for staff — a per-card stage
 * dropdown and a "New Order" entry point for pre-quote requests.
 */
export function JobsBoardClient({ cards, staff, isStaff, customers, properties, initialStage }: JobsBoardClientProps) {
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [stageFilter, setStageFilter] = useState<string>(initialStage ?? ALL_STAGES_VALUE)
  // Sections start collapsed except the first non-empty one is expanded by
  // default so the board doesn't look empty on first load; users can open
  // any section (including a 0-count one, e.g. to see it's genuinely empty
  // right before creating the first order there).
  const [openStages, setOpenStages] = useState<Set<string>>(() => new Set())

  const filtered = useMemo(() => {
    let rows = cards
    if (assigneeFilter !== 'all') rows = rows.filter(c => c.assignees.some(a => a.id === assigneeFilter))
    if (stageFilter !== ALL_STAGES_VALUE) rows = rows.filter(c => c.workflow_stage === stageFilter)
    return rows
  }, [cards, assigneeFilter, stageFilter])

  const byStage = useMemo(() => {
    const map = new Map<WorkflowStage, JobCard[]>()
    for (const stage of WORKFLOW_STAGES) map.set(stage, [])
    for (const card of filtered) {
      map.get(card.workflow_stage)?.push(card)
    }
    return map
  }, [filtered])

  function toggleStage(stage: string) {
    setOpenStages(prev => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  const visibleStages = stageFilter === ALL_STAGES_VALUE
    ? WORKFLOW_STAGES.filter(s => (byStage.get(s)?.length ?? 0) > 0)
    : WORKFLOW_STAGES.filter(s => s === stageFilter)

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Select value={stageFilter} onValueChange={v => setStageFilter(v ?? ALL_STAGES_VALUE)}>
            <SelectTrigger className="w-full sm:w-64">
              <SelectValue>
                {(v: string) => (v === ALL_STAGES_VALUE ? 'All stages' : WORKFLOW_STAGE_SHORT_LABELS[v] ?? v)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STAGES_VALUE}>All stages</SelectItem>
              {WORKFLOW_STAGES.map(s => (
                <SelectItem key={s} value={s}>
                  {WORKFLOW_STAGE_SHORT_LABELS[s]} ({byStage.get(s)?.length ?? 0})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={assigneeFilter} onValueChange={v => setAssigneeFilter(v ?? 'all')}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue>
                {(v: string) => (v === 'all' ? 'All assignees' : staff.find(s => s.id === v)?.name ?? 'Assignee')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All assignees</SelectItem>
              {staff.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isStaff && <NewOrderDialog customers={customers} properties={properties} />}
      </div>

      {cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">
              No orders yet. Create one with New Order, or one appears automatically when a quote is accepted.
            </p>
          </CardContent>
        </Card>
      ) : visibleStages.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No orders match this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleStages.map(stage => {
            const column = byStage.get(stage) ?? []
            const isOpen = stageFilter !== ALL_STAGES_VALUE || openStages.has(stage)
            return (
              <div key={stage} className="rounded-lg border">
                <button
                  type="button"
                  onClick={() => toggleStage(stage)}
                  disabled={stageFilter !== ALL_STAGES_VALUE}
                  className="flex w-full items-center justify-between gap-2 rounded-lg p-3 text-left hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="flex items-center gap-2">
                    {stageFilter === ALL_STAGES_VALUE && (
                      isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <span className={cn('rounded-md border px-2 py-0.5 text-xs font-medium', WORKFLOW_STAGE_COLORS[stage])}>
                      {WORKFLOW_STAGE_SHORT_LABELS[stage]}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:inline">{WORKFLOW_STAGE_LABELS[stage]}</span>
                  </span>
                  <Badge variant="secondary">{column.length}</Badge>
                </button>

                {isOpen && (
                  <div className="grid gap-2 border-t p-3 md:grid-cols-2 xl:grid-cols-3">
                    {column.map(card => (
                      <Card key={card.id}>
                        <CardContent className="space-y-2 p-3">
                          <Link href={`/jobs/${card.id}`} className="block">
                            <p className="text-sm font-medium hover:underline">{card.property_name}</p>
                            {card.customer_name && (
                              <p className="text-xs text-muted-foreground">{card.customer_name}</p>
                            )}
                          </Link>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {card.total_ttd !== null && <span>TTD ${card.total_ttd.toFixed(0)}</span>}
                            {card.scheduled_install_date && (
                              <Badge variant="outline" className="text-[10px]">
                                {format(new Date(card.scheduled_install_date), 'MMM d')}
                              </Badge>
                            )}
                            {card.assignees.map(a => (
                              <Badge key={a.id} variant="secondary" className="text-[10px]">{a.name}</Badge>
                            ))}
                          </div>
                          {isStaff && <WorkflowStageSelect jobId={card.id} stage={card.workflow_stage} size="sm" />}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
