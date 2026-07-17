'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Star, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { SupplierTargetPicker, BLANK_TARGET, resolveTargetIds, isTargetComplete, type TargetPickerValue } from '@/components/admin/supplier-target-picker'
import { describeTarget, findConflictingPrimary, pathForStyle, pathForColour, type SupplierLinkTargetType } from '@/lib/supplier-links'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Supplier, SupplierLink, SupplierProduct } from '@/types/database'

interface SupplierLinkManagerProps {
  supplierProduct: SupplierProduct
  /** This product's own allocation rows. */
  productLinks: SupplierLink[]
  /** Every `supplier_links` row across every supplier — needed to detect a primary-source conflict on a target that's ALSO fulfilled by a different supplier/product. */
  allLinks: SupplierLink[]
  allProducts: SupplierProduct[]
  suppliers: Supplier[]
  awningProducts: AwningProduct[]
  hierarchy: BlindHierarchy
}

interface LinkFormState extends TargetPickerValue {
  quantity_per: string
  is_primary_source: boolean
  supplier_colour_code: string
  notes: string
}

const BLANK_FORM: LinkFormState = {
  ...BLANK_TARGET,
  quantity_per: '1',
  is_primary_source: true,
  supplier_colour_code: '',
  notes: '',
}

/** Resolves a conflicting link back to "Supplier — Product" for the pre-warn message, so the admin knows exactly what they're about to displace. */
function describeLinkOwner(link: SupplierLink, allProducts: SupplierProduct[], suppliers: Supplier[]): string {
  const product = allProducts.find(p => p.id === link.supplier_product_id)
  const supplier = product ? suppliers.find(s => s.id === product.supplier_id) : undefined
  return product && supplier ? `${supplier.name} — ${product.name}` : 'another supplier item'
}

/**
 * Allocation editor for a single supplier product (00021/00022): lists which
 * Finesse blind styles/colours/awning products this item fulfils, with
 * `quantity_per`, `is_primary_source`, `supplier_colour_code`, and notes,
 * and lets the admin add/edit/delete allocations. The DB enforces exactly
 * one `is_primary_source = true` row per target (00022 partial unique
 * indexes) — this component pre-warns when a save would displace an
 * existing primary and, on confirmation, demotes the old row before
 * promoting the new one in two sequential updates (both audit-logged)
 * rather than letting the raw unique-violation reach the user.
 */
