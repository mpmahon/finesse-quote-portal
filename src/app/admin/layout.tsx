import { ShellLayout } from '@/components/layout/shell-layout'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <ShellLayout allowRoles={['administrator']}>{children}</ShellLayout>
}
