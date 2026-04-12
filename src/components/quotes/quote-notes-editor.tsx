'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import type { QuoteNote } from '@/types/database'

interface QuoteNotesEditorProps {
  quoteId: string
  initialNotes: QuoteNote[]
  /** When false, notes are read-only (customer view). When true, staff can add/edit/delete/toggle. */
  isStaff: boolean
}

/** Generate a simple unique id for a new note (no crypto needed, just uniqueness within the array). */
function newNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Quote notes editor — staff can add, edit, delete, and toggle per-note
 * "show on PDF" visibility. Customers see only the notes flagged as visible.
 * Notes are stored as a jsonb array on the `quotes.notes` column.
 */
export function QuoteNotesEditor({ quoteId, initialNotes, isStaff }: QuoteNotesEditorProps) {
  const [notes, setNotes] = useState<QuoteNote[]>(initialNotes)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  // Customer view: filter to visible-only
  const visibleNotes = notes.filter(n => n.show_on_pdf)
  const displayNotes = isStaff ? notes : visibleNotes

  function addNote() {
    setNotes(prev => [...prev, { id: newNoteId(), text: '', show_on_pdf: true }])
  }

  function updateText(id: string, text: string) {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, text } : n)))
  }

  function togglePdf(id: string) {
    setNotes(prev => prev.map(n => (n.id === id ? { ...n, show_on_pdf: !n.show_on_pdf } : n)))
  }

  function removeNote(id: string) {
    setNotes(prev => prev.filter(n => n.id !== id))
  }

  async function saveNotes() {
    // Strip empty notes before saving
    const cleaned = notes.filter(n => n.text.trim().length > 0)
    setSaving(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('quotes')
      .update({ notes: cleaned })
      .eq('id', quoteId)
    if (error) {
      toast.error(error.message)
      setSaving(false)
      return
    }
    setNotes(cleaned)
    toast.success('Notes saved')
    setSaving(false)
    router.refresh()
  }

  const hasChanges = JSON.stringify(notes) !== JSON.stringify(initialNotes)

  if (!isStaff && visibleNotes.length === 0) return null

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notes
          </CardTitle>
          {isStaff && (
            <Button variant="outline" size="sm" onClick={addNote}>
              <Plus className="mr-1 h-3 w-3" />
              Add Note
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {displayNotes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {isStaff ? 'No notes yet. Click "Add Note" to attach a note to this quote.' : 'No notes.'}
          </p>
        ) : (
          <div className="space-y-3">
            {displayNotes.map(note => (
              <div key={note.id} className="rounded-md border p-3">
                {isStaff ? (
                  <>
                    <Textarea
                      value={note.text}
                      onChange={e => updateText(note.id, e.target.value)}
                      placeholder="Enter a note…"
                      className="mb-2 min-h-[60px] text-sm"
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`pdf-${note.id}`}
                          checked={note.show_on_pdf}
                          onCheckedChange={() => togglePdf(note.id)}
                        />
                        <Label htmlFor={`pdf-${note.id}`} className="text-xs text-muted-foreground">
                          Show on PDF
                        </Label>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeNote(note.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm">{note.text}</p>
                )}
              </div>
            ))}
          </div>
        )}
        {isStaff && hasChanges && (
          <Button onClick={saveNotes} className="mt-3 w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save Notes'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
