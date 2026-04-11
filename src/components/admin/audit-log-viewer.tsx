'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'
import { format } from 'date-fns'

interface AuditLog {
  id: string
  created_at: string
  action_type: string
  target_table: string | null
  target_id: string | null
  change_summary: Record<string, unknown> | null
  profiles: { first_name: string; last_name: string } | null
}

export function AuditLogViewer({ logs }: { logs: AuditLog[] }) {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState<string>('all')

  const actionTypes = Array.from(new Set(logs.map(l => l.action_type)))

  const filtered = logs.filter(log => {
    const actorName = `${log.profiles?.first_name || ''} ${log.profiles?.last_name || ''}`.trim().toLowerCase()
    const matchesSearch = search === '' ||
      actorName.includes(search.toLowerCase()) ||
      log.action_type.toLowerCase().includes(search.toLowerCase()) ||
      (log.target_table || '').toLowerCase().includes(search.toLowerCase()) ||
      JSON.stringify(log.change_summary || {}).toLowerCase().includes(search.toLowerCase())

    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter

    return matchesSearch && matchesAction
  })

  return (
    <>
      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search activity by actor, action, or details..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={actionFilter} onValueChange={v => setActionFilter(v ?? 'all')}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actionTypes.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Activity ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No audit log entries match your filters.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(log => (
                  <TableRow key={log.id}>
                    <TableCell className="text-xs">
                      {format(new Date(log.created_at), 'MMM d, yyyy h:mm a')}
                    </TableCell>
                    <TableCell>
                      {log.profiles?.first_name} {log.profiles?.last_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{log.action_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {log.target_table}
                      {log.target_id && ` (${log.target_id.slice(0, 8)})`}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-xs text-muted-foreground">
                      {log.change_summary ? JSON.stringify(log.change_summary).slice(0, 100) : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
