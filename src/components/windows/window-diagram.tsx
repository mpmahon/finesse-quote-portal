import type { MountType } from '@/types/database'

interface WindowDiagramProps {
  widthInches: number
  heightInches: number
  mountType: MountType
  /** Blind fabric colour — any CSS colour. Defaults to a neutral shade. */
  blindColour?: string | null
  /** Blind coverage 0–1: how far the blind is drawn down. Default 0.72. */
  drop?: number
  /** Show a blind overlay at all (false for windows with no blind). */
  showBlind?: boolean
  className?: string
}

/**
 * Parametric window + blind diagram (WS3 §8.3).
 *
 * Draws the window opening to scale with the blind overlaid in the selected
 * colour. Inside mount renders the blind within the reveal; outside mount
 * renders it overlapping the frame (+6" width, header above the opening).
 * Pure SVG — reusable on the configurator, quote detail, and job pages.
 */
export function WindowDiagram({
  widthInches,
  heightInches,
  mountType,
  blindColour,
  drop = 0.72,
  showBlind = true,
  className,
}: WindowDiagramProps) {
  const w = Math.max(1, Number(widthInches) || 1)
  const h = Math.max(1, Number(heightInches) || 1)

  // Fit the window into a 240×220 viewport area, leaving margin for labels
  // and the outside-mount overhang.
  const maxW = 240
  const maxH = 210
  const scale = Math.min(maxW / w, maxH / h)
  const winW = w * scale
  const winH = h * scale

  const viewW = 340
  const viewH = 300
  const originX = (viewW - winW) / 2
  const originY = 52

  const wallColor = 'var(--muted, #f1f5f9)'
  const frameColor = '#94a3b8'
  const glassColor = '#dbeafe'
  const fabric = blindColour || '#cbd5e1'

  // Blind geometry. Outside mount: +6" width (3" each side), cassette sits
  // above the opening. Inside mount: exact width, cassette inside the reveal.
  const overhang = mountType === 'outside' ? 3 * scale : 0
  const blindX = originX - overhang
  const blindW = winW + overhang * 2
  const cassetteH = 12
  const cassetteY = mountType === 'outside' ? originY - cassetteH : originY
  const fabricTop = cassetteY + cassetteH
  const fabricLen = Math.max(8, (originY + winH - fabricTop) * Math.min(1, Math.max(0.1, drop)))

  const frame = 6
  const mullion = 2

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      role="img"
      aria-label={`${mountType === 'inside' ? 'Inside' : 'Outside'} mount window, ${w} by ${h} inches`}
      className={className}
    >
      {/* Wall */}
      <rect x={0} y={0} width={viewW} height={viewH} fill={wallColor} rx={8} />

      {/* Window frame + glass */}
      <rect x={originX - frame} y={originY - frame} width={winW + frame * 2} height={winH + frame * 2} fill={frameColor} rx={2} />
      <rect x={originX} y={originY} width={winW} height={winH} fill={glassColor} />
      {/* Mullions (cross bars) */}
      <rect x={originX + winW / 2 - mullion / 2} y={originY} width={mullion} height={winH} fill={frameColor} opacity={0.7} />
      <rect x={originX} y={originY + winH / 2 - mullion / 2} width={winW} height={mullion} fill={frameColor} opacity={0.7} />

      {showBlind && (
        <g>
          {/* Cassette / header */}
          <rect x={blindX} y={cassetteY} width={blindW} height={cassetteH} fill="#475569" rx={3} />
          {/* Fabric */}
          <rect x={blindX} y={fabricTop} width={blindW} height={fabricLen} fill={fabric} opacity={0.92} />
          {/* Fabric shading stripes for depth */}
          <rect x={blindX} y={fabricTop} width={blindW} height={3} fill="#000" opacity={0.08} />
          {/* Bottom rail */}
          <rect x={blindX} y={fabricTop + fabricLen - 4} width={blindW} height={5} fill="#475569" rx={2} />
          {/* Chain on the right */}
          <line
            x1={blindX + blindW - 6}
            y1={fabricTop + fabricLen}
            x2={blindX + blindW - 6}
            y2={Math.min(fabricTop + fabricLen + 40, viewH - 34)}
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="2 3"
          />
        </g>
      )}

      {/* Width dimension */}
      <g stroke="#64748b" strokeWidth={1} fill="none">
        <line x1={originX} y1={originY + winH + 18} x2={originX + winW} y2={originY + winH + 18} />
        <line x1={originX} y1={originY + winH + 13} x2={originX} y2={originY + winH + 23} />
        <line x1={originX + winW} y1={originY + winH + 13} x2={originX + winW} y2={originY + winH + 23} />
      </g>
      <text x={originX + winW / 2} y={originY + winH + 34} textAnchor="middle" fontSize={12} fill="#475569" fontFamily="ui-sans-serif, system-ui">
        {w}&quot;
      </text>

      {/* Height dimension */}
      <g stroke="#64748b" strokeWidth={1} fill="none">
        <line x1={originX - 20} y1={originY} x2={originX - 20} y2={originY + winH} />
        <line x1={originX - 25} y1={originY} x2={originX - 15} y2={originY} />
        <line x1={originX - 25} y1={originY + winH} x2={originX - 15} y2={originY + winH} />
      </g>
      <text
        x={originX - 28}
        y={originY + winH / 2}
        textAnchor="middle"
        fontSize={12}
        fill="#475569"
        fontFamily="ui-sans-serif, system-ui"
        transform={`rotate(-90 ${originX - 28} ${originY + winH / 2})`}
      >
        {h}&quot;
      </text>

      {/* Mount label */}
      <text x={viewW / 2} y={20} textAnchor="middle" fontSize={11} fill="#64748b" fontFamily="ui-sans-serif, system-ui">
        {mountType === 'inside' ? 'Inside mount — blind sits within the reveal' : 'Outside mount — blind overlaps the frame (+6")'}
      </text>
    </svg>
  )
}
