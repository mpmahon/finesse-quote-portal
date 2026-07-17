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
 * existing primary, and any write that actually needs to demote one row
 * while promoting another goes through the `reassign_primary_source`
 * SECURITY DEFINER RPC (00022), which performs both flips as a single
 * atomic Postgres statement. That guarantees a target can never be
 * observed (or left, after a partial failure) with zero primary sources —
 * see `promotePrimary` below and the migration's own rationale comment.
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

  /**
   * Atomically demotes `oldId` (if any) and promotes `newId` to
   * `is_primary_source = true` via the `reassign_primary_source` SECURITY
   * DEFINER RPC (00022 — see the migration for the full rationale). Both
   * flips commit as one Postgres statement: there is no window in which a
   * dropped connection, a sleeping tab, or the RPC erroring out for any
   * other reason can leave the target with zero primary sources — either
   * both writes land, or the target keeps whichever primary it already
   * had. `oldId` is null when the target has no current primary yet (a
   * first allocation), in which case the RPC just promotes `newId`.
   */
  async function promotePrimary(newId: string, oldId: string | null) {
    const supabase = createClient()
    const { error } = await supabase.rpc('reassign_primary_source', { old_id: oldId, new_id: newId })
    if (error) throw error
    if (oldId) await logAudit('supplier_links_update', oldId, { is_primary_source: false, demoted_by: 'primary_reassignment' })
    await logAudit('supplier_links_update', newId, { is_primary_source: true })
  }

  async function handleSave() {
    const qty = parseFloat(form.quantity_per)
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Quantity per must be a positive number'); return }
    if (!isTargetComplete(form)) { toast.error('Select a complete allocation target'); return }

    setLoading(true)
    const supabase = createClient()
    const rowData = {
      supplier_product_id: supplierProduct.id,
      ...resolveTargetIds(form),
      quantity_per: qty,
      supplier_colour_code: form.supplier_colour_code.trim() || null,
      notes: form.notes.trim() || null,
    }
    // A demote+promote swap is only needed when this row is meant to become
    // primary AND a different row already holds primary for the (possibly
    // just-changed) target. Any other combination — becoming primary with
    // no existing holder, staying non-primary, or explicitly un-checking
    // primary on the row being edited — is a safe single-row write with no
    // atomicity risk, so it doesn't need the RPC round-trip.
    const needsSwap = form.is_primary_source && !!conflict

    try {
      let linkId: string

      if (editingLink) {
        // When a swap is needed, this write must NOT claim primary itself —
        // changing this row's target columns while is_primary_source stays
        // (or becomes) true could itself trip the unique index if the new
        // target already has a different primary. Force it false here and
        // let the atomic RPC below do the actual promotion.
        const { error } = await supabase.from('supplier_links')
          .update({ ...rowData, is_primary_source: needsSwap ? false : form.is_primary_source })
          .eq('id', editingLink.id)
        if (error) throw error
        linkId = editingLink.id
        await logAudit('supplier_links_update', linkId, { ...rowData, is_primary_source: form.is_primary_source })
        toast.success('Allocation updated')
      } else {
        // Always insert as non-primary first — the insert itself can then
        // never violate the one-primary-per-target unique index — and
        // promote afterwards via the atomic RPC if requested.
        const { data: inserted, error } = await supabase.from('supplier_links')
          .insert({ ...rowData, is_primary_source: needsSwap ? false : form.is_primary_source })
          .select()
          .single()
        if (error) throw error
        linkId = inserted.id
        await logAudit('supplier_links_create', linkId, { ...rowData, is_primary_source: needsSwap ? false : form.is_primary_source })
        toast.success('Allocation added')
      }

      if (needsSwap && conflict) {
        await promotePrimary(linkId, conflict.id)
      }

      setDialogOpen(false)
      router.refresh()
    } catch (err) {
      // 23505 = unique_violation — belt-and-suspenders for a race with
      // another admin setting primary on the same target between our
      // pre-check and this save (the atomic RPC above is what actually
      // prevents the zero-primary gap; this just keeps the error readable
      // if a genuine concurrent conflict still occurs).
      const message = (err as { code?: string; message?: string })?.code === '23505'
        ? 'Another allocation just became the primary source for this target. Refresh and try again.'
        : (err as Error).message
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  /** Quick "make primary" action from the list row — always a pure promotion (the button only shows for non-primary rows), so it goes straight to the atomic RPC with no pre-write needed. */
  async function makePrimary(link: SupplierLink) {
    const existing = findConflictingPrimary(allLinks, link, link.id)
    if (existing && !confirm(`Make this the primary source? This replaces ${describeLinkOwner(existing, allProducts, suppliers)} as primary for ${describeTarget(hierarchy, awningProducts, link)}.`)) {
      return
    }
    setLoading(true)
    try {
      await promotePrimary(link.id, existing?.id ?? null)
      toast.success('Primary source updated')
      router.refresh()
    } catch (err) {
      const message = (err as { code?: string; message?: string })?.code === '23505'
        ? 'Another allocation just became the primary source for this target. Refresh and try again.'
        : (err as Error).message
      toast.error(message)
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

      {sorted.length === 0 ? (
        <div className="rounded-md border py-6 text-center text-sm text-muted-foreground">
          Not allocated to any Finesse style, colour, or awning product yet.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Wrapping row layout (not a fixed-column table): the long target
              path wraps, and the meta cluster (qty · code · source · actions)
              flows beneath it on narrow widths instead of forcing horizontal
              scroll — the defect this replaced. */}
          {sorted.map(link => (
            <div
              key={link.id}
              className="flex flex-col gap-3 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm break-words">{describeTarget(hierarchy, awningProducts, link)}</p>
                {link.notes && <p className="mt-0.5 text-xs text-muted-foreground break-words">{link.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:shrink-0 sm:justify-end">
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">Qty </span>
                  {Number(link.quantity_per)} × {supplierProduct.unit_of_measure ?? 'unit'}
                </span>
                <span className="whitespace-nowrap">
                  <span className="text-muted-foreground">Code </span>
                  {link.supplier_colour_code ?? '—'}
                </span>
                {link.is_primary_source ? (
                  <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" /> Primary</Badge>
                ) : (
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => makePrimary(link)} disabled={loading}>
                    Make Primary
                  </Button>
                )}
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(link)} aria-label="Edit allocation">
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(link)} aria-label="Remove allocation">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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
