'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DoorOpen, Plus, Trash2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import type { Room } from '@/types/database'

interface RoomWithStats extends Room {
  window_count: number
  configured_count: number
  preview_total_usd: number
}

interface RoomListProps {
  rooms: RoomWithStats[]
  propertyId: string
}

export function RoomList({ rooms, propertyId }: RoomListProps) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function openNew() { setEditId(null); setName(''); setOpen(true) }
  function openEdit(room: Room) { setEditId(room.id); setName(room.name); setOpen(true) }

  async function handleSave() {
    if (!name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    const supabase = createClient()
    if (editId) {
      const { error } = await supabase.from('rooms').update({ name: name.trim() }).eq('id', editId)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Room updated')
    } else {
      const { error } = await supabase.from('rooms').insert({ name: name.trim(), property_id: propertyId })
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Room created')
    }
    setOpen(false); setLoading(false); router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this room and all its windows?')) return
    const supabase = createClient()
    const { error } = await supabase.from('rooms').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Room deleted'); router.refresh()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Edit Room' : 'Add Room'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="room-name">Room Name</Label>
              <Input id="room-name" value={name} onChange={e => setName(e.target.value)} placeholder="Living Room" />
            </div>
            <Button onClick={handleSave} className="w-full" disabled={loading}>
              {loading ? 'Saving...' : (editId ? 'Update' : 'Create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rooms</h2>
        <Button onClick={openNew} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Room
        </Button>
      </div>

      {rooms.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <DoorOpen className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="mb-4 text-muted-foreground">No rooms yet. Add a room to start configuring windows.</p>
            <Button onClick={openNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map(room => (
            <Card key={room.id} className="group relative">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <Link href={`/properties/${propertyId}/rooms/${room.id}`} className="flex-1">
                    <CardTitle className="text-lg hover:underline">{room.name}</CardTitle>
                  </Link>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(room)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(room.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {room.window_count} window{room.window_count !== 1 ? 's' : ''}
                  {room.window_count > 0 && room.configured_count < room.window_count && (
                    <span className="ml-1 text-amber-600">
                      ({room.configured_count} configured)
                    </span>
                  )}
                </p>
                {room.preview_total_usd > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Room Total (USD)</span>
                    <span className="text-sm font-semibold text-primary">
                      ${room.preview_total_usd.toFixed(2)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
