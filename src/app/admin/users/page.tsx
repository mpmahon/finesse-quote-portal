import { createClient } from '@/lib/supabase/server'
import { UserManager } from '@/components/admin/user-manager'

export default async function AdminUsersPage() {
  const supabase = await createClient()

  const { data: users } = await supabase
    .from('profiles')
    .select('*, properties(count), quotes(count)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">User Management</h1>
      <UserManager users={users || []} />
    </div>
  )
}
