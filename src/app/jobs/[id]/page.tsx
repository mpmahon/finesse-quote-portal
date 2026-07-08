import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { JobDetailControls } from '@/components/jobs/job-detail-controls'
import { WindowDiagram } from '@/components/windows/window-diagram'
import { MOUNT_TYPE_LABELS } from '@/lib/constants'
import { isStaffRole } from '@/types/database'
import { format } from 'date-fns'
import type { MountType, StageHistoryEntry, UserRole } from '@/types/database'

/**
 * Job detail (Batch 11): quote link, customer info, the window list with
 * diagrams (installers need dims + mount type on-site), the 16-stage
 * workflow stepper + dropdown + stage-history list, install date + notes,
 * and assignee management. Property is optional now — a pre-quote order
 * (workflow stages 1-5) may not have one picked yet.
 */
export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isStaff = isStaffRole((profile?.role ?? 'retail_customer') as UserRole)

  const { data: job } = await supabase
    .from('jobs')
    .select(`
      *,
      properties(id, name, address, profiles!user_id(first_name, last_name, email, contact_number)),
      customer:profiles!customer_id(id, first_name, last_name, email, contact_number),
      quotes(id, total_ttd, accepted_at),
      job_assignments(id, assignee_id, profiles!assignee_id(first_name, last_name))
    `)
    .eq('id', id)
    .single()
  if (!job) notFound()

  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
  const property = one(job.properties)
  const propertyOwner = property ? one(property.profiles) : null
  // Prefer the job's own customer_id link; fall back to the property
  // owner for any row where it's somehow unset (shouldn't happen post-
  // migration-00020 backfill, but the fallback is cheap and defensive).
  const owner = one(job.customer) ?? propertyOwner
  const quote = one(job.quotes)

  const [{ data: windows }, { data: staff }, { data: legacyColours }, { data: blindColours }] = await Promise.all([
    property
      ? supabase
          .from('windows')
          .select('id, name, width_inches, height_inches, mount_type, has_blind, has_awning, colour, shade_type, style, opacity, valance, rooms!inner(name, property_id)')
          .eq('rooms.property_id', property.id)
      : Promise.resolve({ data: [] }),
    supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('role', ['salesman', 'administrator'])
      .order('first_name'),
    // Legacy flat colours (pre-Batch-7 windows) + the new hierarchy's
    // colours (Batch 7 onward) — merged so a swatch renders correctly
    // whichever taxonomy configured this window.
    supabase.from('legacy_colours').select('name, hex_code'),
    supabase.from('blind_colours').select('name, hex_code'),
  ])

  const hexByColour: Record<string, string> = {}
  for (const c of [...(legacyColours ?? []), ...(blindColours ?? [])]) {
    if (c.hex_code) hexByColour[c.name.toLowerCase()] = c.hex_code
  }

  // Resolve display names for every actor referenced in stage_history.
  // The staff list covers the common case (stage moves are staff-only); a
  // targeted lookup fills in anyone not currently salesman/administrator
  // (e.g. a role change since the move was recorded).
  const stageHistory: StageHistoryEntry[] = Array.isArray(job.stage_history) ? job.stage_history : []
  const actorNames: Record<string, string> = {}
  for (const s of staff ?? []) actorNames[s.id] = `${s.first_name} ${s.last_name}`.trim()
  const missingActorIds = [...new Set(stageHistory.map(h => h.actor_id))].filter(actorId => !actorNames[actorId])
  if (missingActorIds.length > 0) {
    const { data: missingActors } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .in('id', missingActorIds)
    for (const a of missingActors ?? []) actorNames[a.id] = `${a.first_name} ${a.last_name}`.trim()
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/jobs" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Jobs
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">{property?.name ?? 'Order'}</h1>
            {property?.address && <p className="text-muted-foreground">{property.address}</p>}
          </div>
          {quote && (
            <Link href={`/quotes/${quote.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="mr-2 h-4 w-4" />
                View Quote — TTD ${Number(quote.total_ttd).toFixed(2)}
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {owner ? (
                <>
                  <p className="font-medium">{owner.first_name} {owner.last_name}</p>
                  <p className="text-muted-foreground">{owner.email}</p>
                  {owner.contact_number && <p className="text-muted-foreground">{owner.contact_number}</p>}
                </>
              ) : (
                <p className="text-muted-foreground">Unknown customer</p>
              )}
              {quote?.accepted_at && (
                <p className="pt-1 text-xs text-muted-foreground">
                  Quote accepted {format(new Date(quote.accepted_at), 'MMM d, yyyy')}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Windows for the install team */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Windows ({(windows ?? []).length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {(windows ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {property ? 'No windows recorded.' : 'No property picked yet.'}
                </p>
              ) : (
                (windows ?? []).map(w => {
                  const room = Array.isArray(w.rooms) ? w.rooms[0] : w.rooms
                  return (
                    <div key={w.id} className="flex items-center gap-3 rounded-md border p-2.5">
                      <WindowDiagram
                        widthInches={Number(w.width_inches)}
                        heightInches={Number(w.height_inches)}
                        mountType={w.mount_type as MountType}
                        blindColour={w.colour ? hexByColour[w.colour.toLowerCase()] ?? null : null}
                        showBlind={w.has_blind}
                        className="w-20 shrink-0"
                      />
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">{w.name} <span className="text-xs text-muted-foreground">· {room?.name}</span></p>
                        <p className="text-xs text-muted-foreground">
                          {Number(w.width_inches)}&quot; × {Number(w.height_inches)}&quot; · {MOUNT_TYPE_LABELS[w.mount_type as MountType]}
                          {w.colour && <> · <span className="capitalize">{w.colour}</span></>}
                        </p>
                        {(w.opacity || w.style || w.valance) && (
                          <p className="text-xs text-muted-foreground">
                            {[w.opacity, w.style].filter(Boolean).join(' / ')}
                            {w.valance && <> · Valance: {w.valance}</>}
                          </p>
                        )}
                        <div className="mt-1 flex gap-1">
                          {w.has_blind && <Badge className="text-[10px]">Blind</Badge>}
                          {w.has_awning && <Badge variant="secondary" className="text-[10px]">Awning</Badge>}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>

        <JobDetailControls
          jobId={id}
          workflowStage={job.workflow_stage}
          stageHistory={stageHistory}
          actorNames={actorNames}
          isStaff={isStaff}
          scheduledInstallDate={job.scheduled_install_date}
          installNotes={job.install_notes}
          assignments={(job.job_assignments ?? []).map((a: { id: string; assignee_id: string; profiles: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }) => {
            const p = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
            return { id: a.id, assignee_id: a.assignee_id, name: p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown' }
          })}
          staff={(staff ?? []).map(s => ({ id: s.id, name: `${s.first_name} ${s.last_name}`.trim() }))}
        />
      </div>
    </div>
  )
}
