'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Mail, Phone, Users, Search } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { Profile, UserRole } from '@/types/database'

interface UserManagerProps {
  users: (Profile & {
    properties: { count: number }[]
    quotes: { count: number }[]
  })[]
}

const roleColors: Record<UserRole, string> = {
  administrator: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-300',
  salesman: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-300',
  customer: 'bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-300',
}

export function UserManager({ users }: UserManagerProps) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [viewingUser, setViewingUser] = useState<Profile | null>(null)
  const [editRole, setEditRole] = useState<UserRole>('customer')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const filtered = users.filter(u => {
    const matchesSearch = search === '' ||
      `${u.first_name} ${u.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.contact_number && u.contact_number.includes(search))
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesRole
  })

  function viewUser(user: Profile) {
    setViewingUser(user)
    setEditRole(user.role)
  }

  async function updateRole() {
    if (!viewingUser) return
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('profiles')
      .update({ role: editRole })
      .eq('id', viewingUser.id)

    if (error) { toast.error(error.message); setLoading(false); return }

    // Audit log
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        admin_user_id: user.id,
        action_type: 'user_role_update',
        target_table: 'profiles',
        target_id: viewingUser.id,
        change_summary: { from: viewingUser.role, to: editRole, email: viewingUser.email },
      })
    }

    toast.success('User role updated')
    setLoading(false)
    setViewingUser(null)
    router.refresh()
  }

  const roleCounts = {
    total: users.length,
    customer: users.filter(u => u.role === 'customer').length,
    salesman: users.filter(u => u.role === 'salesman').length,
    administrator: users.filter(u => u.role === 'administrator').length,
  }

  return (
    <>
      {/* Stats */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{roleCounts.total}</p>
              <p className="text-xs text-muted-foreground">Total Users</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{roleCounts.customer}</p>
            <p className="text-xs text-muted-foreground">Customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{roleCounts.salesman}</p>
            <p className="text-xs text-muted-foreground">Salesmen</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-2xl font-bold">{roleCounts.administrator}</p>
            <p className="text-xs text-muted-foreground">Administrators</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={roleFilter} onValueChange={v => setRoleFilter(v ?? 'all')}>
            <SelectTrigger className="sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="customer">Customers</SelectItem>
              <SelectItem value="salesman">Salesmen</SelectItem>
              <SelectItem value="administrator">Administrators</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Users ({filtered.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Properties</TableHead>
                  <TableHead className="text-right">Quotes</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(u => (
                  <TableRow key={u.id} className="cursor-pointer" onClick={() => viewUser(u)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {(u.first_name || u.email).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{u.first_name} {u.last_name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {u.email}
                        </div>
                        {u.contact_number && (
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {u.contact_number}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={roleColors[u.role]}>
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{u.properties?.[0]?.count || 0}</TableCell>
                    <TableCell className="text-right">{u.quotes?.[0]?.count || 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(u.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm">View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* User Detail Dialog */}
      <Dialog open={!!viewingUser} onOpenChange={o => !o && setViewingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
          </DialogHeader>
          {viewingUser && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                  {(viewingUser.first_name || viewingUser.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {viewingUser.first_name} {viewingUser.last_name}
                  </h3>
                  <Badge variant="outline" className={roleColors[viewingUser.role]}>
                    {viewingUser.role}
                  </Badge>
                </div>
              </div>

              <div className="space-y-2 rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{viewingUser.email}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{viewingUser.contact_number || 'No phone number'}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Joined {format(new Date(viewingUser.created_at), 'MMMM d, yyyy')}
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Change Role</label>
                <Select value={editRole} onValueChange={v => setEditRole((v ?? 'customer') as UserRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="salesman">Salesman</SelectItem>
                    <SelectItem value="administrator">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={updateRole}
                disabled={loading || editRole === viewingUser.role}
                className="w-full"
              >
                {loading ? 'Updating...' : 'Save Changes'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
