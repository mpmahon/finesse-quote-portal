import { createClient } from '@/lib/supabase/server'
import { SupplierManager } from '@/components/admin/supplier-manager'
import { fetchBlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Supplier, SupplierLink, SupplierProduct } from '@/types/database'

/**
 * Supplier Administration (00021 supplier catalogue layer + 00022 cost/
 * allocation columns). Server-fetches suppliers, their catalogue lines
 * (with procurement cost), every `supplier_links` allocation row, the full
 * blind hierarchy (incl. inactive nodes — a since-deactivated style can
 * still need its allocation reviewed, same convention as Blind Management),
 * and awning products, then hands everything to the client-side
 * `SupplierManager` for drill-down CRUD and allocation. STAFF-ONLY data
 * (RLS gates `suppliers`/`supplier_products`/`supplier_links` to
 * administrator/salesman) rendered on an administrator-only route (see
 * admin/layout.tsx).
 */
export default async function AdminSuppliersPage() {
  const supabase = await createClient()

  const [
    { data: suppliers },
    { data: supplierProducts },
    { data: supplierLinks },
    { data: awningProducts },
    hierarchy,
  ] = await Promise.all([
    supabase.from('suppliers').select('*').order('name'),
    supabase.from('supplier_products').select('*').order('name'),
    supabase.from('supplier_links').select('*'),
    supabase.from('awning_products').select('*').order('make').order('model'),
    fetchBlindHierarchy(supabase, { activeOnly: false }),
  ])

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Suppliers</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Manage supplier catalogues, procurement costs, and how each supplier item maps onto the Finesse
        blind styles, colours, and awning products it fulfils. This data is internal only — customers never
        see supplier identity or cost, and none of it feeds customer-facing quote pricing.
      </p>
      <SupplierManager
        suppliers={(suppliers ?? []) as Supplier[]}
        supplierProducts={(supplierProducts ?? []) as SupplierProduct[]}
        supplierLinks={(supplierLinks ?? []) as SupplierLink[]}
        awningProducts={(awningProducts ?? []) as AwningProduct[]}
        hierarchy={hierarchy}
      />
    </div>
  )
}
