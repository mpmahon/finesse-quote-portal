'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { JobStatusSelect } from '@/components/jobs/job-status-select'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/lib/constants'
import { format } from 'date-fns'
import { Wrench } from 'lucide-react'
import type { JobStatus } from '@/types/database'

export interface JobCard {
  id: string
  status: string
  scheduled_install_date: string | null
  property_name: string
  customer_name: string
  total_ttd: number | null
  assignees: { id: string; name: string }[]
}

interface JobsBoardClientProps {
  cards: JobCard[]
  staff: { id: string; name: string }[]
}

/** Kanban-style board grouped by status; columns stack on mobile. */
export function JobsBoardClient({ cards, staff }: JobsBoardClientProps) {
  const [assigneeFilter, setAssigneeFilter] = useState('all')

  const filtered = assigneeFilter === 'all'
    ? cards
    : cards.filter(c => c.assignees.some(a => a.id === assigneeFilter))

  if (cards.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Wrench className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">No jobs yet. Jobs appear automatically when a quote is accepted.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <div className="mb-4 sm:w-64">
        <Select value={assigneeFilter} onValueChange={v => setAssigneeFilter(v ?? 'all')}>
          <SelectTrigger>
            <SelectValue>
              {(v: string) =>
                v === 'all' ? 'All assignees' : staff.find(s => s.id === v)?.name ?? 'Assignee'
              }
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {JOB_STATUSES.map(status => {
          const column = filtered.filter(c => c.status === status)
          return (
            <div key={status} className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">{JOB_STATUS_LABELS[status]}</p>
                <Badge variant="secondary">{column.length}</Badge>
              </div>
              <div className="space-y-2">
                {column.length === 0 ? (
                  <p className="py-3 text-center text-xs text-muted-foreground">Empty</p>
                ) : (
                  column.map(card => (
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
                        <JobStatusSelect jobId={card.id} status={card.status as JobStatus} />
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
