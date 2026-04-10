import { createClient } from '@/lib/supabase/server'
import { UserManager } from '@/components/admin/user-manager'

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('profiles')
    .select('*, properties(id, name, address, created_at), quotes(id, total_ttd, created_at, status)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">User Management</h1>
      <UserManager users={users || []} />
    </div>
  )
}
