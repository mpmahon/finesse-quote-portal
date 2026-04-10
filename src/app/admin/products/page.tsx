import { createClient } from '@/lib/supabase/server'
import { ProductManager } from '@/components/admin/product-manager'

export default async function AdminProductsPage() {
  const supabase = await createClient()

  const { data: products } = await supabase
    .from('products')
    .select('*, components(*)')
    .order('make')

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Product Management</h1>
      <ProductManager products={products || []} />
    </div>
  )
}
