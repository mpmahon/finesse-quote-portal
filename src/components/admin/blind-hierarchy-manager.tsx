'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { BlindHierarchyLevel } from '@/components/admin/blind-hierarchy-level'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import { opacitiesForType, stylesForOpacity, coloursForStyle, valancesForType } from '@/lib/blind-hierarchy'

interface BlindHierarchyManagerProps {
  /** Full hierarchy including inactive nodes — admins need to see and reactivate deactivated options. */
  hierarchy: BlindHierarchy
}

/**
 * Blind option hierarchy admin editor (Batch 7): a Type -> Opacity -> Style
 * -> Colour drill-down (click a row to descend a level) plus a parallel
 * per-Type Valance/Finisher list. Mike hand-enters all the TBD ranges here
 * (mostly Styles for Sliding Panel/Roller Shade/Neolux, and every Colour)
 * without developer involvement — each level shows an empty-state hint
 * rather than blocking navigation when its list is empty.
 *
 * Each level's CRUD (add/rename/deactivate/delete/reorder, audit-logged) is
 * delegated to {@link BlindHierarchyLevel}; this component only owns the
 * drill-down selection state and slices the full hierarchy per level.
 */
export function BlindHierarchyManager({ hierarchy }: BlindHierarchyManagerProps) {
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [selectedOpacityId, setSelectedOpacityId] = useState<string | null>(null)
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null)

  const selectedType = hierarchy.types.find(t => t.id === selectedTypeId) ?? null
  const selectedOpacity = hierarchy.opacities.find(o => o.id === selectedOpacityId) ?? null
  const selectedStyle = hierarchy.styles.find(s => s.id === selectedStyleId) ?? null

  // Stale-selection safety: `selectedType`/`selectedOpacity`/`selectedStyle`
  // above are derived via `.find()`, so if a selected id no longer exists in
  // a freshly reloaded hierarchy (deleted — the normal path is the
  // `onDeleted` callbacks below, which clear the id synchronously at delete
  // time) the derived node is simply `null` and every `{selectedX && ...}`
  // block below it stops rendering on its own — no extra effect needed.

  return (
    <div className="space-y-6">
      {/* Breadcrumb of the current drill-down path */}
      {selectedType && (
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <button className="hover:text-foreground hover:underline" onClick={() => { setSelectedTypeId(null); setSelectedOpacityId(null); setSelectedStyleId(null) }}>
            All Types
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <button
            className="hover:text-foreground hover:underline"
            onClick={() => { setSelectedOpacityId(null); setSelectedStyleId(null) }}
          >
            {selectedType.name}
          </button>
          {selectedOpacity && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <button className="hover:text-foreground hover:underline" onClick={() => setSelectedStyleId(null)}>
                {selectedOpacity.name}
              </button>
            </>
          )}
          {selectedStyle && (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span>{selectedStyle.name}</span>
            </>
          )}
        </div>
      )}

      <BlindHierarchyLevel
        title="Blind Types"
        items={hierarchy.types}
        table="blind_types"
        scopeFields={{}}
        selectable
        selectedId={selectedTypeId}
        onSelect={id => { setSelectedTypeId(id); setSelectedOpacityId(null); setSelectedStyleId(null) }}
        onDeleted={id => { if (id === selectedTypeId) { setSelectedTypeId(null); setSelectedOpacityId(null); setSelectedStyleId(null) } }}
        emptyHint="No blind types yet. Add the first."
        deleteWarning="This also deletes every Opacity, Style, Colour, and Valance under it."
      />

      {selectedType && (
        <div className="grid gap-6 md:grid-cols-2">
          <BlindHierarchyLevel
            title={`Opacities — ${selectedType.name}`}
            items={opacitiesForType(hierarchy, selectedType.id)}
            table="blind_opacities"
            scopeFields={{ type_id: selectedType.id }}
            selectable
            selectedId={selectedOpacityId}
            onSelect={id => { setSelectedOpacityId(id); setSelectedStyleId(null) }}
            onDeleted={id => { if (id === selectedOpacityId) { setSelectedOpacityId(null); setSelectedStyleId(null) } }}
            emptyHint="No opacities yet for this type — add the first."
            deleteWarning="This also deletes every Style and Colour under it."
          />
          <BlindHierarchyLevel
            title={`Valance / Finisher — ${selectedType.name}`}
            items={valancesForType(hierarchy, selectedType.id)}
            table="blind_valances"
            scopeFields={{ type_id: selectedType.id }}
            emptyHint="No valance options yet for this type — add the first."
          />
        </div>
      )}

      {selectedOpacity && (
        <BlindHierarchyLevel
          title={`Styles — ${selectedType?.name} / ${selectedOpacity.name}`}
          items={stylesForOpacity(hierarchy, selectedOpacity.id)}
          table="blind_styles"
          scopeFields={{ opacity_id: selectedOpacity.id }}
          selectable
          selectedId={selectedStyleId}
          onSelect={id => setSelectedStyleId(id)}
          onDeleted={id => { if (id === selectedStyleId) setSelectedStyleId(null) }}
          emptyHint="No styles yet for this opacity — add the first."
          deleteWarning="This also deletes every Colour under it."
        />
      )}

      {selectedStyle && (
        <BlindHierarchyLevel
          title={`Colours — ${selectedType?.name} / ${selectedOpacity?.name} / ${selectedStyle.name}`}
          items={coloursForStyle(hierarchy, selectedStyle.id)}
          table="blind_colours"
          scopeFields={{ style_id: selectedStyle.id }}
          showHex
          emptyHint="No colours yet for this style — add the first."
        />
      )}
    </div>
  )
}
