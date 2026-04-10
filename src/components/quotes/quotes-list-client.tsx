'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Search } from 'lucide-react'
import { format } from 'date-fns'

interface Quote {
  id: string
  created_at: string
  expires_at: string | null
  total_ttd: number
  status: string
  properties: { name: string } | null
}

export function QuotesListClient({ quotes }: { quotes: Quote[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filtered = quotes.filter(q => {
    const propName = q.properties?.name || ''
    const matchesSearch = search === '' ||
      propName.toLowerCase().includes(search.toLowerCase()) ||
      q.id.toLowerCase().includes(search.toLowerCase())

    const isExpired = q.expires_at && new Date(q.expires_at) < new Date()
    const effectiveStatus = isExpired ? 'expired' : q.status
    const matchesStatus = statusFilter === 'all' || effectiveStatus === statusFilter

    return matchesSearch && matchesStatus
  })

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            No quotes yet. Configure windows on a property and generate a quote.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {quotes.length > 3 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by property name or quote ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? 'all')}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="final">Final</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No quotes match your filters.</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => {
            const isExpired = q.expires_at && new Date(q.expires_at) < new Date()
            return (
              <Link key={q.id} href={`/quotes/${q.id}`}>
                <Card className="transition-colors hover:bg-accent/50">
                  <CardContent className="flex items-center justify-between py-4">
                    <div>
                      <p className="font-medium">{q.properties?.name || 'Unknown Property'}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(q.created_at), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold">${Number(q.total_ttd).toFixed(2)} TTD</p>
                      <Badge variant={isExpired ? 'destructive' : q.status === 'final' ? 'default' : 'secondary'}>
                        {isExpired ? 'Expired' : q.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </>
  )
}
