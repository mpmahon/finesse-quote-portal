import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { format } from 'date-fns'
import { lineItemTtd } from '@/lib/quote-engine'
import type { QuoteLineItem, QuoteNote } from '@/types/database'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 2 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { color: '#666' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 4, paddingHorizontal: 4, fontWeight: 'bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee', fontSize: 8 },
  colWindow: { width: '30%' },
  colType: { width: '15%' },
  colDetails: { width: '20%' },
  colDims: { width: '15%', textAlign: 'right' },
  colPrice: { width: '20%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, fontWeight: 'bold', borderTopWidth: 1, borderTopColor: '#333' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
  grandTotal: { fontSize: 16, fontWeight: 'bold', marginTop: 12, textAlign: 'right' },
  footnote: { fontSize: 6.5, color: '#999', fontStyle: 'italic' },
})

/** Extended line item that may carry the window's excluded_components from the joined query. */
interface LineItemWithExclusions extends QuoteLineItem {
  windows?: { excluded_components: string[] } | null
}

interface QuotePDFProps {
  quote: {
    id: string
    created_at: string
    expires_at: string | null
    exchange_rate: number
    markup_percent: number
    total_ttd: number
    labor_cost_ttd: number
    installation_cost_ttd: number
    notes: QuoteNote[]
    properties: { name: string; address: string | null } | null
  }
  lineItems: LineItemWithExclusions[]
  profile: { first_name: string; last_name: string; email: string }
}

/** Pretty-print a component name: underscore → space, title-case. */
function formatName(n: string): string {
  return n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Customer-facing quote PDF.
 *
 * Batch 4: per-component USD columns replaced with a single TTD price per
 * window. The customer sees window name, type, shade details, dimensions,
 * and price. No component breakdown, no markup %, no exchange rate.
 */
export function QuotePDF({ quote, lineItems, profile }: QuotePDFProps) {
  const markupPct = Number(quote.markup_percent)
  const exchangeRate = Number(quote.exchange_rate)
  const laborTtd = Number(quote.labor_cost_ttd)
  const installPerWindow = Number(quote.installation_cost_ttd)

  const byRoom: Record<string, LineItemWithExclusions[]> = {}
  for (const item of lineItems) {
    if (!byRoom[item.room_name]) byRoom[item.room_name] = []
    byRoom[item.room_name].push(item)
  }

  const priceableCount = lineItems.filter(li => li.line_type !== 'zero').length

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>FINESSE</Text>
          <Text style={styles.subtitle}>Blinds &amp; Awnings Quote</Text>
        </View>

        {/* Quote Info */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Customer</Text>
            <Text>{profile.first_name} {profile.last_name}</Text>
            <Text style={{ color: '#666' }}>{profile.email}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontWeight: 'bold', marginBottom: 4 }}>Quote #{quote.id.slice(0, 8)}</Text>
            <Text>Date: {format(new Date(quote.created_at), 'MMM d, yyyy')}</Text>
            {quote.expires_at && <Text>Expires: {format(new Date(quote.expires_at), 'MMM d, yyyy')}</Text>}
          </View>
        </View>

        {quote.properties && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontWeight: 'bold' }}>Property: {quote.properties.name}</Text>
            {quote.properties.address && <Text style={{ color: '#666' }}>{quote.properties.address}</Text>}
          </View>
        )}

        {/* Per Room Tables */}
        {Object.entries(byRoom).map(([roomName, items]) => {
          const roomTotalTtd = items.reduce((sum, item) => {
            if (item.line_type === 'zero') return sum
            return sum + lineItemTtd(Number(item.line_total_usd), markupPct, exchangeRate, laborTtd)
          }, 0)

          return (
            <View key={roomName} wrap={false}>
              <Text style={styles.sectionTitle}>{roomName}</Text>
              <View style={styles.tableHeader}>
                <Text style={styles.colWindow}>Window</Text>
                <Text style={styles.colType}>Type</Text>
                <Text style={styles.colDetails}>Details</Text>
                <Text style={styles.colDims}>Dimensions</Text>
                <Text style={styles.colPrice}>Price (TTD)</Text>
              </View>
              {items.map(item => {
                const isZero = item.line_type === 'zero'
                const isAwning = item.line_type === 'awning'
                const typeLabel = isZero ? '' : isAwning ? 'Awning' : 'Blind'
                const windowTtd = isZero
                  ? 0
                  : lineItemTtd(Number(item.line_total_usd), markupPct, exchangeRate, laborTtd)
                const excluded = item.windows?.excluded_components ?? []

                return (
                  <View key={item.id}>
                    <View style={styles.tableRow}>
                      <View style={styles.colWindow}>
                        <Text>{item.window_name}</Text>
                        {excluded.length > 0 && (
                          <Text style={styles.footnote}>
                            {excluded.map(formatName).join(', ')} not included
                          </Text>
                        )}
                      </View>
                      <Text style={styles.colType}>{isZero ? '—' : typeLabel}</Text>
                      <Text style={styles.colDetails}>
                        {isZero
                          ? 'No blind/awning'
                          : [item.shade_type, item.colour].filter(Boolean).join(' / ')
                        }
                      </Text>
                      <Text style={styles.colDims}>
                        {Number(item.blind_width)}&quot;x{Number(item.blind_height)}&quot;
                      </Text>
                      <Text style={styles.colPrice}>
                        {isZero ? '—' : `$${windowTtd.toFixed(2)}`}
                      </Text>
                    </View>
                  </View>
                )
              })}
              <View style={styles.totalRow}>
                <Text style={styles.colWindow}>Room Subtotal</Text>
                <Text style={[styles.colPrice, { width: '70%', textAlign: 'right' }]}>
                  TTD ${roomTotalTtd.toFixed(2)}
                </Text>
              </View>
            </View>
          )
        })}

        {/* Totals */}
        <Text style={styles.sectionTitle}>Quote Totals</Text>
        {installPerWindow > 0 && priceableCount > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>Installation ({priceableCount} window{priceableCount === 1 ? '' : 's'})</Text>
            <Text>TTD ${(installPerWindow * priceableCount).toFixed(2)}</Text>
          </View>
        )}
        <Text style={styles.grandTotal}>Grand Total: TTD ${Number(quote.total_ttd).toFixed(2)}</Text>

        {/* Notes — only those flagged show_on_pdf */}
        {(() => {
          const pdfNotes = (quote.notes ?? []).filter(n => n.show_on_pdf && n.text.trim())
          if (pdfNotes.length === 0) return null
          return (
            <View wrap={false}>
              <Text style={styles.sectionTitle}>Notes</Text>
              {pdfNotes.map((note, idx) => (
                <View key={note.id || idx} style={{ marginBottom: 4 }}>
                  <Text style={{ fontSize: 9, color: '#333' }}>• {note.text}</Text>
                </View>
              ))}
            </View>
          )
        })()}

        {/* Footer */}
        <Text style={styles.footer}>
          Prices valid for 14 days. All prices in Trinidad &amp; Tobago Dollars (TTD).
        </Text>
      </Page>
    </Document>
  )
}
