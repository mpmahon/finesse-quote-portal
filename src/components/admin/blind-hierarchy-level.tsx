'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/** Minimal shape shared by every blind-hierarchy node (Type/Opacity/Style/Colour/Valance). */
export interface HierarchyLevelItem {
  id: string
  name: string
  is_active: boolean
  sort_order: number
  hex_code?: string | null
}

interface BlindHierarchyLevelProps {
  /** Card title, e.g. "Opacities for Roller Shade". */
  title: string
  /** Items already scoped to the current parent (Type/Opacity/Style), unsorted — this component sorts by sort_order then name. */
  items: HierarchyLevelItem[]
  /** Supabase table to CRUD against (blind_types / blind_opacities / blind_styles / blind_colours / blind_valances). */
  table: string
  /** Fields merged into every insert to scope the new row to its parent (e.g. `{ type_id: selectedTypeId }`). Empty object for the root Types level. */
  scopeFields: Record<string, string>
  /** Colours only: shows the hex-code picker in the add/edit dialog and a swatch dot per row. */
  showHex?: boolean
  /** When true, rows are clickable to drill into the next level (Types/Opacities/Styles). Colours and Valances are terminal — not selectable. */
  selectable?: boolean
  selectedId?: string | null
  onSelect?: (id: string) => void
  /** Called after a delete so the parent can clear its selection if the deleted row was selected. */
  onDeleted?: (id: string) => void
  /** Shown when the (scoped) item list is empty — e.g. "No styles yet for this opacity — add the first." */
  emptyHint: string
  /** Optional extra confirmation text appended to the delete confirm (e.g. cascade warning for Types). */
  deleteWarning?: string
}

/**
 * One level of the blind option hierarchy admin editor (Batch 7): a
 * sort_order-ordered list with inline add/rename/deactivate/delete/reorder,
 * audit-logged like the other admin managers. Used for all five tables —
 * `table` + `scopeFields` + `showHex`/`selectable` vary per level; see
 * `BlindHierarchyManager` for how the five instances are wired together
 * into the Type -> Opacity -> Style -> Colour drill-down plus the parallel
 * per-Type Valance list.
 */
export function BlindHierarchyLevel({
  title,
  items,
  table,
  scopeFields,
  showHex = false,
  selectable = false,
  selectedId = null,
  onSelect,
  onDeleted,
  emptyHint,
  deleteWarning,
}: BlindHierarchyLevelProps) {
  const [open, setOpen] = useState(false)
  const [editItem, setEditItem] = useState<HierarchyLevelItem | null>(null)
  const [name, setName] = useState('')
  const [hexCode, setHexCode] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))

  function openNew() {
    setEditItem(null)
    setName('')
    setHexCode('')
    setIsActive(true)
    setOpen(true)
  }

  function openEdit(item: HierarchyLevelItem) {
    setEditItem(item)
    setName(item.name)
    setHexCode(item.hex_code || '')
    setIsActive(item.is_active)
    setOpen(true)
  }

  async function logAudit(actionType: string, targetId: string | null, changeSummary: Record<string, unknown>) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action_type: actionType,
      target_table: table,
      target_id: targetId,
      change_summary: changeSummary,
    })
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    if (showHex && hexCode && !/^#[0-9a-fA-F]{6}$/.test(hexCode)) {
      toast.error('Hex code must look like #aabbcc'); return
    }
    setLoading(true)
    const supabase = createClient()

    const data: Record<string, unknown> = {
      name: name.trim(),
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }
    if (showHex) {
      data.hex_code = hexCode ? hexCode.toLowerCase() : null
    }

    if (editItem) {
      const { error } = await supabase.from(table).update(data).eq('id', editItem.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      await logAudit(`${table}_update`, editItem.id, data)
      toast.success('Updated')
    } else {
      const insertData = { ...data, sort_order: sorted.length, ...scopeFields }
      const { data: inserted, error } = await supabase.from(table).insert(insertData).select().single()
      if (error) {
        toast.error(error.code === '23505' ? 'This value already exists at this level' : error.message)
        setLoading(false)
        return
      }
      await logAudit(`${table}_create`, inserted?.id ?? null, insertData)
      toast.success('Added')
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(item: HierarchyLevelItem) {
    const warning = deleteWarning ? ` ${deleteWarning}` : ''
    if (!confirm(`Delete "${item.name}"?${warning}`)) return
    const supabase = createClient()
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) { toast.error(error.message); return }
    await logAudit(`${table}_delete`, item.id, { name: item.name })
    toast.success('Deleted')
    onDeleted?.(item.id)
    router.refresh()
  }

  /** Swaps sort_order with the adjacent row in display order and persists both. */
  async function move(item: HierarchyLevelItem, direction: 'up' | 'down') {
    const idx = sorted.findIndex(i => i.id === item.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    const supabase = createClient()
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      supabase.from(table).update({ sort_order: other.sort_order }).eq('id', item.id),
      supabase.from(table).update({ sort_order: item.sort_order }).eq('id', other.id),
    ])
    if (e1 || e2) { toast.error(e1?.message || e2?.message); return }
    router.refresh()
  }

  return (
    <Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit' : 'Add'} — {title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="hierarchy-name">Name</Label>
              <Input id="hierarchy-name" value={name} onChange={e => setName(e.target.value)} autoFocus />
            </div>
            {showHex && (
              <div className="space-y-2">
                <Label htmlFor="hierarchy-hex">Swatch Colour (hex, optional)</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    aria-label="Pick swatch colour"
                    value={/^#[0-9a-fA-F]{6}$/.test(hexCode) ? hexCode : '#e2e8f0'}
                    onChange={e => setHexCode(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border p-0.5"
                  />
                  <Input id="hierarchy-hex" value={hexCode} onChange={e => setHexCode(e.target.value)} placeholder="#aabbcc" className="flex-1" />
                </div>
              </div>
            )}
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="hierarchy-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive options don&apos;t appear for new window configuration.</p>
              </div>
              <input
                id="hierarchy-active"
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : (editItem ? 'Update' : 'Create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <Button size="sm" onClick={openNew}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="rounded-md border border-dashed py-4 text-center text-sm text-muted-foreground">{emptyHint}</p>
        ) : (
          <div className="space-y-1">
            {sorted.map((item, idx) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm',
                  selectable && 'cursor-pointer hover:bg-accent',
                  selectable && selectedId === item.id && 'border-primary bg-primary/5'
                )}
                onClick={selectable ? () => onSelect?.(item.id) : undefined}
              >
                <div className="flex flex-col">
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={idx === 0}
                    onClick={e => { e.stopPropagation(); move(item, 'up') }}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    disabled={idx === sorted.length - 1}
                    onClick={e => { e.stopPropagation(); move(item, 'down') }}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
                {showHex && (
                  <span
                    className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                    style={{ backgroundColor: item.hex_code || '#e2e8f0' }}
                  />
                )}
                <span className={cn('flex-1', !item.is_active && 'text-muted-foreground line-through')}>{item.name}</span>
                {!item.is_active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
                <button
                  onClick={e => { e.stopPropagation(); openEdit(item) }}
                  className="rounded p-1 hover:bg-accent"
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(item) }}
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                {selectable && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
