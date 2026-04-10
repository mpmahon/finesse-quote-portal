import { createClient } from '@/lib/supabase/server'
import { AuditLogViewer } from '@/components/admin/audit-log-viewer'

export default async function AuditLogsPage() {
  const supabase = await createClient()

  const { data: logs } = await supabase
    .from('audit_logs')
    .select('*, profiles(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(200)

  const normalized = (logs || []).map(l => ({
    ...l,
    profiles: Array.isArray(l.profiles) ? l.profiles[0] ?? null : l.profiles,
  }))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Audit Logs</h1>
      <AuditLogViewer logs={normalized} />
    </div>
  )
}
