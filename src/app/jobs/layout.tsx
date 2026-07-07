import { ShellLayout } from '@/components/layout/shell-layout'

export default function JobsLayout({ children }: { children: React.ReactNode }) {
  return <ShellLayout allowRoles={['salesman', 'administrator']}>{children}</ShellLayout>
}
