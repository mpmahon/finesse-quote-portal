'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2, Search, ChevronLeft, Globe, Phone, Package } from 'lucide-react'
import { toast } from 'sonner'
import { SupplierProductManager } from '@/components/admin/supplier-product-manager'
import { SupplierAllocationLookup } from '@/components/admin/supplier-allocation-lookup'
import { describeTarget } from '@/lib/supplier-links'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Supplier, SupplierLink, SupplierProduct } from '@/types/database'

interface SupplierManagerProps {
  suppliers: Supplier[]
  supplierProducts: SupplierProduct[]
  supplierLinks: SupplierLink[]
  awningProducts: AwningProduct[]
  hierarchy: BlindHierarchy
}

interface SupplierFormState {
  name: string
  website: string
  contact: string
  notes: string
}

const BLANK_SUPPLIER_FORM: SupplierFormState = { name: '', website: '', contact: '', notes: '' }

/**
 * Supplier Administration root (00021/00022 supplier catalogue + costing
 * layer): a supplier list with CRUD, drilling into a selected supplier's
 * catalogue via {@link SupplierProductManager}, plus a "Sourcing Lookup"
 * tab (the reverse style/colour/awning → supplier view via
 * {@link SupplierAllocationLookup}). Every mutation is audit-logged the
 * same way as `BlindStyleEditor` — actor_id + change_summary on
 * `audit_logs`. STAFF-ONLY data throughout (RLS); rendered on an
 * administrator-only route (see admin/layout.tsx).
 */
