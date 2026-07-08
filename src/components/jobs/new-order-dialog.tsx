'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createOrderAction } from '@/app/jobs/actions'

/** Minimal customer shape needed for the New Order customer picker. */
export interface OrderCustomerOption {
  id: string
  first_name: string
  last_name: string
  email: string
}

/** Minimal property shape needed to list a customer's existing properties. */
export interface OrderPropertyOption {
  id: string
  name: string
  user_id: string
}

interface NewOrderDialogProps {
  customers: OrderCustomerOption[]
  properties: OrderPropertyOption[]
}

/**
 * Staff "New Order" flow (Batch 11): pick an existing customer, optionally
 * one of their existing properties, and create a job at `request_received`
 * with no quote attached — for a walk-in request or a phone/site-visit
 * booking that predates a quote (workflow stages 1-5).
 *
 * Uses the explicit `SelectValue` render-function pattern (id -> label)
 * per the recurring raw-UUID display bug in this codebase — copied from
 * `src/components/gallery/quote-from-style-dialog.tsx`.
 */
export function NewOrderDialog({ customers, properties }: NewOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  const selectedCustomer = customers.find(c => c.id === customerId) ?? null
  const customerProperties = useMemo(
    () => properties.filter(p => p.user_id === customerId),
    [properties, customerId]
  )
  const selectedProperty = customerProperties.find(p => p.id === propertyId) ?? null

  function reset() {
    setCustomerId('')
    setPropertyId('')
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    setOpen(next)
  }

  async function handleSubmit() {
    if (!customerId) {
      toast.error('Please pick a customer')
      return
    }
    setSubmitting(true)
    const result = await createOrderAction({
      customer_id: customerId,
      property_id: propertyId || null,
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Order created')
    handleOpenChange(false)
    router.push(`/jobs/${result.job_id}`)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        New Order
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Customer</Label>
            <Select value={customerId} onValueChange={v => { setCustomerId(v ?? ''); setPropertyId('') }}>
              <SelectTrigger className="w-full">
                {/* Explicit render function — see the module docstring:
                    resolving the label from the Select's internal item
                    registry alone is unreliable, and has previously shown
                    the raw id instead of the customer's name. */}
                <SelectValue placeholder="Select a customer…">
                  {() =>
                    selectedCustomer
                      ? `${selectedCustomer.first_name} ${selectedCustomer.last_name} · ${selectedCustomer.email}`
                      : 'Select a customer…'
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {customers.length === 0 ? (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    No customers yet. Add one from Properties → Add Property first.
                  </div>
                ) : (
                  customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name} · {c.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Property (optional)</Label>
            <Select
              value={propertyId}
              onValueChange={v => setPropertyId(v ?? '')}
              disabled={!customerId || customerProperties.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={customerId ? 'No property yet' : 'Pick a customer first'}>
                  {() => selectedProperty?.name ?? (customerId ? 'No property yet' : 'Pick a customer first')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {customerProperties.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSubmit} className="w-full" disabled={!customerId || submitting}>
            {submitting ? 'Creating…' : 'Create Order'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
