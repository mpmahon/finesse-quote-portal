'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import { BLIND_TYPES, BLIND_TYPE_LABELS } from '@/lib/constants'
import type { HardwareSizeRule } from '@/types/database'

interface HardwareSizeRulesManagerProps {
  rules: HardwareSizeRule[]
}

/** Local editable-row form shape — strings throughout so inputs stay controlled; parsed/validated on save. */
interface RuleFormState {
  min_width_in: string
  max_width_in: string
  tube_size: string
  control_type: string
  is_motorized: boolean
  tube_usd_per_inch_override: string
  control_fixed_usd: string
}

const BLANK_FORM: RuleFormState = {
  min_width_in: '',
  max_width_in: '',
  tube_size: '',
  control_type: '',
  is_motorized: false,
  tube_usd_per_inch_override: '',
  control_fixed_usd: '',
}

/** Convert a stored rule row into editable form state. */
function toFormState(r: HardwareSizeRule): RuleFormState {
  return {
    min_width_in: String(r.min_width_in),
    max_width_in: String(r.max_width_in),
    tube_size: r.tube_size,
    control_type: r.control_type,
    is_motorized: r.is_motorized,
    tube_usd_per_inch_override: r.tube_usd_per_inch_override != null ? String(r.tube_usd_per_inch_override) : '',
    control_fixed_usd: r.control_fixed_usd != null ? String(r.control_fixed_usd) : '',
  }
}

/** Validate + coerce a rule form into the DB row shape, or return an error message. */
function validateForm(f: RuleFormState): { data: Record<string, unknown> } | { error: string } {
  const min = parseFloat(f.min_width_in)
  const max = parseFloat(f.max_width_in)
  if (Number.isNaN(min) || min < 0) return { error: 'Min width must be 0 or greater' }
  if (Number.isNaN(max) || max <= min) return { error: 'Max width must be greater than min width' }
  if (!f.tube_size.trim()) return { error: 'Tube size is required' }
  if (!f.control_type.trim()) return { error: 'Control type is required' }

  const tubeOverride = f.tube_usd_per_inch_override.trim() === '' ? null : parseFloat(f.tube_usd_per_inch_override)
  if (tubeOverride !== null && (Number.isNaN(tubeOverride) || tubeOverride < 0)) {
    return { error: 'Tube $/in override must be a non-negative number (or blank for no override)' }
  }
  const controlFixed = f.control_fixed_usd.trim() === '' ? null : parseFloat(f.control_fixed_usd)
  if (controlFixed !== null && (Number.isNaN(controlFixed) || controlFixed < 0)) {
    return { error: 'Control fixed $ must be a non-negative number (or blank for no override)' }
  }

  return {
    data: {
      min_width_in: min,
      max_width_in: max,
      tube_size: f.tube_size.trim(),
      control_type: f.control_type.trim(),
      is_motorized: f.is_motorized,
      tube_usd_per_inch_override: tubeOverride,
      control_fixed_usd: controlFixed,
    },
  }
}

/**
 * Admin editor for width-based hardware support rules (Batch 7 pre-work).
 *
 * One table per blind_type, rows sorted by min_width_in. Inline edit (click
 * the pencil to turn a row into inputs), inline add (a blank row at the
 * bottom of each type's table), and delete — all admin-only (the page this
 * mounts on is already admin-gated) and audit-logged like the other
 * catalog/product managers. Overrides are optional: leaving both blank
 * keeps the rule cost-neutral (see quote-engine.ts `calculateLineItem`).
 */