export function SupplierManager({ suppliers, supplierProducts, supplierLinks, awningProducts, hierarchy }: SupplierManagerProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [form, setForm] = useState<SupplierFormState>(BLANK_SUPPLIER_FORM)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const productCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of supplierProducts) counts[p.supplier_id] = (counts[p.supplier_id] ?? 0) + 1
    return counts
  }, [supplierProducts])

  const filtered = suppliers.filter(s => {
    if (search === '') return true
    const q = search.toLowerCase()
    return s.name.toLowerCase().includes(q) || (s.contact ?? '').toLowerCase().includes(q)
  })

  // Derived (not stored) so the drill-down view always reflects the latest
  // server data after a `router.refresh()` — same stale-selection-safety
  // pattern used by BlindHierarchyManager.
  const selectedSupplier = suppliers.find(s => s.id === selectedSupplierId) ?? null

  async function logAudit(actionType: string, targetId: string | null, changeSummary: Record<string, unknown>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action_type: actionType,
      target_table: 'suppliers',
      target_id: targetId,
      change_summary: changeSummary,
    })
  }

  function openNew() {
    setEditSupplier(null)
    setForm(BLANK_SUPPLIER_FORM)
    setDialogOpen(true)
  }

  function openEdit(s: Supplier) {
    setEditSupplier(s)
    setForm({ name: s.name, website: s.website ?? '', contact: s.contact ?? '', notes: s.notes ?? '' })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) { toast.error('Supplier name is required'); return }
    setLoading(true)
    const supabase = createClient()
    const data = {
      name: form.name.trim(),
      website: form.website.trim() || null,
      contact: form.contact.trim() || null,
      notes: form.notes.trim() || null,
    }

    if (editSupplier) {
      const { error } = await supabase.from('suppliers').update(data).eq('id', editSupplier.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      await logAudit('supplier_update', editSupplier.id, data)
      toast.success('Supplier updated')
    } else {
      const { data: inserted, error } = await supabase.from('suppliers').insert(data).select().single()
      // suppliers_name_unique — a duplicate name is the most likely failure here.
      if (error) { toast.error(error.code === '23505' ? `A supplier named "${data.name}" already exists.` : error.message); setLoading(false); return }
      await logAudit('supplier_create', inserted?.id ?? null, data)
      toast.success('Supplier created')
    }

    setDialogOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(s: Supplier) {
    const count = productCounts[s.id] ?? 0
    // Deleting a supplier cascades to its supplier_products, which cascades
    // to their supplier_links (00021 FKs) — including any is_primary_source
    // rows. Name those targets explicitly so the admin knows exactly which
    // styles/colours/awning products are about to lose their only primary
    // source, rather than finding out later when the cost reference goes blank.
    const supplierProductIds = new Set(supplierProducts.filter(p => p.supplier_id === s.id).map(p => p.id))
    const orphanedPrimaryTargets = supplierLinks
      .filter(l => l.is_primary_source && supplierProductIds.has(l.supplier_product_id))
      .map(l => describeTarget(hierarchy, awningProducts, l))
    const warning = count > 0
      ? `Delete "${s.name}"? This also deletes all ${count} of its catalogue item(s) and any Finesse item allocations linked to them.` +
        (orphanedPrimaryTargets.length > 0
          ? ` This is the ONLY primary source for: ${orphanedPrimaryTargets.join(', ')} — those will be left with no primary supplier.`
          : '') +
        ' This cannot be undone.'
      : `Delete "${s.name}"?`
    if (!confirm(warning)) return
    const supabase = createClient()
    const { error } = await supabase.from('suppliers').delete().eq('id', s.id)
    if (error) { toast.error(error.message); return }
    await logAudit('supplier_delete', s.id, { name: s.name })
    toast.success('Supplier deleted')
    if (selectedSupplierId === s.id) setSelectedSupplierId(null)
    router.refresh()
  }

  function renderSupplierDialog() {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editSupplier ? 'Edit' : 'Add'} Supplier</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Website</Label>
              <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <Input value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} placeholder="Name, phone, or email" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  // Drill-down: a supplier is selected — show its catalogue instead of the list/tabs.
  if (selectedSupplier) {
    return (
      <>
        <div className="space-y-4">
          <button
            onClick={() => setSelectedSupplierId(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All Suppliers
          </button>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">{selectedSupplier.name}</h2>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {selectedSupplier.website && (
                  <a href={selectedSupplier.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                    <Globe className="h-3.5 w-3.5" /> {selectedSupplier.website}
                  </a>
                )}
                {selectedSupplier.contact && (
                  <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {selectedSupplier.contact}</span>
                )}
              </div>
              {selectedSupplier.notes && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{selectedSupplier.notes}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => openEdit(selectedSupplier)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit Supplier
            </Button>
          </div>

          <SupplierProductManager
            supplier={selectedSupplier}
            products={supplierProducts.filter(p => p.supplier_id === selectedSupplier.id)}
            allProducts={supplierProducts}
            allLinks={supplierLinks}
            suppliers={suppliers}
            awningProducts={awningProducts}
            hierarchy={hierarchy}
          />
        </div>
        {renderSupplierDialog()}
      </>
    )
  }

  return (
    <>
      <Tabs defaultValue="suppliers">
        <TabsList>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="lookup">Sourcing Lookup</TabsTrigger>
        </TabsList>

        <TabsContent value="suppliers" className="mt-4">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Supplier
            </Button>
          </div>

          {filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                {suppliers.length === 0 ? 'No suppliers yet. Add your first supplier.' : 'No suppliers match your search.'}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(s => (
                <Card key={s.id} className="cursor-pointer transition-colors hover:border-primary/50" onClick={() => setSelectedSupplierId(s.id)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{s.name}</CardTitle>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(s) }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); handleDelete(s) }}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {s.contact && <p className="text-muted-foreground">{s.contact}</p>}
                    <Badge variant="outline" className="gap-1">
                      <Package className="h-3 w-3" /> {productCounts[s.id] ?? 0} item{(productCounts[s.id] ?? 0) === 1 ? '' : 's'}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="lookup" className="mt-4">
          <SupplierAllocationLookup
            hierarchy={hierarchy}
            awningProducts={awningProducts}
            supplierLinks={supplierLinks}
            supplierProducts={supplierProducts}
            suppliers={suppliers}
          />
        </TabsContent>
      </Tabs>
      {renderSupplierDialog()}
    </>
  )
}
