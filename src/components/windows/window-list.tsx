'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { SquareStack, Plus, Trash2, Pencil, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { MOUNT_TYPE_LABELS } from '@/lib/constants'
import type { Window, Product } from '@/types/database'

interface WindowListProps {
  windows: (Window & {
    products: { make: string; model: string } | null
    preview_usd?: number | null
  })[]
  roomId: string
  propertyId: string
  products: Product[]
}

export function WindowList({ windows, roomId, propertyId, products }: WindowListProps) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', width_inches: '', height_inches: '', depth_inches: '',
    mount_type: 'inside' as 'inside' | 'outside', has_blind: true, has_awning: false,
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function openNew() {
    setEditId(null)
    setForm({ name: '', width_inches: '', height_inches: '', depth_inches: '', mount_type: 'inside', has_blind: true, has_awning: false })
    setOpen(true)
  }

  function openEdit(w: Window) {
    setEditId(w.id)
    setForm({
      name: w.name,
      width_inches: String(w.width_inches),
      height_inches: String(w.height_inches),
      depth_inches: w.depth_inches ? String(w.depth_inches) : '',
      mount_type: w.mount_type,
      has_blind: w.has_blind,
      has_awning: w.has_awning,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    const w = parseFloat(form.width_inches)
    const h = parseFloat(form.height_inches)
    if (isNaN(w) || w <= 0 || isNaN(h) || h <= 0) { toast.error('Valid dimensions are required'); return }
    if (form.mount_type === 'inside' && (!form.depth_inches || parseFloat(form.depth_inches) <= 0)) {
      toast.error('Window depth is required for inside mount'); return
    }

    setLoading(true)
    const supabase = createClient()
    const data = {
      name: form.name.trim(),
      width_inches: w,
      height_inches: h,
      depth_inches: form.depth_inches ? parseFloat(form.depth_inches) : null,
      mount_type: form.mount_type,
      has_blind: form.has_blind,
      has_awning: form.has_awning,
    }

    if (editId) {
      const { error } = await supabase.from('windows').update(data).eq('id', editId)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Window updated')
    } else {
      const { error } = await supabase.from('windows').insert({ ...data, room_id: roomId })
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Window created')
    }
    setOpen(false); setLoading(false); router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this window?')) return
    const supabase = createClient()
    const { error } = await supabase.from('windows').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Window deleted'); router.refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Window' : 'Add Window'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Window Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Front Window" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Width (inches)</Label>
                <Input type="number" step="0.25" value={form.width_inches} onChange={e => setForm(f => ({ ...f, width_inches: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Height (inches)</Label>
                <Input type="number" step="0.25" value={form.height_inches} onChange={e => setForm(f => ({ ...f, height_inches: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mount Type</Label>
              <Select value={form.mount_type} onValueChange={v => setForm(f => ({ ...f, mount_type: (v ?? 'inside') as 'inside' | 'outside' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inside">Inside Mount</SelectItem>
                  <SelectItem value="outside">Outside Mount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.mount_type === 'inside' && (
              <div className="space-y-2">
                <Label>Window Depth (inches)</Label>
                <Input type="number" step="0.25" value={form.depth_inches} onChange={e => setForm(f => ({ ...f, depth_inches: e.target.value }))} placeholder="Distance from wall face to window face" />
              </div>
            )}
            <div className="rounded-md border p-3">
              <p className="mb-3 text-xs text-muted-foreground">
                Toggle off Blind and Awning to record a window with no cost — useful for tracking future sales opportunities.
              </p>
              <div className="flex items-center justify-between py-1">
                <Label>Blind</Label>
                <Switch checked={form.has_blind} onCheckedChange={v => setForm(f => ({ ...f, has_blind: v }))} />
              </div>
              <div className="flex items-center justify-between py-1">
                <Label>Awning</Label>
                <Switch checked={form.has_awning} onCheckedChange={v => setForm(f => ({ ...f, has_awning: v }))} />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : (editId ? 'Update' : 'Create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Windows</h2>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Window
        </Button>
      </div>

      {windows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <SquareStack className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No windows yet. Add a window to start configuring blinds.</p>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Window
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {windows.map(w => (
            <Card key={w.id} className="group relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{w.name}</CardTitle>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(w)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(w.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-2 text-sm">
                  <Badge variant="outline">{w.width_inches}&quot; x {w.height_inches}&quot;</Badge>
                  <Badge variant="outline">{MOUNT_TYPE_LABELS[w.mount_type]}</Badge>
                  {w.has_blind && <Badge>Blind</Badge>}
                  {w.has_awning && <Badge variant="secondary">Awning</Badge>}
                  {!w.has_blind && !w.has_awning && (
                    <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">No blind/awning</Badge>
                  )}
                </div>
                {!w.has_blind && !w.has_awning ? (
                  <p className="text-sm text-muted-foreground">
                    Tracked for future reference. Zero cost on quote.
                  </p>
                ) : w.products ? (
                  <p className="text-sm text-muted-foreground">
                    {w.products.make} {w.products.model}
                    {w.shade_type && ` - ${w.shade_type}`}
                    {w.colour && ` (${w.colour})`}
                  </p>
                ) : (
                  <p className="text-sm text-amber-600">Not configured</p>
                )}
                {typeof w.preview_usd === 'number' && w.has_blind && (
                  <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Components (USD)</span>
                    <span className="text-sm font-semibold text-primary">
                      ${w.preview_usd.toFixed(2)}
                    </span>
                  </div>
                )}
                {(w.has_blind || w.has_awning) && (
                  <Link href={`/properties/${propertyId}/rooms/${roomId}/windows/${w.id}`}>
                    <Button variant="outline" size="sm" className="mt-2">
                      <Settings2 className="mr-2 h-3 w-3" />
                      {w.products ? 'Reconfigure' : 'Configure Blind'}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
