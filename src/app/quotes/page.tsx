import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText } from 'lucide-react'
import { format } from 'date-fns'

export default async function QuotesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: quotes } = await supabase
    .from('quotes')
    .select('*, properties(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Quotes</h1>

      {!quotes || quotes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No quotes yet. Configure windows on a property and generate a quote.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {quotes.map(q => {
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
    </div>
  )
}