export function HardwareSizeRulesManager({ rules }: HardwareSizeRulesManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<RuleFormState>(BLANK_FORM)
  const [newRowFor, setNewRowFor] = useState<string | null>(null)
  const [newForm, setNewForm] = useState<RuleFormState>(BLANK_FORM)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const byType: Record<string, HardwareSizeRule[]> = {}
  for (const r of rules) {
    if (!byType[r.blind_type]) byType[r.blind_type] = []
    byType[r.blind_type].push(r)
  }
  for (const type of Object.keys(byType)) {
    byType[type].sort((a, b) => Number(a.min_width_in) - Number(b.min_width_in))
  }
  // Always show the known taxonomy tags even with zero rules, so an admin
  // can seed the first row; plus any other tag already present in the data.
  const allTypes = Array.from(new Set<string>([...BLIND_TYPES, ...Object.keys(byType)]))

  function startEdit(r: HardwareSizeRule) {
    setNewRowFor(null)
    setEditingId(r.id)
    setEditForm(toFormState(r))
  }

  async function saveEdit(id: string) {
    const result = validateForm(editForm)
    if ('error' in result) { toast.error(result.error); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('hardware_size_rules').update(result.data).eq('id', id)
    if (error) { toast.error(error.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action_type: 'hardware_size_rule_update',
        target_table: 'hardware_size_rules',
        target_id: id,
        change_summary: result.data,
      })
    }

    toast.success('Rule updated')
    setEditingId(null)
    setLoading(false)
    router.refresh()
  }

  function startNewRow(blindType: string) {
    setEditingId(null)
    setNewRowFor(blindType)
    setNewForm(BLANK_FORM)
  }

  async function saveNewRow(blindType: string) {
    const result = validateForm(newForm)
    if ('error' in result) { toast.error(result.error); return }

    setLoading(true)
    const supabase = createClient()
    const insertData = { blind_type: blindType, ...result.data }
    const { data: inserted, error } = await supabase
      .from('hardware_size_rules')
      .insert(insertData)
      .select()
      .single()
    if (error) { toast.error(error.message); setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action_type: 'hardware_size_rule_create',
        target_table: 'hardware_size_rules',
        target_id: inserted?.id ?? null,
        change_summary: insertData,
      })
    }

    toast.success('Rule added')
    setNewRowFor(null)
    setLoading(false)
    router.refresh()
  }

  async function deleteRule(r: HardwareSizeRule) {
    if (!confirm(`Delete the ${Number(r.min_width_in)}"–${Number(r.max_width_in)}" rule for ${BLIND_TYPE_LABELS[r.blind_type] ?? r.blind_type}?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('hardware_size_rules').delete().eq('id', r.id)
    if (error) { toast.error(error.message); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action_type: 'hardware_size_rule_delete',
        target_table: 'hardware_size_rules',
        target_id: r.id,
        change_summary: { blind_type: r.blind_type, min_width_in: r.min_width_in, max_width_in: r.max_width_in },
      })
    }

    toast.success('Rule deleted')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {allTypes.map(type => (
        <Card key={type}>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">{BLIND_TYPE_LABELS[type] ?? type}</CardTitle>
            <Button size="sm" variant="outline" onClick={() => startNewRow(type)} disabled={newRowFor === type}>
              <Plus className="mr-2 h-4 w-4" />
              Add Rule
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Width Range (in)</TableHead>
                  <TableHead>Tube Size</TableHead>
                  <TableHead>Control Type</TableHead>
                  <TableHead>Motorized</TableHead>
                  <TableHead>Tube $/in Override</TableHead>
                  <TableHead>Control Fixed $</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(byType[type] ?? []).map(r => {
                  if (editingId === r.id) {
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Input className="h-8 w-16" value={editForm.min_width_in} onChange={e => setEditForm(f => ({ ...f, min_width_in: e.target.value }))} />
                            <span className="text-muted-foreground">&ndash;</span>
                            <Input className="h-8 w-16" value={editForm.max_width_in} onChange={e => setEditForm(f => ({ ...f, max_width_in: e.target.value }))} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 w-24" value={editForm.tube_size} onChange={e => setEditForm(f => ({ ...f, tube_size: e.target.value }))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 w-24" value={editForm.control_type} onChange={e => setEditForm(f => ({ ...f, control_type: e.target.value }))} />
                        </TableCell>
                        <TableCell>
                          <Checkbox checked={editForm.is_motorized} onCheckedChange={v => setEditForm(f => ({ ...f, is_motorized: v === true }))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 w-24" placeholder="—" value={editForm.tube_usd_per_inch_override} onChange={e => setEditForm(f => ({ ...f, tube_usd_per_inch_override: e.target.value }))} />
                        </TableCell>
                        <TableCell>
                          <Input className="h-8 w-24" placeholder="—" value={editForm.control_fixed_usd} onChange={e => setEditForm(f => ({ ...f, control_fixed_usd: e.target.value }))} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(r.id)} disabled={loading}>
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
                    <TableRow key={r.id}>
                      <TableCell>{Number(r.min_width_in)}&quot;&ndash;{Number(r.max_width_in)}&quot;</TableCell>
                      <TableCell>{r.tube_size}</TableCell>
                      <TableCell>{r.control_type}</TableCell>
                      <TableCell>
                        {r.is_motorized ? (
                          <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">Motorized</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Manual</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.tube_usd_per_inch_override != null ? `$${Number(r.tube_usd_per_inch_override).toFixed(4)}` : <span className="text-muted-foreground">none</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.control_fixed_usd != null ? `$${Number(r.control_fixed_usd).toFixed(2)}` : <span className="text-muted-foreground">none</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(r)}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteRule(r)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}

                {newRowFor === type && (
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Input className="h-8 w-16" placeholder="min" value={newForm.min_width_in} onChange={e => setNewForm(f => ({ ...f, min_width_in: e.target.value }))} />
                        <span className="text-muted-foreground">&ndash;</span>
                        <Input className="h-8 w-16" placeholder="max" value={newForm.max_width_in} onChange={e => setNewForm(f => ({ ...f, max_width_in: e.target.value }))} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 w-24" placeholder='1 1/4&quot;' value={newForm.tube_size} onChange={e => setNewForm(f => ({ ...f, tube_size: e.target.value }))} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 w-24" placeholder="VTX 15" value={newForm.control_type} onChange={e => setNewForm(f => ({ ...f, control_type: e.target.value }))} />
                    </TableCell>
                    <TableCell>
                      <Checkbox checked={newForm.is_motorized} onCheckedChange={v => setNewForm(f => ({ ...f, is_motorized: v === true }))} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 w-24" placeholder="—" value={newForm.tube_usd_per_inch_override} onChange={e => setNewForm(f => ({ ...f, tube_usd_per_inch_override: e.target.value }))} />
                    </TableCell>
                    <TableCell>
                      <Input className="h-8 w-24" placeholder="—" value={newForm.control_fixed_usd} onChange={e => setNewForm(f => ({ ...f, control_fixed_usd: e.target.value }))} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveNewRow(type)} disabled={loading}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setNewRowFor(null)} disabled={loading}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {(byType[type] ?? []).length === 0 && newRowFor !== type && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      No rules yet for {BLIND_TYPE_LABELS[type] ?? type}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
