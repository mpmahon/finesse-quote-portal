'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SquareStack, Plus, Trash2, Pencil, Settings2, Info } from 'lucide-react'
import { toast } from 'sonner'
import { MOUNT_TYPE_LABELS } from '@/lib/constants'
import { windowSchemaWithLimits, type WindowLimits } from '@/lib/validators'
import type { Window, MountType } from '@/types/database'

/** Small inline help icon that reveals a tooltip on hover/focus — consistent field-level guidance pattern for the room/window forms. */
function FieldHint({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        className="inline-flex items-center align-middle text-muted-foreground hover:text-foreground"
        aria-label="More info"
      >
        <Info className="h-3.5 w-3.5" />
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  )
}

interface WindowListProps {
  windows: (Window & {
    products: { make: string; model: string } | null
    awning_products: { make: string; model: string } | null
    /** Full-formula per-window TTD estimate from the shared estimate layer. */
    preview_ttd?: number | null
  })[]
  roomId: string
  propertyId: string
  /** Dimension limits from pricing_config, enforced on create/edit (WS1 §5.4). */
  limits: WindowLimits
  /** Query-string suffix (including leading `?`) carrying a "Quote from style" selection through to the configurator. Empty string on a normal visit. */
  styleQuery?: string
  /** When a gallery selection is present, which feature it applies to — defaults the Add Window dialog's Blind/Awning toggle so the pre-filled product is actually visible at the configurator. Undefined on a normal visit (toggles keep their existing defaults). */
  defaultKind?: 'blind' | 'awning'
}

