'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatDistanceToNow } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Check, X, Link2, Search } from 'lucide-react'
import { toast } from 'sonner'
import { SupplierLinkManager } from '@/components/admin/supplier-link-manager'
import { describeTarget } from '@/lib/supplier-links'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Supplier, SupplierLink, SupplierProduct } from '@/types/database'

interface SupplierProductManagerProps {
  supplier: Supplier
  /** This supplier's own catalogue lines. */
  products: SupplierProduct[]
  /** Every supplier's catalogue lines — needed by the allocation dialog to name a conflicting primary source that belongs to a different supplier. */
  allProducts: SupplierProduct[]
  /** Every `supplier_links` row across every supplier. */
  allLinks: SupplierLink[]
  suppliers: Supplier[]
  awningProducts: AwningProduct[]
  hierarchy: BlindHierarchy
}

/** Local editable-row form shape for the inline-editable columns — strings throughout so inputs stay controlled; parsed/validated on save. */
interface InlineEditState {
  item_code: string
  category: string
  cost_price: string
  currency: string
  unit_of_measure: string
  is_active: boolean
}

/** Full field set for the Add/Edit Details dialog — everything `supplier_products` has. */
interface ProductFormState extends InlineEditState {
  name: string
  specs: string
  source_url: string
  notes: string
}

const BLANK_FORM: ProductFormState = {
  name: '',
  item_code: '',
  category: '',
  specs: '',
  source_url: '',
  notes: '',
  cost_price: '',
  currency: 'USD',
  unit_of_measure: '',
  is_active: true,
}

const STALE_AFTER_DAYS = 180

/** True when a cost was captured more than {@link STALE_AFTER_DAYS} ago — a hint to re-check the price, not a hard block on anything. */
function isStale(priceUpdatedAt: string | null): boolean {
  if (!priceUpdatedAt) return false
  const ageMs = Date.now() - new Date(priceUpdatedAt).getTime()
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
}

/**
 * Catalogue editor for one supplier's `supplier_products` rows (00021/
 * 00022): a table with inline-editable cost/unit/code/category/active
 * fields (fast per-item price updates — the common admin action), a full
 * Add/Edit Details dialog for the remaining fields (name, specs, source
 * URL, notes), delete, and an Allocations dialog per row backed by
 * {@link SupplierLinkManager}. Every mutation is audit-logged the same way
 * as `BlindStyleEditor`.
 */
