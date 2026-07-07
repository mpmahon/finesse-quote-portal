'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { pricingConfigSchema, type PricingConfigInput } from '@/lib/validators'
import type { PricingConfig } from '@/types/database'

interface FieldDef {
  key: keyof PricingConfigInput
  label: string
  step: string
}

const FIELDS: FieldDef[] = [
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
]

/**
 * Global pricing settings editor (admin only).
 *
 * WS1 §5.3: validated by `pricingConfigSchema` via react-hook-form —
 * empty or non-numeric fields fail validation instead of writing NaN to
 * the database. Legacy default_markup_pct / reseller_discount_pct are gone
 * (migration 00009).
 */
export function PricingEditor({ config }: { config: PricingConfig }) {
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PricingConfigInput>({
    resolver: zodResolver(pricingConfigSchema),
    defaultValues: {
      exchange_rate: Number(config.exchange_rate),
      retail_markup_pct: Number(config.retail_markup_pct),
      wholesale_markup_pct: Number(config.wholesale_markup_pct),
      labor_cost_ttd: Number(config.labor_cost_ttd),
      installation_cost_ttd: Number(config.installation_cost_ttd),
      duty_percent: Number(config.duty_percent),
      shipping_fee_ttd: Number(config.shipping_fee_ttd),
      max_window_width_in: Number(config.max_window_width_in),
      max_window_height_in: Number(config.max_window_height_in),
      min_window_size_in: Number(config.min_window_size_in),
      quote_validity_days: Number(config.quote_validity_days),
    },
  })

  async function onSubmit(values: PricingConfigInput) {
    const supabase = createClient()
    const data = { ...values, updated_at: new Date().toISOString() }

    const { error } = await supabase.from('pricing_config').update(data).eq('id', 1)
    if (error) { toast.error(error.message); return }

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
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Global Pricing Settings</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map(f => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={`pricing-${f.key}`}>{f.label}</Label>
                <Input
                  id={`pricing-${f.key}`}
                  type="number"
                  step={f.step}
                  aria-invalid={!!errors[f.key]}
                  {...register(f.key, { valueAsNumber: true })}
                />
                {errors[f.key] && (
                  <p className="text-xs text-destructive">{errors[f.key]?.message as string}</p>
                )}
              </div>
            ))}
          </div>
          <Button type="submit" className="mt-6 w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save Configuration'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
