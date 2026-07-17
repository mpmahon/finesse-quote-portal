'use client'

import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { opacitiesForType, stylesForOpacity, coloursForStyle, type BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct } from '@/types/database'
import type { SupplierLinkTargetType } from '@/lib/supplier-links'

/** Controlled value shape for {@link SupplierTargetPicker} — a single Finesse allocation target expressed as a cascading path. */
export interface TargetPickerValue {
  targetType: SupplierLinkTargetType
  typeId: string
  opacityId: string
  styleId: string
  colourId: string
  awningProductId: string
}

export const BLANK_TARGET: TargetPickerValue = {
  targetType: 'style',
  typeId: '',
  opacityId: '',
  styleId: '',
  colourId: '',
  awningProductId: '',
}

interface SupplierTargetPickerProps {
  hierarchy: BlindHierarchy
  awningProducts: AwningProduct[]
  value: TargetPickerValue
  onChange: (value: TargetPickerValue) => void
  disabled?: boolean
}

/**
 * Shared cascading picker for a supplier allocation target: Style vs Colour
 * vs Awning Product, then Type → Opacity → Style(→ Colour) drill-down for
 * the blind hierarchy, or a flat Make/Model list for awnings. Used by both
 * the allocation add/edit form ({@link SupplierLinkManager}) and the reverse
 * Sourcing Lookup ({@link SupplierAllocationLookup}) so the two stay in
 * sync. Every `<SelectValue>` below is given an explicit id→label render
 * function — never the raw option value — so a UUID can never leak into the
 * UI (a bug that has recurred in this codebase's Base UI Select usage).
 */
export function SupplierTargetPicker({ hierarchy, awningProducts, value, onChange, disabled }: SupplierTargetPickerProps) {
  const opacities = opacitiesForType(hierarchy, value.typeId)
  const styles = stylesForOpacity(hierarchy, value.opacityId)
  const colours = coloursForStyle(hierarchy, value.styleId)

  function setTargetType(targetType: SupplierLinkTargetType) {
    onChange({ ...BLANK_TARGET, targetType })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(['style', 'colour', 'awning'] as const).map(t => (
          <Button
            key={t}
            type="button"
            size="sm"
            variant={value.targetType === t ? 'default' : 'outline'}
            className={cn('flex-1 capitalize')}
            onClick={() => setTargetType(t)}
            disabled={disabled}
          >
            {t === 'awning' ? 'Awning Product' : t}
          </Button>
        ))}
      </div>

      {(value.targetType === 'style' || value.targetType === 'colour') && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select
              value={value.typeId || undefined}
              onValueChange={v => onChange({ ...value, typeId: v ?? '', opacityId: '', styleId: '', colourId: '' })}
              disabled={disabled}
            >
              <SelectTrigger className="w-full"><SelectValue>{(v: string) => hierarchy.types.find(t => t.id === v)?.name ?? 'Select type'}</SelectValue></SelectTrigger>
              <SelectContent>
                {hierarchy.types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Opacity</Label>
            <Select
              value={value.opacityId || undefined}
              onValueChange={v => onChange({ ...value, opacityId: v ?? '', styleId: '', colourId: '' })}
              disabled={disabled || !value.typeId}
            >
              <SelectTrigger className="w-full"><SelectValue>{(v: string) => opacities.find(o => o.id === v)?.name ?? 'Select opacity'}</SelectValue></SelectTrigger>
              <SelectContent>
                {opacities.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Style</Label>
            <Select
              value={value.styleId || undefined}
              onValueChange={v => onChange({ ...value, styleId: v ?? '', colourId: '' })}
              disabled={disabled || !value.opacityId}
            >
              <SelectTrigger className="w-full"><SelectValue>{(v: string) => styles.find(s => s.id === v)?.name ?? 'Select style'}</SelectValue></SelectTrigger>
              <SelectContent>
                {styles.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {value.targetType === 'colour' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Colour</Label>
          <Select
            value={value.colourId || undefined}
            onValueChange={v => onChange({ ...value, colourId: v ?? '' })}
            disabled={disabled || !value.styleId}
          >
            <SelectTrigger className="w-full"><SelectValue>{(v: string) => colours.find(c => c.id === v)?.name ?? 'Select colour'}</SelectValue></SelectTrigger>
            <SelectContent>
              {colours.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.targetType === 'awning' && (
        <div className="space-y-1.5">
          <Label className="text-xs">Awning Product</Label>
          <Select
            value={value.awningProductId || undefined}
            onValueChange={v => onChange({ ...value, awningProductId: v ?? '' })}
            disabled={disabled}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {(v: string) => {
                  const p = awningProducts.find(a => a.id === v)
                  return p ? `${p.make} ${p.model}` : 'Select awning product'
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {awningProducts.map(a => <SelectItem key={a.id} value={a.id}>{a.make} {a.model}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  )
}

/** Derives the `{blind_style_id, blind_colour_id, awning_product_id}` FK triple to write from a picker value — exactly one non-null, matching the DB's `supplier_links_one_target` check. Returns nulls for an incomplete selection (caller validates before save). */
export function resolveTargetIds(value: TargetPickerValue): {
  blind_style_id: string | null
  blind_colour_id: string | null
  awning_product_id: string | null
} {
  return {
    blind_style_id: value.targetType === 'style' ? (value.styleId || null) : null,
    blind_colour_id: value.targetType === 'colour' ? (value.colourId || null) : null,
    awning_product_id: value.targetType === 'awning' ? (value.awningProductId || null) : null,
  }
}

/** True when the picker's current selection resolves to a complete, savable target. */
export function isTargetComplete(value: TargetPickerValue): boolean {
  if (value.targetType === 'style') return !!value.styleId
  if (value.targetType === 'colour') return !!value.colourId
  return !!value.awningProductId
}