export function WindowList({ windows, roomId, propertyId, limits, styleQuery = '', defaultKind }: WindowListProps) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', width_inches: '', height_inches: '', depth_inches: '',
    // Default changed to outside mount per client request — most jobs are
    // outside mount, so it saves the salesperson a click on the common case.
    mount_type: 'outside' as MountType, has_blind: true, has_awning: false,
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function openNew() {
    setEditId(null)
    setForm({
      name: '', description: '', width_inches: '', height_inches: '', depth_inches: '', mount_type: 'outside',
      // A "Quote from style" awning selection should land on a window with
      // Awning already enabled, otherwise the pre-filled product is hidden
      // until the user manually flips the toggle themselves.
      has_blind: defaultKind !== 'awning',
      has_awning: defaultKind === 'awning',
    })
    setOpen(true)
  }

  function openEdit(w: Window) {
    setEditId(w.id)
    setForm({
      name: w.name,
      description: w.description ?? '',
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
    // Validate against the shared zod schema, including pricing_config
    // dimension limits — the server enforces the same bounds at quote time.
    const parsed = windowSchemaWithLimits(limits).safeParse({
      name: form.name.trim(),
      description: form.description.trim() || null,
      width_inches: form.width_inches,
      height_inches: form.height_inches,
      depth_inches: form.depth_inches || null,
      mount_type: form.mount_type,
      has_blind: form.has_blind,
      has_awning: form.has_awning,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid window details')
      return
    }
    if (form.mount_type === 'inside' && (!form.depth_inches || parseFloat(form.depth_inches) <= 0)) {
      toast.error('Window depth is required for inside mount'); return
    }

    setLoading(true)
    const supabase = createClient()
    const data = {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      width_inches: parsed.data.width_inches,
      height_inches: parsed.data.height_inches,
      depth_inches: parsed.data.depth_inches ?? null,
      mount_type: parsed.data.mount_type,
      has_blind: parsed.data.has_blind,
      has_awning: parsed.data.has_awning,
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
            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <p>
                <span className="font-medium text-foreground">Company policy:</span> enter windows starting from
                the left-most window and continue clockwise around the room — Window 1, Window 2, Window 3…
              </p>
            </div>
            <div className="space-y-2">
              <Label>Window Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Window 1" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Description (optional)</Label>
                <FieldHint text="Specifics that help fabrication or installation, e.g. &quot;faces the pool, arched top&quot;." />
              </div>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Faces the pool, arched top"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Width (inches)</Label>
                <Input type="number" step="0.125" inputMode="decimal" min={limits.min_window_size_in} max={limits.max_window_width_in} value={form.width_inches} onChange={e => setForm(f => ({ ...f, width_inches: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">{limits.min_window_size_in}&quot;–{limits.max_window_width_in}&quot;</p>
              </div>
              <div className="space-y-2">
                <Label>Height (inches)</Label>
                <Input type="number" step="0.125" inputMode="decimal" min={limits.min_window_size_in} max={limits.max_window_height_in} value={form.height_inches} onChange={e => setForm(f => ({ ...f, height_inches: e.target.value }))} />
                <p className="text-[11px] text-muted-foreground">{limits.min_window_size_in}&quot;–{limits.max_window_height_in}&quot;</p>
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              Measure to the nearest 1/8&quot;. Standard width 20&quot;–98&quot; (&gt;98&quot; is oversized); standard height 20&quot;–120&quot;.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Mount Type</Label>
                <FieldHint text="Inside mount sits within the window reveal; outside mount overlaps the frame. Pick Undecided if the customer hasn't chosen yet — it's treated as outside mount until confirmed." />
              </div>
              <Select value={form.mount_type} onValueChange={v => setForm(f => ({ ...f, mount_type: (v ?? 'outside') as MountType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="inside">Inside Mount</SelectItem>
                  <SelectItem value="outside">Outside Mount</SelectItem>
                  <SelectItem value="undecided">Undecided / I Don&apos;t Know</SelectItem>
                </SelectContent>
              </Select>
              {form.mount_type === 'undecided' && (
                <p className="text-[11px] italic text-muted-foreground">
                  Mount TBD — treated as outside mount for pricing until confirmed.
                </p>
              )}
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
                {w.description && (
                  <p className="text-xs text-muted-foreground">{w.description}</p>
                )}
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
                {w.mount_type === 'undecided' && (
                  <p className="text-xs italic text-muted-foreground">Mount TBD — priced as outside mount for now</p>
                )}
                {!w.has_blind && !w.has_awning ? (
                  <p className="text-sm text-muted-foreground">
                    Tracked for future reference. Zero cost on quote.
                  </p>
                ) : (
                  <div className="space-y-1 text-sm">
                    {w.has_blind && (
                      w.products ? (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Blind:</span> {w.products.make} {w.products.model}
                          {w.shade_type && ` - ${w.shade_type}`}
                          {w.opacity && ` / ${w.opacity}`}
                          {w.style && ` / ${w.style}`}
                          {w.colour && ` (${w.colour})`}
                          {w.valance && ` · Valance: ${w.valance}`}
                        </p>
                      ) : (
                        <p className="text-amber-600">Blind not configured</p>
                      )
                    )}
                    {w.has_awning && (
                      w.awning_products ? (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Awning:</span> {w.awning_products.make} {w.awning_products.model}
                          {w.awning_colour && ` (${w.awning_colour})`}
                        </p>
                      ) : (
                        <p className="text-amber-600">Awning not configured</p>
                      )
                    )}
                  </div>
                )}
                {typeof w.preview_ttd === 'number' && (w.has_blind || w.has_awning) && w.preview_ttd > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Estimate</span>
                    <span className="text-sm font-semibold text-primary">
                      TTD ${w.preview_ttd.toFixed(2)}
                    </span>
                  </div>
                )}
                {(w.has_blind || w.has_awning) && (() => {
                  const blindDone = !w.has_blind || !!w.products
                  const awningDone = !w.has_awning || !!w.awning_products
                  const allDone = blindDone && awningDone
                  return (
                    <Link href={`/properties/${propertyId}/rooms/${roomId}/windows/${w.id}${styleQuery}`}>
                      <Button variant="outline" size="sm" className="mt-2">
                        <Settings2 className="mr-2 h-3 w-3" />
                        {allDone ? 'Reconfigure' : 'Configure'}
                      </Button>
                    </Link>
                  )
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
