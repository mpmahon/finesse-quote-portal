'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Building2, Trash2, Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Property } from '@/types/database'

interface PropertyListProps {
  properties: (Property & { rooms: { count: number }[] })[]
  userId: string
}

export function PropertyList({ properties, userId }: PropertyListProps) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  const isNew = searchParams.get('new') === 'true'

  function openNew() {
    setEditId(null)
    setName('')
    setAddress('')
    setOpen(true)
  }

  function openEdit(property: Property) {
    setEditId(property.id)
    setName(property.name)
    setAddress(property.address || '')
    setOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    const supabase = createClient()

    if (editId) {
      const { error } = await supabase
        .from('properties')
        .update({ name: name.trim(), address: address.trim() || null })
        .eq('id', editId)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Property updated')
    } else {
      const { error } = await supabase
        .from('properties')
        .insert({ name: name.trim(), address: address.trim() || null, user_id: userId })
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Property created')
    }
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this property and all its rooms/windows?')) return
    const supabase = createClient()
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Property deleted')
    router.refresh()
  }

  return (
    <>
      <Dialog open={open || isNew} onOpenChange={(v) => { setOpen(v); if (!v) router.replace('/dashboard') }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Property' : 'Add Property'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prop-name">Property Name</Label>
              <Input id="prop-name" value={name} onChange={e => setName(e.target.value)} placeholder="My Home" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-address">Address (optional)</Label>
              <Textarea id="prop-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : (editId ? 'Update' : 'Create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {properties.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No properties yet. Add your first property to get started.</p>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Property
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map(property => (
            <Card key={property.id} className="group relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link href={`/properties/${property.id}`} className="flex-1">
                    <CardTitle className="text-lg hover:underline">{property.name}</CardTitle>
                  </Link>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(property)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(property.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {property.address && <p className="mb-2 text-sm text-muted-foreground">{property.address}</p>}
                <p className="text-sm text-muted-foreground">
                  {property.rooms?.[0]?.count || 0} room{(property.rooms?.[0]?.count || 0) !== 1 ? 's' : ''}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
