'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

export function RegenerateQuoteButton({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleRegenerate() {
    if (!confirm('Regenerate this quote with current pricing? A new quote will be created; the existing one stays as a historical record.')) {
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/quotes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate quote')
      toast.success('Quote regenerated with current pricing')
      router.push(`/quotes/${data.quote_id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to regenerate quote')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      onClick={handleRegenerate}
      disabled={loading}
      className="bg-amber-600 hover:bg-amber-700"
    >
      <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
      {loading ? 'Regenerating...' : 'Regenerate with Current Pricing'}
    </Button>
  )
}
