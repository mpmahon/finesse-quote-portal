'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Product, Component } from '@/types/database'

interface ProductManagerProps {
  products: (Product & { components: Component[] })[]
}

export function ProductManager({ products }: ProductManagerProps) {
  const [productDialog, setProductDialog] = useState(false)
  const [componentDialog, setComponentDialog] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [editComponent, setEditComponent] = useState<Component | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [targetProductId, setTargetProductId] = useState('')

  const filteredProducts = products.filter(p => {
    if (search === '') return true
    const q = search.toLowerCase()
    return p.make.toLowerCase().includes(q) ||
      p.model.toLowerCase().includes(q) ||
      p.shade_types.some(s => s.toLowerCase().includes(q)) ||
      p.colours.some(c => c.toLowerCase().includes(q))
  })
  const [form, setForm] = useState({ make: '', model: '', shade_types: '', styles: '', colours: '' })
  const [compForm, setCompForm] = useState({ name: '', unit: 'per_inch' as string, usd_price: '' })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function openNewProduct() {
    setEditProduct(null)
    setForm({ make: '', model: '', shade_types: '', styles: '', colours: '' })
    setProductDialog(true)
  }

  function openEditProduct(p: Product) {
    setEditProduct(p)
    setForm({
      make: p.make,
      model: p.model,
      shade_types: p.shade_types.join(', '),
      styles: p.styles.join(', '),
      colours: p.colours.join(', '),
    })
    setProductDialog(true)
  }

  function openNewComponent(productId: string) {
    setTargetProductId(productId)
    setEditComponent(null)
    setCompForm({ name: '', unit: 'per_inch', usd_price: '' })
    setComponentDialog(true)
  }

  function openEditComponent(comp: Component) {
    setTargetProductId(comp.product_id)
    setEditComponent(comp)
    setCompForm({ name: comp.name, unit: comp.unit, usd_price: String(comp.usd_price) })
    setComponentDialog(true)
  }

  async function saveProduct() {
    if (!form.make || !form.model) { toast.error('Make and model required'); return }
    setLoading(true)
    const supabase = createClient()
    const data = {
      make: form.make.trim(),
      model: form.model.trim(),
      shade_types: form.shade_types.split(',').map(s => s.trim()).filter(Boolean),
      styles: form.styles.split(',').map(s => s.trim()).filter(Boolean),
      colours: form.colours.split(',').map(s => s.trim()).filter(Boolean),
    }

    if (editProduct) {
      const { error } = await supabase.from('products').update(data).eq('id', editProduct.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Product updated')
    } else {
      const { error } = await supabase.from('products').insert(data)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Product created')
    }
    setProductDialog(false); setLoading(false); router.refresh()
  }

  async function saveComponent() {
    if (!compForm.name || !compForm.usd_price) { toast.error('All fields required'); return }
    setLoading(true)
    const supabase = createClient()
    const data = {
      product_id: targetProductId,
      name: compForm.name.trim(),
      unit: compForm.unit,
      usd_price: parseFloat(compForm.usd_price),
    }

    if (editComponent) {
      const { error } = await supabase.from('components').update(data).eq('id', editComponent.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Component updated')
    } else {
      const { error } = await supabase.from('components').insert(data)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Component created')
    }
    setComponentDialog(false); setLoading(false); router.refresh()
  }

  async function deleteProduct(id: string) {
    if (!confirm('Delete this product and all its components?')) return
    const supabase = createClient()
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Product deleted'); router.refresh()
  }

  async function deleteComponent(id: string) {
    if (!confirm('Delete this component?')) return
    const supabase = createClient()
    const { error } = await supabase.from('components').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Component deleted'); router.refresh()
  }

  return (
    <>
      {/* Product Dialog */}
      <Dialog open={productDialog} onOpenChange={setProductDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editProduct ? 'Edit Product' : 'Add Product'}</DialogTitle>
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
              <Label>Shade Types (comma-separated)</Label>
              <Input value={form.shade_types} onChange={e => setForm(f => ({ ...f, shade_types: e.target.value }))} placeholder="light filtering, blackout, sunscreen" />
            </div>
            <div className="space-y-2">
              <Label>Styles (comma-separated)</Label>
              <Input value={form.styles} onChange={e => setForm(f => ({ ...f, styles: e.target.value }))} placeholder="standard, premium" />
            </div>
            <div className="space-y-2">
              <Label>Colours (comma-separated)</Label>
              <Input value={form.colours} onChange={e => setForm(f => ({ ...f, colours: e.target.value }))} placeholder="white, cream, grey" />
            </div>
            <Button onClick={saveProduct} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Component Dialog */}
      <Dialog open={componentDialog} onOpenChange={setComponentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editComponent ? 'Edit Component' : 'Add Component'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Component Name</Label>
              <Input value={compForm.name} onChange={e => setCompForm(f => ({ ...f, name: e.target.value }))} placeholder="cassette" />
            </div>
            <div className="space-y-2">
              <Label>Unit Type</Label>
              <Select value={compForm.unit} onValueChange={v => setCompForm(f => ({ ...f, unit: v ?? 'per_inch' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_inch">Per Inch</SelectItem>
                  <SelectItem value="per_sq_inch">Per Sq Inch</SelectItem>
                  <SelectItem value="fixed">Fixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>USD Price</Label>
              <Input type="number" step="0.0001" value={compForm.usd_price} onChange={e => setCompForm(f => ({ ...f, usd_price: e.target.value }))} />
            </div>
            <Button onClick={saveComponent} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search & Add */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search products by make, model, shade type, or colour..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openNewProduct}>
          <Plus className="mr-2 h-4 w-4" />
          Add Product
        </Button>
      </div>

      {filteredProducts.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">No products match your search.</p>
      )}

      <div className="space-y-4">
        {filteredProducts.map(product => (
          <Card key={product.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}>
                    {expandedId === product.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  <div>
                    <CardTitle className="text-base">{product.make} {product.model}</CardTitle>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {product.colours.slice(0, 5).map(c => (
                        <Badge key={c} variant="outline" className="text-xs capitalize">{c}</Badge>
                      ))}
                      {product.colours.length > 5 && <Badge variant="outline" className="text-xs">+{product.colours.length - 5}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditProduct(product)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteProduct(product.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {expandedId === product.id && (
              <CardContent>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Components</p>
                  <Button variant="outline" size="sm" onClick={() => openNewComponent(product.id)}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add Component
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead className="text-right">USD Price</TableHead>
                      <TableHead className="w-20"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {product.components.map(comp => (
                      <TableRow key={comp.id}>
                        <TableCell className="capitalize">{comp.name.replace(/_/g, ' ')}</TableCell>
                        <TableCell>{comp.unit.replace(/_/g, ' ')}</TableCell>
                        <TableCell className="text-right">${Number(comp.usd_price).toFixed(4)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditComponent(comp)}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteComponent(comp.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}
