'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Calculator } from 'lucide-react'
import { toast } from 'sonner'

export function GenerateQuoteButton({ propertyId }: { propertyId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleGenerate() {
    setLoading(true)
    try {
      const res = await fetch('/api/quotes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate quote')
      toast.success('Quote generated!')
      router.push(`/quotes/${data.quote_id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate quote')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button onClick={handleGenerate} disabled={loading} variant="default">
      <Calculator className="mr-2 h-4 w-4" />
      {loading ? 'Generating...' : 'Generate Quote'}
    </Button>
  )
}
