import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WORKFLOW_STAGE_SHORT_LABELS } from '@/lib/constants'
import { format } from 'date-fns'
import type { StageHistoryEntry } from '@/types/database'

interface StageHistoryListProps {
  history: StageHistoryEntry[]
  /** actor_id -> display name, resolved server-side (staff-only profiles). */
  actorNames: Record<string, string>
}

/**
 * Chronological (most-recent-first) list of a job's workflow_stage moves —
 * who moved it, to which stage, and when. Read-only; stage changes happen
 * through {@link WorkflowStageSelect}.
 */
export function StageHistoryList({ history, actorNames }: StageHistoryListProps) {
  const entries = [...history].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Stage History</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history yet.</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {entries.map((entry, i) => (
              <li key={`${entry.stage}-${entry.at}-${i}`} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0 last:pb-0">
                <span>
                  <span className="font-medium">{WORKFLOW_STAGE_SHORT_LABELS[entry.stage] ?? entry.stage}</span>
                  <span className="text-muted-foreground"> — {actorNames[entry.actor_id] ?? 'Unknown'}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(new Date(entry.at), 'MMM d, yyyy h:mm a')}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
