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
import { Badge } from '@/components/ui/badge'
import { MultiSelect } from '@/components/ui/multi-select'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { AwningProduct } from '@/types/database'

interface AwningProductManagerProps {
  products: AwningProduct[]
  colourOptions: string[]
}

export function AwningProductManager({ products, colourOptions }: AwningProductManagerProps) {
  const [open, setOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<AwningProduct | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState({
    make: '',
    model: '',
    depth_inches: '',
    frame_unit_price_usd: '',
    material_unit_price_usd: '',
    fixed_cost_usd: '',
    colours: [] as string[],
    is_active: true,
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const filtered = products.filter(p => {
    if (search === '') return true
    const q = search.toLowerCase()
    return p.make.toLowerCase().includes(q) ||
      p.model.toLowerCase().includes(q) ||
      p.colours.some(c => c.toLowerCase().includes(q))
  })

  function openNew() {
    setEditProduct(null)
    setForm({
      make: '', model: '', depth_inches: '',
      frame_unit_price_usd: '', material_unit_price_usd: '', fixed_cost_usd: '',
      colours: [], is_active: true,
    })
    setOpen(true)
  }

  function openEdit(p: AwningProduct) {
    setEditProduct(p)
    setForm({
      make: p.make,
      model: p.model,
      depth_inches: String(p.depth_inches),
      frame_unit_price_usd: String(p.frame_unit_price_usd),
      material_unit_price_usd: String(p.material_unit_price_usd),
      fixed_cost_usd: String(p.fixed_cost_usd),
      colours: p.colours,
      is_active: p.is_active,
    })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.make || !form.model) { toast.error('Make and model required'); return }
    if (!form.depth_inches || parseFloat(form.depth_inches) <= 0) {
      toast.error('Depth must be greater than 0'); return
    }
    if (form.colours.length === 0) {
      toast.error('Select at least one colour'); return
    }

    setLoading(true)
    const supabase = createClient()
    const data = {
      make: form.make.trim(),
      model: form.model.trim(),
      depth_inches: parseFloat(form.depth_inches),
      frame_unit_price_usd: parseFloat(form.frame_unit_price_usd) || 0,
      material_unit_price_usd: parseFloat(form.material_unit_price_usd) || 0,
      fixed_cost_usd: parseFloat(form.fixed_cost_usd) || 0,
      colours: form.colours,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    }

    if (editProduct) {
      const { error } = await supabase.from('awning_products').update(data).eq('id', editProduct.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Awning product updated')
    } else {
      const { error } = await supabase.from('awning_products').insert(data)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Awning product created')
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        admin_user_id: user.id,
        action_type: editProduct ? 'awning_product_update' : 'awning_product_create',
        target_table: 'awning_products',
        target_id: editProduct?.id || null,
        change_summary: data,
      })
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this awning product?')) return
    const supabase = createClient()
    const { error } = await supabase.from('awning_products').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    router.refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? 'Edit' : 'Add'} Awning Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Make</Label>
                <Input value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Model</Label>
                <Input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Depth / Projection (inches)</Label>
              <Input
                type="number"
                step="0.5"
                value={form.depth_inches}
                onChange={e => setForm(f => ({ ...f, depth_inches: e.target.value }))}
                placeholder="e.g. 48"
              />
              <p className="text-xs text-muted-foreground">How far the awning extends from the wall. Fixed per model.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frame USD / inch</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.frame_unit_price_usd}
                  onChange={e => setForm(f => ({ ...f, frame_unit_price_usd: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">× awning width</p>
              </div>
              <div className="space-y-2">
                <Label>Material USD / sq in</Label>
                <Input
                  type="number"
                  step="0.0001"
                  value={form.material_unit_price_usd}
                  onChange={e => setForm(f => ({ ...f, material_unit_price_usd: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">× width × depth</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Fixed Cost (USD)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.fixed_cost_usd}
                onChange={e => setForm(f => ({ ...f, fixed_cost_usd: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Brackets, arms, motor. Flat per unit.</p>
            </div>
            <div className="space-y-2">
              <Label>Colours</Label>
              <MultiSelect
                options={colourOptions}
                selected={form.colours}
                onChange={v => setForm(f => ({ ...f, colours: v }))}
                placeholder="Select colours..."
                emptyText="No colours in catalog"
              />
              {colourOptions.length === 0 && (
                <p className="text-xs text-amber-600">
                  No colours available. Add some in{' '}
                  <Link href="/admin/catalog" className="underline">Admin &gt; Catalog</Link>.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="awning-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive products are hidden from window configurator.</p>
              </div>
              <input
                id="awning-active"
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4"
              />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by make, model, or colour..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Add Awning Product
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {products.length === 0 ? 'No awning products yet. Add your first product.' : 'No products match your search.'}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(product => (
            <Card key={product.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{product.make} {product.model}</CardTitle>
                    {!product.is_active && <Badge variant="outline" className="mt-1 text-[10px]">inactive</Badge>}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(product)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(product.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Depth</span>
                  <span className="font-medium">{product.depth_inches}&quot;</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frame</span>
                  <span>${Number(product.frame_unit_price_usd).toFixed(4)}/in</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Material</span>
                  <span>${Number(product.material_unit_price_usd).toFixed(4)}/sq in</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Fixed</span>
                  <span>${Number(product.fixed_cost_usd).toFixed(2)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {product.colours.slice(0, 5).map(c => (
                    <Badge key={c} variant="outline" className="text-xs capitalize">{c}</Badge>
                  ))}
                  {product.colours.length > 5 && (
                    <Badge variant="outline" className="text-xs">+{product.colours.length - 5}</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
