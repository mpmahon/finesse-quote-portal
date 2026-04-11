'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Mail, Phone, Users, Search, Building2, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { Profile, UserRole } from '@/types/database'

interface UserWithDetails extends Profile {
  properties: { id: string; name: string; address: string | null; created_at: string }[]
  quotes: { id: string; total_ttd: number; created_at: string; status: string }[]
}

interface UserManagerProps {
  users: UserWithDetails[]
}

const roleColors: Record<UserRole, string> = {
  administrator: 'bg-purple-500/10 text-purple-700 border-purple-200 dark:text-purple-300',
  salesman: 'bg-blue-500/10 text-blue-700 border-blue-200 dark:text-blue-300',
  retail_customer: 'bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-300',
  wholesale_customer: 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-300',
}

const roleLabels: Record<UserRole, string> = {
  administrator: 'Administrator',
  salesman: 'Salesman',
  retail_customer: 'Retail Customer',
  wholesale_customer: 'Wholesale Customer',
}

export function UserManager({ users }: UserManagerProps) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('all')
  const [viewingUser, setViewingUser] = useState<UserWithDetails | null>(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    contact_number: '',
    role: 'retail_customer' as UserRole,
  })
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

  function viewUser(user: UserWithDetails) {
    setViewingUser(user)
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email,
      contact_number: user.contact_number || '',
      role: user.role,
    })
  }

  function updateField(field: keyof typeof editForm, value: string) {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  async function saveUser() {
    if (!viewingUser) return
    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      toast.error('First and last name are required')
      return
    }

    setLoading(true)
    const supabase = createClient()

    const updates = {
      first_name: editForm.first_name.trim(),
      last_name: editForm.last_name.trim(),
      contact_number: editForm.contact_number.trim() || null,
      role: editForm.role,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', viewingUser.id)

    if (error) { toast.error(error.message); setLoading(false); return }

    // Audit log for any changes
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (viewingUser.first_name !== updates.first_name) changes.first_name = { from: viewingUser.first_name, to: updates.first_name }
    if (viewingUser.last_name !== updates.last_name) changes.last_name = { from: viewingUser.last_name, to: updates.last_name }
    if ((viewingUser.contact_number || null) !== updates.contact_number) changes.contact_number = { from: viewingUser.contact_number, to: updates.contact_number }
    if (viewingUser.role !== updates.role) changes.role = { from: viewingUser.role, to: updates.role }

    if (Object.keys(changes).length > 0) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('audit_logs').insert({
          actor_id: user.id,
          action_type: 'user_update',
          target_table: 'profiles',
          target_id: viewingUser.id,
          change_summary: { email: viewingUser.email, changes },
        })
      }
    }

    toast.success('User updated')
    setLoading(false)
    setViewingUser(null)
    router.refresh()
  }

  const isDirty = viewingUser && (
    editForm.first_name !== (viewingUser.first_name || '') ||
    editForm.last_name !== (viewingUser.last_name || '') ||
    editForm.contact_number !== (viewingUser.contact_number || '') ||
    editForm.role !== viewingUser.role
  )

  const roleCounts = {
    total: users.length,
    customers: users.filter(u => u.role === 'retail_customer' || u.role === 'wholesale_customer').length,
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
            <p className="text-2xl font-bold">{roleCounts.customers}</p>
            <p className="text-xs text-muted-foreground">Customers (Retail + Wholesale)</p>
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
              <SelectItem value="retail_customer">Retail Customers</SelectItem>
              <SelectItem value="wholesale_customer">Wholesale Customers</SelectItem>
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
                        {roleLabels[u.role]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{u.properties?.length || 0}</TableCell>
                    <TableCell className="text-right">{u.quotes?.length || 0}</TableCell>
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
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          {viewingUser && (
            <div className="space-y-4">
              {/* User Header */}
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                  {(editForm.first_name || viewingUser.email).charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-lg font-semibold">
                    {editForm.first_name} {editForm.last_name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Joined {format(new Date(viewingUser.created_at), 'MMMM d, yyyy')}
                  </p>
                </div>
              </div>

              {/* Editable Fields */}
              <div className="space-y-4 rounded-lg border p-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Profile</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-first">First Name</Label>
                    <Input
                      id="edit-first"
                      value={editForm.first_name}
                      onChange={e => updateField('first_name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-last">Last Name</Label>
                    <Input
                      id="edit-last"
                      value={editForm.last_name}
                      onChange={e => updateField('last_name', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <Input id="edit-email" value={editForm.email} disabled className="bg-muted/50" />
                  </div>
                  <p className="text-xs text-muted-foreground">Email cannot be changed from here</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">Contact Number</Label>
                  <Input
                    id="edit-phone"
                    type="tel"
                    placeholder="+1 868 555 1234"
                    value={editForm.contact_number}
                    onChange={e => updateField('contact_number', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select value={editForm.role} onValueChange={v => updateField('role', v ?? 'retail_customer')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="retail_customer">Retail Customer</SelectItem>
                      <SelectItem value="wholesale_customer">Wholesale Customer</SelectItem>
                      <SelectItem value="salesman">Salesman</SelectItem>
                      <SelectItem value="administrator">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Properties */}
              <div className="rounded-lg border p-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Properties ({viewingUser.properties?.length || 0})
                  </p>
                </div>
                {viewingUser.properties && viewingUser.properties.length > 0 ? (
                  <div className="space-y-2">
                    {viewingUser.properties.map(p => (
                      <Link
                        key={p.id}
                        href={`/properties/${p.id}`}
                        className="flex items-start gap-2 rounded-md p-2 transition-colors hover:bg-accent"
                      >
                        <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 text-sm">
                          <p className="font-medium">{p.name}</p>
                          {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No properties yet.</p>
                )}
              </div>

              {/* Quotes */}
              <div className="rounded-lg border p-4">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                  Quotes ({viewingUser.quotes?.length || 0})
                </p>
                {viewingUser.quotes && viewingUser.quotes.length > 0 ? (
                  <div className="space-y-2">
                    {viewingUser.quotes.slice(0, 5).map(q => (
                      <Link
                        key={q.id}
                        href={`/quotes/${q.id}`}
                        className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-accent"
                      >
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <div className="text-sm">
                            <p className="font-medium">#{q.id.slice(0, 8)}</p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(q.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm font-semibold">${Number(q.total_ttd).toFixed(2)} TTD</p>
                      </Link>
                    ))}
                    {viewingUser.quotes.length > 5 && (
                      <p className="pt-2 text-center text-xs text-muted-foreground">
                        + {viewingUser.quotes.length - 5} more
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No quotes yet.</p>
                )}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setViewingUser(null)}
                  className="flex-1"
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={saveUser}
                  disabled={loading || !isDirty}
                  className="flex-1"
                >
                  {loading ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