export function SupplierLinkManager({ supplierProduct, productLinks, allLinks, allProducts, suppliers, awningProducts, hierarchy }: SupplierLinkManagerProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<SupplierLink | null>(null)
  const [form, setForm] = useState<LinkFormState>(BLANK_FORM)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const sorted = [...productLinks].sort((a, b) => Number(b.is_primary_source) - Number(a.is_primary_source))

  const candidateTargetIds = resolveTargetIds(form)
  const conflict = useMemo(
    () => (form.is_primary_source ? findConflictingPrimary(allLinks, candidateTargetIds, editingLink?.id) : null),
    [allLinks, candidateTargetIds, form.is_primary_source, editingLink?.id]
  )

  async function logAudit(actionType: string, targetId: string | null, changeSummary: Record<string, unknown>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action_type: actionType,
      target_table: 'supplier_links',
      target_id: targetId,
      change_summary: changeSummary,
    })
  }

  function openNew() {
    setEditingLink(null)
    setForm(BLANK_FORM)
    setDialogOpen(true)
  }

  function openEdit(link: SupplierLink) {
    setEditingLink(link)
    let targetType: SupplierLinkTargetType = 'awning'
    let path = { typeId: '', opacityId: '', styleId: '', colourId: '' }
    if (link.blind_style_id) {
      targetType = 'style'
      path = { ...pathForStyle(hierarchy, link.blind_style_id), colourId: '' }
    } else if (link.blind_colour_id) {
      targetType = 'colour'
      path = pathForColour(hierarchy, link.blind_colour_id)
    }
    setForm({
      targetType,
      typeId: path.typeId,
      opacityId: path.opacityId,
      styleId: path.styleId,
      colourId: path.colourId,
      awningProductId: link.awning_product_id ?? '',
      quantity_per: String(link.quantity_per),
      is_primary_source: link.is_primary_source,
      supplier_colour_code: link.supplier_colour_code ?? '',
      notes: link.notes ?? '',
    })
    setDialogOpen(true)
  }

  /** Demotes an existing primary link to non-primary (audit-logged) — the pre-save half of the "promote this one instead" flow. */
  async function demote(link: SupplierLink) {
    const supabase = createClient()
    const { error } = await supabase.from('supplier_links').update({ is_primary_source: false }).eq('id', link.id)
    if (error) throw error
    await logAudit('supplier_links_update', link.id, { is_primary_source: false, demoted_by: 'primary_reassignment' })
  }

  async function handleSave() {
    const qty = parseFloat(form.quantity_per)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Quantity per must be a positive number'); return }
    if (!isTargetComplete(form)) { toast.error('Select a complete allocation target'); return }

    setLoading(true)
    const supabase = createClient()
    const data = {
      supplier_product_id: supplierProduct.id,
      ...resolveTargetIds(form),
      quantity_per: qty,
      is_primary_source: form.is_primary_source,
      supplier_colour_code: form.supplier_colour_code.trim() || null,
      notes: form.notes.trim() || null,
    }

    try {
      // Pre-empt the DB's one-primary-per-target unique index (00022):
      // demote the conflicting row first so this save can never trip it.
      if (form.is_primary_source && conflict) {
        await demote(conflict)
      }

      if (editingLink) {
        const { error } = await supabase.from('supplier_links').update(data).eq('id', editingLink.id)
        if (error) throw error
        await logAudit('supplier_links_update', editingLink.id, data)
        toast.success('Allocation updated')
      } else {
        const { data: inserted, error } = await supabase.from('supplier_links').insert(data).select().single()
        if (error) throw error
        await logAudit('supplier_links_create', inserted?.id ?? null, data)
        toast.success('Allocation added')
      }
      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      // 23505 = unique_violation — a race with another admin setting primary
      // on the same target between our pre-check and this save.
      const message = (err as { code?: string; message?: string })?.code === '23505'
        ? 'Another allocation just became the primary source for this target. Refresh and try again.'
        : (err as Error).message
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  /** Quick "make primary" action from the list row — same demote-then-promote flow as the form, without opening the dialog. */
  async function makePrimary(link: SupplierLink) {
    const existing = findConflictingPrimary(allLinks, link, link.id)
    if (existing && !confirm(`Make this the primary source? This replaces ${describeLinkOwner(existing, allProducts, suppliers)} as primary for ${describeTarget(hierarchy, awningProducts, link)}.`)) {
      return
    }
    setLoading(true)
    try {
      if (existing) await demote(existing)
      const supabase = createClient()
      const { error } = await supabase.from('supplier_links').update({ is_primary_source: true }).eq('id', link.id)
      if (error) throw error
      await logAudit('supplier_links_update', link.id, { is_primary_source: true })
      toast.success('Primary source updated')
      router.refresh()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(link: SupplierLink) {
    if (!confirm(`Remove this allocation to ${describeTarget(hierarchy, awningProducts, link)}?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('supplier_links').delete().eq('id', link.id)
    if (error) { toast.error(error.message); return }
    await logAudit('supplier_links_delete', link.id, { target: describeTarget(hierarchy, awningProducts, link) })
    toast.success('Allocation removed')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Which Finesse styles, colours, or awning products <span className="font-medium text-foreground">{supplierProduct.name}</span> fulfils.
        </p>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Allocation
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Target</TableHead>
            <TableHead>Qty / Unit</TableHead>
            <TableHead>Colour Code</TableHead>
            <TableHead>Source</TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map(link => (
            <TableRow key={link.id}>
              <TableCell className="max-w-xs">
                <p className="text-sm">{describeTarget(hierarchy, awningProducts, link)}</p>
                {link.notes && <p className="mt-0.5 truncate text-xs text-muted-foreground">{link.notes}</p>}
              </TableCell>
              <TableCell className="text-sm">{Number(link.quantity_per)} × {supplierProduct.unit_of_measure ?? 'unit'}</TableCell>
              <TableCell className="text-sm">{link.supplier_colour_code ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell>
                {link.is_primary_source ? (
                  <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>
                ) : (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => makePrimary(link)} disabled={loading}>
                    Make Primary
                  </Button>
                )}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(link)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(link)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {sorted.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                Not allocated to any Finesse style, colour, or awning product yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLink ? 'Edit' : 'Add'} Allocation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <SupplierTargetPicker
              hierarchy={hierarchy}
              awningProducts={awningProducts}
              value={form}
              onChange={v => setForm(f => ({ ...f, ...v }))}
              disabled={loading}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantity Per Unit</Label>
                <Input
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={form.quantity_per}
                  onChange={e => setForm(f => ({ ...f, quantity_per: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  {supplierProduct.unit_of_measure ? `${supplierProduct.unit_of_measure} consumed per Finesse unit` : 'Units of this item consumed per Finesse unit'}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier Colour Code</Label>
                <Input
                  value={form.supplier_colour_code}
                  onChange={e => setForm(f => ({ ...f, supplier_colour_code: e.target.value }))}
                  placeholder="e.g. CL-204"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="link-primary">Primary Source</Label>
                <p className="text-xs text-muted-foreground">The preferred/current supplier for this target when there&apos;s more than one.</p>
              </div>
              <Switch id="link-primary" checked={form.is_primary_source} onCheckedChange={v => setForm(f => ({ ...f, is_primary_source: v }))} disabled={loading} />
            </div>

            {conflict && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  <span className="font-medium">{describeLinkOwner(conflict, allProducts, suppliers)}</span> is currently the primary
                  source for this target. Saving will make this allocation the new primary instead.
                </span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
