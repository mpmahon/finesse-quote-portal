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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CatalogItem } from '@/types/database'

type CatalogTable = 'shade_types' | 'styles' | 'colours'

interface CatalogManagerProps {
  shadeTypes: CatalogItem[]
  styles: CatalogItem[]
  colours: CatalogItem[]
}

export function CatalogManager({ shadeTypes, styles, colours }: CatalogManagerProps) {
  const [open, setOpen] = useState(false)
  const [targetTable, setTargetTable] = useState<CatalogTable>('shade_types')
  const [editItem, setEditItem] = useState<CatalogItem | null>(null)
  const [name, setName] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function openNew(table: CatalogTable) {
    setTargetTable(table)
    setEditItem(null)
    setName('')
    setIsActive(true)
    setOpen(true)
  }

  function openEdit(table: CatalogTable, item: CatalogItem) {
    setTargetTable(table)
    setEditItem(item)
    setName(item.name)
    setIsActive(item.is_active)
    setOpen(true)
  }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    const supabase = createClient()

    const data = {
      name: name.trim().toLowerCase(),
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }

    if (editItem) {
      const { error } = await supabase
        .from(targetTable)
        .update(data)
        .eq('id', editItem.id)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from(targetTable).insert(data)
      if (error) {
        if (error.code === '23505') {
          toast.error('This value already exists')
        } else {
          toast.error(error.message)
        }
        setLoading(false)
        return
      }
      toast.success('Added')
    }

    // Audit log
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action_type: editItem ? 'catalog_update' : 'catalog_create',
        target_table: targetTable,
        target_id: editItem?.id || null,
        change_summary: data,
      })
    }

    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete(table: CatalogTable, item: CatalogItem) {
    if (!confirm(`Delete "${item.name}"? This will not affect existing products or windows.`)) return
    const supabase = createClient()
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) { toast.error(error.message); return }

    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action_type: 'catalog_delete',
        target_table: table,
        target_id: item.id,
        change_summary: { name: item.name },
      })
    }

    toast.success('Deleted')
    router.refresh()
  }

  function CatalogSection({
    title,
    table,
    items,
  }: { title: string; table: CatalogTable; items: CatalogItem[] }) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">{title}</CardTitle>
          <Button size="sm" onClick={() => openNew(table)}>
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No items yet. Add your first {title.toLowerCase().slice(0, -1)}.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
                >
                  <span className={`capitalize ${!item.is_active ? 'text-muted-foreground line-through' : ''}`}>
                    {item.name}
                  </span>
                  {!item.is_active && (
                    <Badge variant="outline" className="text-[10px]">inactive</Badge>
                  )}
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(table, item)}
                      className="rounded p-0.5 hover:bg-accent"
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(table, item)}
                      className="rounded p-0.5 text-destructive hover:bg-destructive/10"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editItem ? 'Edit' : 'Add'} {targetTable.replace('_', ' ').replace(/s$/, '')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="catalog-name">Name</Label>
              <Input
                id="catalog-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. light filtering"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Stored in lowercase. Existing products using this value are not affected by renames.</p>
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label htmlFor="catalog-active">Active</Label>
                <p className="text-xs text-muted-foreground">Inactive items can&apos;t be selected on new products.</p>
              </div>
              <input
                id="catalog-active"
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

      <Tabs defaultValue="shade_types">
        <TabsList className="mb-4">
          <TabsTrigger value="shade_types">Shade Types ({shadeTypes.length})</TabsTrigger>
          <TabsTrigger value="styles">Styles ({styles.length})</TabsTrigger>
          <TabsTrigger value="colours">Colours ({colours.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="shade_types">
          <CatalogSection title="Shade Types" table="shade_types" items={shadeTypes} />
        </TabsContent>
        <TabsContent value="styles">
          <CatalogSection title="Styles" table="styles" items={styles} />
        </TabsContent>
        <TabsContent value="colours">
          <CatalogSection title="Colours" table="colours" items={colours} />
        </TabsContent>
      </Tabs>
    </>
  )
}
