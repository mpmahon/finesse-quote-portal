'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { ProductImageField } from '@/components/admin/product-image-field'
import { componentSchema } from '@/lib/validators'
import type { BlindStyle, BlindStyleComponent, UnitType } from '@/types/database'

interface BlindStyleEditorProps {
  style: BlindStyle
  /** This style's own pricing components, already scoped by the caller (see `componentsForStyle`). */
  components: BlindStyleComponent[]
}

const UNIT_LABELS: Record<UnitType, string> = {
  per_inch: 'Per Inch',
  per_sq_inch: 'Per Sq Inch',
  fixed: 'Fixed',
}

/** Local editable-row form shape — strings throughout so inputs stay controlled; parsed/validated on save. */
interface ComponentFormState {
  name: string
  unit: UnitType
  usd_price: string
}

const BLANK_FORM: ComponentFormState = { name: '', unit: 'per_inch', usd_price: '' }

/**
 * Blind Style pricing editor (Batch 11 Part 1 — pricing moved from
 * products/components to blind_styles, per the client directive that the
 * Blind Management hierarchy IS what Finesse sells). Mounted inside
 * `BlindHierarchyManager` when a Style is selected: a photo upload (same
 * bucket/component as the old Product Manager) plus a CRUD table of this
 * style's `blind_style_components` rows (name/unit/USD price) — the exact
 * blueprint `calculateLineItem` prices a blind from. Every style is seeded
 * with a placeholder blueprint by migration 00019; this is where Mike
 * adjusts it per style.
 */
export function BlindStyleEditor({ style, components }: BlindStyleEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<ComponentFormState>(BLANK_FORM)
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState<ComponentFormState>(BLANK_FORM)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const sorted = [...components].sort((a, b) => a.name.localeCompare(b.name))

  async function logAudit(actionType: string, targetId: string | null, changeSummary: Record<string, unknown>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action_type: actionType,
      target_table: 'blind_style_components',
      target_id: targetId,
      change_summary: changeSummary,
    })
  }

  /** Persists a new style photo URL (or removal) straight to `blind_styles.image_url` — there's no surrounding form submit for this level, so the upload commits immediately. */
  async function handleImageChange(url: string | null) {
    const supabase = createClient()
    const { error } = await supabase.from('blind_styles').update({ image_url: url }).eq('id', style.id)
    if (error) { toast.error(error.message); return }
    await logAudit('blind_styles_image_update', style.id, { image_url: url })
    router.refresh()
  }

  function startEdit(c: BlindStyleComponent) {
    setAddingNew(false)
    setEditingId(c.id)
    setEditForm({ name: c.name, unit: c.unit, usd_price: String(c.usd_price) })
  }

  async function saveEdit(id: string) {
    const parsed = componentSchema.safeParse(editForm)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Please check the component details')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const data = { name: parsed.data.name.trim(), unit: parsed.data.unit, usd_price: parsed.data.usd_price }
    const { error } = await supabase.from('blind_style_components').update(data).eq('id', id)
    if (error) { toast.error(error.message); setLoading(false); return }
    await logAudit('blind_style_components_update', id, data)
    toast.success('Component updated')
    setEditingId(null)
    setLoading(false)
    router.refresh()
  }

  async function saveNew() {
    const parsed = componentSchema.safeParse(newForm)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Please check the component details')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const data = { style_id: style.id, name: parsed.data.name.trim(), unit: parsed.data.unit, usd_price: parsed.data.usd_price }
    const { data: inserted, error } = await supabase.from('blind_style_components').insert(data).select().single()
    if (error) { toast.error(error.message); setLoading(false); return }
    await logAudit('blind_style_components_create', inserted?.id ?? null, data)
    toast.success('Component added')
    setAddingNew(false)
    setNewForm(BLANK_FORM)
    setLoading(false)
    router.refresh()
  }

  async function deleteComponent(c: BlindStyleComponent) {
    if (!confirm(`Delete the "${c.name}" component from ${style.name}?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('blind_style_components').delete().eq('id', c.id)
    if (error) { toast.error(error.message); return }
    await logAudit('blind_style_components_delete', c.id, { name: c.name })
    toast.success('Component deleted')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Photo — {style.name}</CardTitle>
        </CardHeader>
        <CardContent>
          <ProductImageField value={style.image_url} onChange={handleImageChange} folder="blind-styles" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Pricing Components — {style.name}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              This is the exact blueprint used to price every blind configured with this style. Placeholder values
              were seeded automatically — adjust them to this style&apos;s real supplier costs.
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditingId(null); setAddingNew(true); setNewForm(BLANK_FORM) }} disabled={addingNew}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Component
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead className="text-right">USD Price</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map(c => {
                if (editingId === c.id) {
                  return (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Input className="h-8" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <Select value={editForm.unit} onValueChange={v => setEditForm(f => ({ ...f, unit: (v ?? 'per_inch') as UnitType }))}>
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue>{(v: string) => UNIT_LABELS[v as UnitType] ?? v}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(UNIT_LABELS) as UnitType[]).map(u => (
                              <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input className="h-8 text-right" type="number" step="0.0001" value={editForm.usd_price} onChange={e => setEditForm(f => ({ ...f, usd_price: e.target.value }))} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(c.id)} disabled={loading}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)} disabled={loading}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                }
                return (
                  <TableRow key={c.id}>
                    <TableCell className="capitalize">{c.name.replace(/_/g, ' ')}</TableCell>
                    <TableCell>{UNIT_LABELS[c.unit]}</TableCell>
                    <TableCell className="text-right">${Number(c.usd_price).toFixed(4)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteComponent(c)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}

              {addingNew && (
                <TableRow>
                  <TableCell>
                    <Input className="h-8" placeholder="e.g. cassette" value={newForm.name} onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))} />
                  </TableCell>
                  <TableCell>
                    <Select value={newForm.unit} onValueChange={v => setNewForm(f => ({ ...f, unit: (v ?? 'per_inch') as UnitType }))}>
                      <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.keys(UNIT_LABELS) as UnitType[]).map(u => (
                          <SelectItem key={u} value={u}>{UNIT_LABELS[u]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input className="h-8 text-right" type="number" step="0.0001" placeholder="0.0000" value={newForm.usd_price} onChange={e => setNewForm(f => ({ ...f, usd_price: e.target.value }))} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveNew} disabled={loading}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAddingNew(false)} disabled={loading}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {sorted.length === 0 && !addingNew && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">
                    No pricing components yet for {style.name} — quotes using this style will price at $0 until you add some.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
