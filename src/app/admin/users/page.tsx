import { createClient } from '@/lib/supabase/server'
import { UserManager } from '@/components/admin/user-manager'

export default async function AdminUsersPage() {
  const supabase = await createClient()

  // Disambiguate the embedded joins — both properties and quotes have two
  // FKs to profiles (user_id + created_by), so PostgREST needs !user_id
  // to know which path to follow.
  const { data: users } = await supabase
    .from('profiles')
    .select('*, properties!user_id(id, name, address, created_at), quotes!user_id(id, total_ttd, created_at, status)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">User Management</h1>
      <UserManager users={users || []} />
    </div>
  )
}
