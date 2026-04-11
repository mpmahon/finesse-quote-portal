'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Building2, Trash2, Pencil, Plus, Search, User, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import {
  createCustomerAction,
  createPropertyAction,
} from '@/app/properties/actions'
import type { Property, UserRole } from '@/types/database'

interface PropertyWithDetails extends Property {
  room_count?: number
  window_count?: number
  priceable_count?: number
  configured_count?: number
  no_blind_count?: number
  /** Rough pre-markup TTD estimate for the list card preview. */
  preview_total_ttd?: number
  profiles?: {
    id: string
    first_name: string
    last_name: string
    email: string
  } | null
}

/** Minimal customer shape for the Add-Property customer picker. */
interface CustomerOption {
  id: string
  first_name: string
  last_name: string
  email: string
  role: UserRole
}

interface PropertyListProps {
  properties: PropertyWithDetails[]
  userId: string
  /** True when the viewer is a salesman or administrator. Unlocks the customer picker + new-customer inline form. */
  isStaff: boolean
  /** True when each property card should show the owning customer (for admin + salesman views). */
  showCustomer?: boolean
  /** All retail + wholesale customers. Only populated when isStaff=true. */
  customers?: CustomerOption[]
}

type DialogMode = 'closed' | 'new-pick-customer' | 'new-create-customer' | 'new-property' | 'edit-property'

