'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Search, User, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import type { StaleReason } from '@/lib/quote-staleness'

interface Quote {
  id: string
  created_at: string
  expires_at: string | null
  total_ttd: number
  status: string
  properties: { name: string } | null
  profiles?: {
    id: string
    first_name: string
    last_name: string
    email: string
  } | null
  is_stale?: boolean
  stale_reason?: StaleReason
}

interface QuotesListClientProps {
  quotes: Quote[]
  showCustomer?: boolean
}

export function QuotesListClient({ quotes, showCustomer = false }: QuotesListClientProps) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const staleCount = quotes.filter(q => q.is_stale).length

  const filtered = quotes.filter(q => {
    const propName = q.properties?.name || ''
    const customerName = q.profiles ? `${q.profiles.first_name} ${q.profiles.last_name}` : ''
    const customerEmail = q.profiles?.email || ''

    const matchesSearch = search === '' ||
      propName.toLowerCase().includes(search.toLowerCase()) ||
      q.id.toLowerCase().includes(search.toLowerCase()) ||
      customerName.toLowerCase().includes(search.toLowerCase()) ||
      customerEmail.toLowerCase().includes(search.toLowerCase())

    const isExpired = q.expires_at && new Date(q.expires_at) < new Date()
    const effectiveStatus = isExpired ? 'expired' : q.status
    let matchesStatus = true
    if (statusFilter === 'stale') {
      matchesStatus = !!q.is_stale
    } else if (statusFilter !== 'all') {
      matchesStatus = effectiveStatus === statusFilter
    }

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
      {staleCount > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900 dark:text-amber-200">
              {staleCount} quote{staleCount !== 1 ? 's' : ''} affected by pricing changes
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
              Pricing has been updated since these quotes were generated. Open a quote to regenerate it with current prices.
            </p>
          </div>
        </div>
      )}

      {quotes.length > 3 && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={showCustomer ? "Search by property, customer, or quote ID..." : "Search by property name or quote ID..."}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v ?? 'all')}>
            <SelectTrigger className="sm:w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="final">Final</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              {staleCount > 0 && (
                <SelectItem value="stale">Affected by pricing change</SelectItem>
              )}
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
                <Card className={`transition-colors hover:bg-accent/50 ${q.is_stale ? 'border-amber-500/40' : ''}`}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{q.properties?.name || 'Unknown Property'}</p>
                        {q.is_stale && (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Pricing Changed
                          </Badge>
                        )}
                      </div>
                      {showCustomer && q.profiles && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>
                            {q.profiles.first_name} {q.profiles.last_name}
                          </span>
                          <span>·</span>
                          <span>{q.profiles.email}</span>
                        </div>
                      )}
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
