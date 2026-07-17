import { redirect } from 'next/navigation'

/**
 * The standalone admin "Overview" page is retired (Phase 1 UX redesign,
 * 2026-07-16 audit §"quick wins") — its KPIs are superseded by the main
 * dashboard's role-aware `AdminDashboard` (action queue + KPI strip), so
 * `/admin` now just forwards there instead of maintaining a second,
 * divergent summary view.
 */
export default function AdminIndexPage() {
  redirect('/dashboard')
}
