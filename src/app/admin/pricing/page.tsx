import { createClient } from '@/lib/supabase/server'
import { PricingEditor } from '@/components/admin/pricing-editor'

export default async function AdminPricingPage() {
  const supabase = await createClient()

  const { data: config } = await supabase
    .from('pricing_config')
    .select('*')
    .eq('id', 1)
    .single()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Pricing Configuration</h1>
      {config && <PricingEditor config={config} />}
    </div>
  )
}
