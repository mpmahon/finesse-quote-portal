'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, ChevronLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { createPropertyAction } from '@/app/properties/actions'
import { buildStyleQuerySuffix, type StyleQuerySource } from '@/lib/gallery-style-query'
import type { UserRole } from '@/types/database'

/** Minimal customer shape needed for the "Quote from style" customer picker. */
export interface CustomerOption {
  id: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
}

/** Minimal property shape needed to list a customer's existing properties. */
export interface PropertyOption {
  id: string
  name: string
  address: string | null
  user_id: string
}

interface QuoteFromStyleDialogProps {
  /** Non-null opens the dialog; the search-param values to carry through once a property is reached. */
  styleSelection: StyleQuerySource
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: CustomerOption[]
  properties: PropertyOption[]
}

type Step = 'customer' | 'property' | 'new-property'

/**
 * "Quote from style" staff flow: pick which customer this quote is for, then
 * either jump into one of their existing properties or create a new one —
 * carrying the gallery's chosen product/style through as a query-string
 * suffix so the window configurator can pre-select it (see
 * `src/lib/gallery-style-query.ts`).
 *
 * Deliberately does NOT reuse `PropertyList`'s dialog: that component only
 * supports creating a brand-new property, and is being edited concurrently
 * for the general "Add Property" flow. This picker owns its own customer +
 * property selection state end to end.
 */
export function QuoteFromStyleDialog({
  styleSelection,
  open,
  onOpenChange,
  customers,
  properties,
}: QuoteFromStyleDialogProps) {
  const [step, setStep] = useState<Step>('customer')
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [newProperty, setNewProperty] = useState({ name: '', address: '' })
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId) ?? null
  const customerProperties = useMemo(
    () => properties.filter(p => p.user_id === selectedCustomerId),
    [properties, selectedCustomerId]
  )

  function reset() {
    setStep('customer')
    setSelectedCustomerId('')
    setNewProperty({ name: '', address: '' })
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset()
    onOpenChange(next)
  }

  function goToPropertyStep() {
    if (!selectedCustomerId) {
      toast.error('Please pick a customer')
      return
    }
    setStep('property')
  }

  /** Navigate into the chosen property, carrying the gallery style selection along. */
  function goToProperty(propertyId: string) {
    const suffix = buildStyleQuerySuffix(styleSelection)
    handleOpenChange(false)
    router.push(`/properties/${propertyId}${suffix}`)
  }

  async function handleCreateProperty() {
    if (!newProperty.name.trim()) {
      toast.error('Property name is required')
      return
    }
    setSubmitting(true)
    const result = await createPropertyAction({
      name: newProperty.name.trim(),
      address: newProperty.address.trim() || null,
      user_id: selectedCustomerId,
    })
    setSubmitting(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Property created')
    goToProperty(result.property_id)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step === 'customer' && 'Quote from Style — Pick Customer'}
            {step === 'property' && 'Quote from Style — Pick Property'}
            {step === 'new-property' && 'Quote from Style — New Property'}
          </DialogTitle>
        </DialogHeader>

        {step === 'customer' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={selectedCustomerId} onValueChange={v => setSelectedCustomerId(v ?? '')}>
                <SelectTrigger className="w-full">
                  {/* Explicit render function — resolving the label from the
                      Select's internal item registry alone is unreliable
                      right after this step remounts (e.g. after "Back"),
                      which previously showed the raw customer id instead of
                      their name. Computing the label ourselves sidesteps
                      that entirely. */}
                  <SelectValue placeholder="Select an existing customer…">
                    {() =>
                      selectedCustomer
                        ? `${selectedCustomer.first_name} ${selectedCustomer.last_name} · ${selectedCustomer.email}`
                        : 'Select an existing customer…'
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
                        {c.role === 'wholesale_customer' ? ' · Wholesale' : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={goToPropertyStep} className="w-full" disabled={!selectedCustomerId}>
              Continue
            </Button>
          </div>
        )}

        {step === 'property' && (
          <div className="space-y-4">
            <div className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
              Quoting for{' '}
              <span className="font-medium text-foreground">
                {selectedCustomer ? `${selectedCustomer.first_name} ${selectedCustomer.last_name}` : 'customer'}
              </span>
            </div>

            {customerProperties.length > 0 && (
              <div className="space-y-2">
                <Label>Existing properties</Label>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {customerProperties.map(p => (
                    <Card
                      key={p.id}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => goToProperty(p.id)}
                    >
                      <CardContent className="flex items-center gap-3 py-3">
                        <Building2 className="h-4 w-4 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.name}</p>
                          {p.address && <p className="truncate text-xs text-muted-foreground">{p.address}</p>}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" onClick={() => setStep('new-property')} className="w-full">
              <Plus className="mr-2 h-4 w-4" />
              Create New Property
            </Button>

            <Button variant="ghost" onClick={() => setStep('customer')} className="w-full">
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </div>
        )}

        {step === 'new-property' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qfs-prop-name">Property Name</Label>
              <Input
                id="qfs-prop-name"
                value={newProperty.name}
                onChange={e => setNewProperty(p => ({ ...p, name: e.target.value }))}
                placeholder="My Home"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="qfs-prop-address">Address (optional)</Label>
              <Textarea
                id="qfs-prop-address"
                value={newProperty.address}
                onChange={e => setNewProperty(p => ({ ...p, address: e.target.value }))}
                placeholder="123 Main St"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('property')} className="flex-1" disabled={submitting}>
                Back
              </Button>
              <Button onClick={handleCreateProperty} className="flex-1" disabled={submitting}>
                {submitting ? 'Creating…' : 'Create & Continue'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
