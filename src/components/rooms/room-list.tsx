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
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DoorOpen, Plus, Trash2, Pencil, Info } from 'lucide-react'
import { toast } from 'sonner'
import { STANDARD_ROOMS, OTHER_ROOM_VALUE } from '@/lib/constants'
import type { Room } from '@/types/database'

/** True when a stored room name matches one of the standard dropdown options (case-insensitive). */
function isStandardRoomName(name: string): boolean {
  return STANDARD_ROOMS.some(r => r.toLowerCase() === name.trim().toLowerCase())
}

interface RoomWithStats extends Room {
  window_count: number
  configured_count: number
  priceable_count: number
  no_blind_count: number
  /** Full-formula TTD estimate for the room (shared estimate layer). */
  preview_total_ttd: number
}

interface RoomListProps {
  rooms: RoomWithStats[]
  propertyId: string
  /** Query-string suffix (including leading `?`) carrying a "Quote from style" selection through to the room's windows. Empty string on a normal visit. */
  styleQuery?: string
}

export function RoomList({ rooms, propertyId, styleQuery = '' }: RoomListProps) {
  const [open, setOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  // `roomSelect` holds either a standard room name or the OTHER_ROOM_VALUE
  // sentinel; `customName` holds the free-text name when "Other…" is picked.
  // Only the resolved name (never the sentinel) is written to the DB.
  const [roomSelect, setRoomSelect] = useState<string>('')
  const [customName, setCustomName] = useState('')
  /** Wholesale room-quantity multiplier — kept as a raw string for a controlled input; parsed/validated on save. */
  const [quantity, setQuantity] = useState('1')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function openNew() { setEditId(null); setRoomSelect(''); setCustomName(''); setQuantity('1'); setOpen(true) }

  function openEdit(room: Room) {
    setEditId(room.id)
    if (isStandardRoomName(room.name)) {
      setRoomSelect(room.name)
      setCustomName('')
    } else {
      setRoomSelect(OTHER_ROOM_VALUE)
      setCustomName(room.name)
    }
    setQuantity(String(room.quantity))
    setOpen(true)
  }

  const resolvedName = roomSelect === OTHER_ROOM_VALUE ? customName.trim() : roomSelect

  async function handleSave() {
    if (!resolvedName) { toast.error('Name is required'); return }
    const parsedQuantity = parseInt(quantity, 10)
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      toast.error('Number of identical rooms must be a whole number of at least 1')
      return
    }
    setLoading(true)
    const supabase = createClient()
    if (editId) {
      const { error } = await supabase.from('rooms').update({ name: resolvedName, quantity: parsedQuantity }).eq('id', editId)
      if (error) { toast.error(error.message); setLoading(false); return }
      toast.success('Room updated')
    } else {
      const { error } = await supabase.from('rooms').insert({ name: resolvedName, property_id: propertyId, quantity: parsedQuantity })
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
              <Select value={roomSelect} onValueChange={v => setRoomSelect(v ?? '')}>
                <SelectTrigger id="room-name">
                  {/* Render function so the OTHER_ROOM_VALUE sentinel displays as
                      "Other…" rather than its raw value. */}
                  <SelectValue placeholder="Select a room">
                    {(v: string) => (v === OTHER_ROOM_VALUE ? 'Other…' : v || 'Select a room')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {STANDARD_ROOMS.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                  <SelectItem value={OTHER_ROOM_VALUE}>Other…</SelectItem>
                </SelectContent>
              </Select>
              {roomSelect === OTHER_ROOM_VALUE && (
                <Input
                  autoFocus
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="Enter a custom room name"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="room-quantity">Number of identical rooms</Label>
                <Tooltip>
                  <TooltipTrigger type="button" className="inline-flex items-center align-middle text-muted-foreground hover:text-foreground" aria-label="More info">
                    <Info className="h-3.5 w-3.5" />
                  </TooltipTrigger>
                  <TooltipContent>
                    If you have multiple rooms with the same configuration, enter how many rooms match this style.
                  </TooltipContent>
                </Tooltip>
              </div>
              <Input
                id="room-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
              />
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
                  <Link href={`/properties/${propertyId}/rooms/${room.id}${styleQuery}`} className="flex-1">
                    <CardTitle className="flex items-center gap-1.5 text-lg hover:underline">
                      {room.name}
                      {room.quantity > 1 && (
                        <Badge variant="outline" className="text-[10px] font-normal">×{room.quantity}</Badge>
                      )}
                    </CardTitle>
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
                  {room.no_blind_count > 0 && (
                    <span className="ml-1">· {room.no_blind_count} no blind</span>
                  )}
                  {room.priceable_count > 0 && room.configured_count < room.priceable_count && (
                    <span className="ml-1 text-amber-600">
                      ({room.priceable_count - room.configured_count} need configuration)
                    </span>
                  )}
                </p>
                {room.preview_total_ttd > 0 && (
                  <div className="flex items-center justify-between rounded-md bg-primary/5 px-3 py-2">
                    <span className="text-xs font-medium text-muted-foreground">Est. Room Total</span>
                    <span className="text-sm font-semibold text-primary">
                      TTD ${room.preview_total_ttd.toFixed(2)}
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