export function PropertyList({
  properties,
  userId,
  isStaff,
  showCustomer = false,
  customers = [],
}: PropertyListProps) {
  const [mode, setMode] = useState<DialogMode>('closed')
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [search, setSearch] = useState('')

  // Staff-mode state: which customer will own the new property?
  // For customer mode, this is always the viewer's own id.
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')

  // New customer sub-form (staff only)
  const [newCustomer, setNewCustomer] = useState({
    first_name: '',
    last_name: '',
    email: '',
    contact_number: '',
    role: 'retail_customer' as 'retail_customer' | 'wholesale_customer',
  })

  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()

  const filtered = properties.filter(p => {
    if (search === '') return true
    const q = search.toLowerCase()
    const customerName = p.profiles ? `${p.profiles.first_name} ${p.profiles.last_name}`.toLowerCase() : ''
    const customerEmail = p.profiles?.email.toLowerCase() || ''
    return p.name.toLowerCase().includes(q) ||
      (p.address || '').toLowerCase().includes(q) ||
      customerName.includes(q) ||
      customerEmail.includes(q)
  })

  // Treat ?new=true as a signal to open the Add flow. Staff lands in the
  // customer-picker step; customers land directly in the property form.
  const isNewQueryFlag = searchParams.get('new') === 'true'
  useEffect(() => {
    if (isNewQueryFlag && mode === 'closed') {
      if (isStaff) {
        setMode('new-pick-customer')
      } else {
        setSelectedCustomerId(userId)
        setMode('new-property')
      }
    }
    // Only re-run when the query flag flips; intentionally ignore `mode`
    // so closing the dialog doesn't immediately reopen it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewQueryFlag])

  const dialogOpen = mode !== 'closed'

  function resetAll() {
    setEditId(null)
    setName('')
    setAddress('')
    setSelectedCustomerId('')
    setNewCustomer({
      first_name: '',
      last_name: '',
      email: '',
      contact_number: '',
      role: 'retail_customer',
    })
  }

  function closeDialog() {
    setMode('closed')
    resetAll()
    router.replace('/properties')
  }

  function openEdit(property: Property) {
    setEditId(property.id)
    setName(property.name)
    setAddress(property.address || '')
    setMode('edit-property')
  }

  // Staff: after picking an existing customer, advance to the property form.
  function confirmCustomerPick() {
    if (!selectedCustomerId) {
      toast.error('Please pick a customer or create a new one')
      return
    }
    setMode('new-property')
  }

  // Staff: save a new customer, auto-select them, advance to the property form.
  async function handleCreateCustomer() {
    const { first_name, last_name, email, role } = newCustomer
    if (!first_name.trim() || !last_name.trim() || !email.trim()) {
      toast.error('First name, last name, and email are required')
      return
    }
    startTransition(async () => {
      const result = await createCustomerAction({
        first_name,
        last_name,
        email,
        contact_number: newCustomer.contact_number || null,
        role,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const c = result.customer
      toast.success(`Created ${c.first_name} ${c.last_name} — temp password: Finesse4Blinds!`)
      // router.refresh() will re-fetch the customers list in the server
      // component so the picker sees the new row next time it renders.
      setSelectedCustomerId(c.id)
      setMode('new-property')
      router.refresh()
    })
  }

  // Save: either create (via server action) or update (direct via RLS).
  async function handleSaveProperty() {
    if (!name.trim()) {
      toast.error('Property name is required')
      return
    }

    if (mode === 'edit-property' && editId) {
      const supabase = createClient()
      startTransition(async () => {
        const { error } = await supabase
          .from('properties')
          .update({ name: name.trim(), address: address.trim() || null })
          .eq('id', editId)
        if (error) {
          toast.error(error.message)
          return
        }
        toast.success('Property updated')
        closeDialog()
        router.refresh()
      })
      return
    }

    // Create path — always via server action so created_by is set correctly
    // and (for staff) the activity log picks up the event.
    const ownerId = isStaff ? selectedCustomerId : userId
    if (!ownerId) {
      toast.error('Pick a customer first')
      return
    }
    startTransition(async () => {
      const result = await createPropertyAction({
        name: name.trim(),
        address: address.trim() || null,
        user_id: ownerId,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Property created')
      closeDialog()
      router.refresh()
    })
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this property and all its rooms/windows?')) return
    const supabase = createClient()
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
      return
    }
    toast.success('Property deleted')
    router.refresh()
  }

  const dialogTitle =
    mode === 'edit-property'
      ? 'Edit Property'
      : mode === 'new-pick-customer'
      ? 'Add Property — Pick Customer'
      : mode === 'new-create-customer'
      ? 'Add Property — New Customer'
      : 'Add Property'

  return (
    <>
      <Dialog open={dialogOpen} onOpenChange={o => (!o ? closeDialog() : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          {/* ========== Staff: pick an existing customer or open the new form ========== */}
          {mode === 'new-pick-customer' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Customer</Label>
                <Select
                  value={selectedCustomerId}
                  onValueChange={v => setSelectedCustomerId(v ?? '')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an existing customer…" />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.length === 0 ? (
                      <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No customers yet. Create one below.
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
              <Button onClick={confirmCustomerPick} className="w-full" disabled={!selectedCustomerId}>
                Continue
              </Button>
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">or</span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setMode('new-create-customer')}
                className="w-full"
              >
                <UserPlus className="mr-2 h-4 w-4" />
                Create New Customer
              </Button>
            </div>
          )}

          {/* ========== Staff: inline new-customer form ========== */}
          {mode === 'new-create-customer' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="cust-first">First Name</Label>
                  <Input
                    id="cust-first"
                    value={newCustomer.first_name}
                    onChange={e => setNewCustomer(p => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cust-last">Last Name</Label>
                  <Input
                    id="cust-last"
                    value={newCustomer.last_name}
                    onChange={e => setNewCustomer(p => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-email">Email</Label>
                <Input
                  id="cust-email"
                  type="email"
                  value={newCustomer.email}
                  onChange={e => setNewCustomer(p => ({ ...p, email: e.target.value }))}
                  placeholder="customer@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cust-phone">Contact Number (optional)</Label>
                <Input
                  id="cust-phone"
                  type="tel"
                  value={newCustomer.contact_number}
                  onChange={e => setNewCustomer(p => ({ ...p, contact_number: e.target.value }))}
                  placeholder="+1 868 555 1234"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Type</Label>
                <Select
                  value={newCustomer.role}
                  onValueChange={v =>
                    setNewCustomer(p => ({
                      ...p,
                      role: (v as 'retail_customer' | 'wholesale_customer') ?? 'retail_customer',
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail_customer">Retail Customer</SelectItem>
                    <SelectItem value="wholesale_customer">Wholesale Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                The customer will be created with the temporary password{' '}
                <code className="rounded bg-muted px-1 py-0.5">Finesse4Blinds!</code>. They can
                sign in and change it at any time. No email confirmation required.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setMode('new-pick-customer')}
                  className="flex-1"
                  disabled={isPending}
                >
                  Back
                </Button>
                <Button
                  onClick={handleCreateCustomer}
                  className="flex-1"
                  disabled={isPending}
                >
                  {isPending ? 'Creating…' : 'Create & Continue'}
                </Button>
              </div>
            </div>
          )}

          {/* ========== Property form (for both new and edit) ========== */}
          {(mode === 'new-property' || mode === 'edit-property') && (
            <div className="space-y-4">
              {mode === 'new-property' && isStaff && selectedCustomerId && (
                <div className="rounded-md bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                  Creating property for{' '}
                  <span className="font-medium text-foreground">
                    {(() => {
                      const c = customers.find(cc => cc.id === selectedCustomerId)
                      return c ? `${c.first_name} ${c.last_name}` : 'customer'
                    })()}
                  </span>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="prop-name">Property Name</Label>
                <Input
                  id="prop-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="My Home"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prop-address">Address (optional)</Label>
                <Textarea
                  id="prop-address"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="123 Main St"
                />
              </div>
              <div className="flex gap-2">
                {mode === 'new-property' && isStaff && (
                  <Button
                    variant="outline"
                    onClick={() => setMode('new-pick-customer')}
                    className="flex-1"
                    disabled={isPending}
                  >
                    Back
                  </Button>
                )}
                <Button
                  onClick={handleSaveProperty}
                  className="flex-1"
                  disabled={isPending}
                >
                  {isPending ? 'Saving…' : mode === 'edit-property' ? 'Update' : 'Create'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No properties yet. Add your first property to get started.</p>
            <Button
              onClick={() => {
                if (isStaff) {
                  setMode('new-pick-customer')
                } else {
                  setSelectedCustomerId(userId)
                  setMode('new-property')
                }
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {properties.length > 3 && (
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={showCustomer ? 'Search by property, address, customer name, or email…' : 'Search properties by name or address…'}
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
          )}
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No properties match your search.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(property => (
                <Card key={property.id} className="group relative transition-shadow hover:shadow-md">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <Link href={`/properties/${property.id}`} className="flex-1">
                        <CardTitle className="text-lg hover:underline">{property.name}</CardTitle>
                      </Link>
                      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(property)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleDelete(property.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {showCustomer && property.profiles && (
                      <div className="flex items-center gap-1.5 rounded-md bg-primary/5 px-2 py-1.5 text-xs">
                        <User className="h-3 w-3 text-primary" />
                        <span className="font-medium">
                          {property.profiles.first_name} {property.profiles.last_name}
                        </span>
                        <span className="text-muted-foreground">· {property.profiles.email}</span>
                      </div>
                    )}
                    {property.address && <p className="text-sm text-muted-foreground">{property.address}</p>}
                    <p className="text-sm text-muted-foreground">
                      {property.room_count || 0} room{(property.room_count || 0) !== 1 ? 's' : ''}
                      {(property.window_count ?? 0) > 0 && (
                        <> · {property.window_count} window{property.window_count !== 1 ? 's' : ''}</>
                      )}
                      {(property.no_blind_count ?? 0) > 0 && (
                        <> · {property.no_blind_count} no blind</>
                      )}
                      {(property.priceable_count ?? 0) > 0 && (property.configured_count ?? 0) < (property.priceable_count ?? 0) && (
                        <span className="ml-1 text-amber-600">
                          ({(property.priceable_count ?? 0) - (property.configured_count ?? 0)} need configuration)
                        </span>
                      )}
                    </p>
                    {(property.preview_total_ttd ?? 0) > 0 && (
                      <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                        <span className="text-xs font-medium text-muted-foreground">Est. Property Total</span>
                        <span className="text-sm font-semibold text-primary">
                          TTD ${(property.preview_total_ttd || 0).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )
}
