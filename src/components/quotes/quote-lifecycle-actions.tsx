'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Send, Check, X, Link as LinkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { sendQuoteAction, acceptQuoteAction, declineQuoteAction } from '@/app/quotes/actions'

interface QuoteLifecycleActionsProps {
  quoteId: string
  /** Effective status — pass effectiveQuoteStatus(quote). */
  status: string
  isStaff: boolean
  /** True when the viewer owns the quote (customer). */
  isOwner: boolean
}

/**
 * Lifecycle buttons (WS4 §9.1):
 * - staff on a draft: "Send Quote" (stamps sent_at) + copy share link
 * - owner (or staff, for phone acceptances) on a sent quote: Accept / Decline
 * All transitions run through server actions — no direct table writes.
 */
export function QuoteLifecycleActions({ quoteId, status, isStaff, isOwner }: QuoteLifecycleActionsProps) {
  const [busy, setBusy] = useState(false)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [reason, setReason] = useState('')
  const router = useRouter()

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error ?? 'Something went wrong')
      return
    }
    toast.success(success)
    router.refresh()
  }

  async function copyLink() {
    const url = `${window.location.origin}/quotes/${quoteId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Quote link copied — share it with the customer')
    } catch {
      toast.error(`Copy failed — the link is ${url}`)
    }
  }

  if (status === 'draft' && isStaff) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => run(() => sendQuoteAction(quoteId), 'Quote sent')}
          disabled={busy}
        >
          <Send className="mr-2 h-4 w-4" />
          {busy ? 'Sending…' : 'Send Quote'}
        </Button>
        <Button variant="outline" onClick={copyLink}>
          <LinkIcon className="mr-2 h-4 w-4" />
          Copy Link
        </Button>
      </div>
    )
  }

  if (status === 'sent' && (isOwner || isStaff)) {
    return (
      <>
        <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Decline this quote?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="decline-reason">Reason (optional)</Label>
                <Textarea
                  id="decline-reason"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Let us know why, so we can improve the offer…"
                />
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={busy}
                onClick={async () => {
                  await run(() => declineQuoteAction(quoteId, reason), 'Quote declined')
                  setDeclineOpen(false)
                }}
              >
                {busy ? 'Declining…' : 'Decline Quote'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <div className="flex flex-wrap gap-2">
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => run(() => acceptQuoteAction(quoteId), 'Quote accepted — we’ll be in touch to schedule your installation')}
            disabled={busy}
          >
            <Check className="mr-2 h-4 w-4" />
            {busy ? 'Accepting…' : isStaff && !isOwner ? 'Mark Accepted' : 'Accept Quote'}
          </Button>
          <Button variant="outline" onClick={() => setDeclineOpen(true)} disabled={busy}>
            <X className="mr-2 h-4 w-4" />
            Decline
          </Button>
          {isStaff && (
            <Button variant="outline" onClick={copyLink}>
              <LinkIcon className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
          )}
        </div>
      </>
    )
  }

  return null
}