export function SupplierProductManager({ supplier, products, allProducts, allLinks, suppliers, awningProducts, hierarchy }: SupplierProductManagerProps) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [inlineForm, setInlineForm] = useState<InlineEditState | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<SupplierProduct | null>(null)
  const [form, setForm] = useState<ProductFormState>(BLANK_FORM)
  const [allocationsForId, setAllocationsForId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  // Derived (not stored) so the allocations dialog always reflects the
  // latest server data after a `router.refresh()` from inside
  // SupplierLinkManager — the same stale-selection-safety pattern used by
  // BlindHierarchyManager's selected-node derivation.
  const allocationsFor = products.find(p => p.id === allocationsForId) ?? null

  const filtered = products.filter(p => {
    if (search === '') return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.item_code ?? '').toLowerCase().includes(q) || (p.category ?? '').toLowerCase().includes(q)
  }).sort((a, b) => a.name.localeCompare(b.name))

  async function logAudit(actionType: string, targetId: string | null, changeSummary: Record<string, unknown>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action_type: actionType,
      target_table: 'supplier_products',
      target_id: targetId,
      change_summary: changeSummary,
    })
  }

  // ---- Inline edit (cost_price / currency / unit_of_measure / item_code / category / is_active) ----

  function startInlineEdit(p: SupplierProduct) {
    setInlineForm({
      item_code: p.item_code ?? '',
      category: p.category ?? '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      currency: p.currency,
      unit_of_measure: p.unit_of_measure ?? '',
      is_active: p.is_active,
    })
    setEditingId(p.id)
  }

  async function saveInlineEdit(p: SupplierProduct) {
    if (!inlineForm) return
    if (inlineForm.cost_price !== '' && (!Number.isFinite(parseFloat(inlineForm.cost_price)) || parseFloat(inlineForm.cost_price) < 0)) {
      toast.error('Cost must be a non-negative number')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const data = {
      item_code: inlineForm.item_code.trim() || null,
      category: inlineForm.category.trim() || null,
      cost_price: inlineForm.cost_price === '' ? null : parseFloat(inlineForm.cost_price),
      currency: inlineForm.currency.trim() || 'USD',
      unit_of_measure: inlineForm.unit_of_measure.trim() || null,
      is_active: inlineForm.is_active,
    }
    const { error } = await supabase.from('supplier_products').update(data).eq('id', p.id)
    if (error) { toast.error(error.message); setLoading(false); return }
    await logAudit('supplier_product_update', p.id, data)
    toast.success('Item updated')
    setEditingId(null)
    setInlineForm(null)
    setLoading(false)
    router.refresh()
  }

  // ---- Full Add/Edit Details dialog ----

  function openNew() {
    setEditProduct(null)
    setForm(BLANK_FORM)
    setDialogOpen(true)
  }

  function openEditDetails(p: SupplierProduct) {
    setEditProduct(p)
    setForm({
      name: p.name,
      item_code: p.item_code ?? '',
      category: p.category ?? '',
      specs: p.specs ?? '',
      source_url: p.source_url ?? '',
      notes: p.notes ?? '',
      cost_price: p.cost_price != null ? String(p.cost_price) : '',
      currency: p.currency,
      unit_of_measure: p.unit_of_measure ?? '',
      is_active: p.is_active,
    })
    setDialogOpen(true)
  }

  async function handleSaveDetails() {
    if (!form.name.trim()) { toast.error('Item name is required'); return }
    if (form.cost_price !== '' && (!Number.isFinite(parseFloat(form.cost_price)) || parseFloat(form.cost_price) < 0)) {
      toast.error('Cost must be a non-negative number')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const data = {
      supplier_id: supplier.id,
      name: form.name.trim(),
      item_code: form.item_code.trim() || null,
      category: form.category.trim() || null,
      specs: form.specs.trim() || null,
      source_url: form.source_url.trim() || null,
      notes: form.notes.trim() || null,
      cost_price: form.cost_price === '' ? null : parseFloat(form.cost_price),
      currency: form.currency.trim() || 'USD',
      unit_of_measure: form.unit_of_measure.trim() || null,
      is_active: form.is_active,
    }

    if (editProduct) {
      const { error } = await supabase.from('supplier_products').update(data).eq('id', editProduct.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      await logAudit('supplier_product_update', editProduct.id, data)
      toast.success('Item updated')
    } else {
      const { data: inserted, error } = await supabase.from('supplier_products').insert(data).select().single()
      // supplier_products_supplier_name_unique — duplicate item name for this supplier.
      if (error) { toast.error(error.code === '23505' ? `${supplier.name} already has an item named "${data.name}".` : error.message); setLoading(false); return }
      await logAudit('supplier_product_create', inserted?.id ?? null, data)
      toast.success('Item added')
    }

    setDialogOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(p: SupplierProduct) {
    const productLinks = allLinks.filter(l => l.supplier_product_id === p.id)
    // Name any target this item is the ONLY primary source for — deleting
    // it cascades to these supplier_links rows (00021 FK), so the admin
    // should know up front which styles/colours/awning products are about
    // to lose their primary supplier, not discover it later.
    const orphanedPrimaryTargets = productLinks
      .filter(l => l.is_primary_source)
      .map(l => describeTarget(hierarchy, awningProducts, l))
    const warning = productLinks.length > 0
      ? `Delete "${p.name}"? This also removes its ${productLinks.length} Finesse allocation(s).` +
        (orphanedPrimaryTargets.length > 0
          ? ` This is the ONLY primary source for: ${orphanedPrimaryTargets.join(', ')} — those will be left with no primary supplier.`
          : '') +
        ' This cannot be undone.'
      : `Delete "${p.name}"?`
    if (!confirm(warning)) return
    const supabase = createClient()
    const { error } = await supabase.from('supplier_products').delete().eq('id', p.id)
    if (error) { toast.error(error.message); return }
    await logAudit('supplier_product_delete', p.id, { name: p.name })
    toast.success('Item deleted')
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-lg font-semibold">Catalogue ({products.length})</h3>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="w-56 pl-9" />
          </div>
          <Button size="sm" onClick={openNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Item
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Item Code</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead>Unit</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>Active</TableHead>
            <TableHead>Allocations</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map(p => {
            const linkCount = allLinks.filter(l => l.supplier_product_id === p.id).length
            const editing = editingId === p.id && inlineForm

            if (editing) {
              return (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Input className="h-8 w-24" value={inlineForm.item_code} onChange={e => setInlineForm(f => f && ({ ...f, item_code: e.target.value }))} /></TableCell>
                  <TableCell><Input className="h-8 w-28" value={inlineForm.category} onChange={e => setInlineForm(f => f && ({ ...f, category: e.target.value }))} /></TableCell>
                  <TableCell>
                    <Input className="h-8 w-24 text-right" type="number" step="0.0001" placeholder="—" value={inlineForm.cost_price} onChange={e => setInlineForm(f => f && ({ ...f, cost_price: e.target.value }))} />
                  </TableCell>
                  <TableCell><Input className="h-8 w-16" value={inlineForm.currency} onChange={e => setInlineForm(f => f && ({ ...f, currency: e.target.value.toUpperCase() }))} /></TableCell>
                  <TableCell><Input className="h-8 w-32" placeholder="e.g. per linear yard" value={inlineForm.unit_of_measure} onChange={e => setInlineForm(f => f && ({ ...f, unit_of_measure: e.target.value }))} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.price_updated_at ? formatDistanceToNow(new Date(p.price_updated_at), { addSuffix: true }) : '—'}</TableCell>
                  <TableCell><Switch checked={inlineForm.is_active} onCheckedChange={v => setInlineForm(f => f && ({ ...f, is_active: v }))} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{linkCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveInlineEdit(p)} disabled={loading}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingId(null); setInlineForm(null) }} disabled={loading}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            }

            return (
              <TableRow key={p.id} className={!p.is_active ? 'opacity-60' : undefined}>
                <TableCell className="font-medium">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => openEditDetails(p)}
                    title="Edit full details (specs, source link, notes)"
                  >
                    {p.name}
                  </button>
                </TableCell>
                <TableCell className="text-sm">{p.item_code ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-sm">{p.category ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-right text-sm">
                  {p.cost_price != null ? `$${Number(p.cost_price).toFixed(4)}` : <span className="text-muted-foreground">Not set</span>}
                </TableCell>
                <TableCell className="text-sm">{p.currency}</TableCell>
                <TableCell className="text-sm">{p.unit_of_measure ?? <span className="text-muted-foreground">—</span>}</TableCell>
                <TableCell className="text-xs">
                  {p.price_updated_at ? (
                    <span className={isStale(p.price_updated_at) ? 'text-amber-600' : 'text-muted-foreground'}>
                      {formatDistanceToNow(new Date(p.price_updated_at), { addSuffix: true })}
                      {isStale(p.price_updated_at) && ' · stale'}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Never</span>
                  )}
                </TableCell>
                <TableCell>
                  {p.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>}
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={() => setAllocationsForId(p.id)}>
                    <Link2 className="h-3 w-3" /> {linkCount}
                  </Button>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startInlineEdit(p)} title="Quick edit cost/unit">
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
          {filtered.length === 0 && (
            <TableRow>
              <TableCell colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                {products.length === 0 ? `No catalogue items for ${supplier.name} yet.` : 'No items match your search.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">
        Costs are stored in USD. Click the pencil to quick-edit cost/unit/code/category/active inline, or use the item name to open full details (specs, source link, notes).
      </p>

      {/* Full details dialog (name, specs, source URL, notes, plus the same cost fields as the inline edit). */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editProduct ? 'Edit' : 'Add'} Catalogue Item — {supplier.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Item Code</Label>
                <Input value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Cost Price</Label>
                <Input type="number" step="0.0001" placeholder="—" value={form.cost_price} onChange={e => setForm(f => ({ ...f, cost_price: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value.toUpperCase() }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Unit of Measure</Label>
                <Input placeholder="e.g. per linear yard" value={form.unit_of_measure} onChange={e => setForm(f => ({ ...f, unit_of_measure: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Specs</Label>
              <Textarea value={form.specs} onChange={e => setForm(f => ({ ...f, specs: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Source URL</Label>
              <Input value={form.source_url} onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="product-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive items are kept for history but hidden from new allocations.</p>
              </div>
              <Switch id="product-active" checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleSaveDetails} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocations dialog for the selected item. */}
      <Dialog open={!!allocationsFor} onOpenChange={o => !o && setAllocationsForId(null)}>
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocations — {allocationsFor?.name}</DialogTitle>
          </DialogHeader>
          {allocationsFor && (
            <SupplierLinkManager
              supplierProduct={allocationsFor}
              productLinks={allLinks.filter(l => l.supplier_product_id === allocationsFor.id)}
              allLinks={allLinks}
              allProducts={allProducts}
              suppliers={suppliers}
              awningProducts={awningProducts}
              hierarchy={hierarchy}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
