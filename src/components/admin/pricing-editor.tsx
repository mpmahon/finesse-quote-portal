'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { PricingConfig } from '@/types/database'

export function PricingEditor({ config }: { config: PricingConfig }) {
  const [form, setForm] = useState({
    exchange_rate: String(config.exchange_rate),
    reseller_discount_pct: String(config.reseller_discount_pct),
    default_markup_pct: String(config.default_markup_pct),
    retail_markup_pct: String(config.retail_markup_pct),
    wholesale_markup_pct: String(config.wholesale_markup_pct),
    labor_cost_ttd: String(config.labor_cost_ttd),
    installation_cost_ttd: String(config.installation_cost_ttd),
    duty_percent: String(config.duty_percent),
    shipping_fee_ttd: String(config.shipping_fee_ttd),
    max_window_width_in: String(config.max_window_width_in),
    max_window_height_in: String(config.max_window_height_in),
    min_window_size_in: String(config.min_window_size_in),
    quote_validity_days: String(config.quote_validity_days),
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSave() {
    setLoading(true)
    const supabase = createClient()
    const data = {
      exchange_rate: parseFloat(form.exchange_rate),
      reseller_discount_pct: parseFloat(form.reseller_discount_pct),
      default_markup_pct: parseFloat(form.default_markup_pct),
      retail_markup_pct: parseFloat(form.retail_markup_pct),
      wholesale_markup_pct: parseFloat(form.wholesale_markup_pct),
      labor_cost_ttd: parseFloat(form.labor_cost_ttd),
      installation_cost_ttd: parseFloat(form.installation_cost_ttd),
      duty_percent: parseFloat(form.duty_percent),
      shipping_fee_ttd: parseFloat(form.shipping_fee_ttd),
      max_window_width_in: parseFloat(form.max_window_width_in),
      max_window_height_in: parseFloat(form.max_window_height_in),
      min_window_size_in: parseFloat(form.min_window_size_in),
      quote_validity_days: parseInt(form.quote_validity_days),
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('pricing_config').update(data).eq('id', 1)
    if (error) { toast.error(error.message); setLoading(false); return }

    // Write audit log
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action_type: 'pricing_update',
        target_table: 'pricing_config',
        change_summary: data,
      })
    }

    toast.success('Pricing config updated')
    setLoading(false)
    router.refresh()
  }

  const fields = [
    { key: 'retail_markup_pct', label: 'Retail Markup (%)', step: '0.1' },
    { key: 'wholesale_markup_pct', label: 'Wholesale Markup (%)', step: '0.1' },
    { key: 'exchange_rate', label: 'Exchange Rate (USD to TTD)', step: '0.01' },
    { key: 'labor_cost_ttd', label: 'Labor Cost per Window (TTD)', step: '0.01' },
    { key: 'installation_cost_ttd', label: 'Installation Cost per Window (TTD)', step: '0.01' },
    { key: 'duty_percent', label: 'Duty (%) — Purchasing only', step: '0.1' },
    { key: 'shipping_fee_ttd', label: 'Shipping Fee (TTD) — Purchasing only', step: '0.01' },
    { key: 'max_window_width_in', label: 'Max Window Width (inches)', step: '1' },
    { key: 'max_window_height_in', label: 'Max Window Height (inches)', step: '1' },
    { key: 'min_window_size_in', label: 'Min Window Size (inches)', step: '0.5' },
    { key: 'quote_validity_days', label: 'Quote Validity (days)', step: '1' },
    // Legacy fields kept for back-compat with earlier engine versions; the
    // Batch 4 quote-engine rewrite will remove them entirely.
    { key: 'default_markup_pct', label: 'Default Markup — legacy (%)', step: '0.1' },
    { key: 'reseller_discount_pct', label: 'Reseller Discount — legacy (%)', step: '0.1' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global Pricing Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map(f => (
            <div key={f.key} className="space-y-2">
              <Label>{f.label}</Label>
              <Input
                type="number"
                step={f.step}
                value={form[f.key as keyof typeof form]}
                onChange={e => update(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <Button onClick={handleSave} className="mt-6 w-full" disabled={loading}>
          {loading ? 'Saving...' : 'Save Configuration'}
        </Button>
      </CardContent>
    </Card>
  )
}
