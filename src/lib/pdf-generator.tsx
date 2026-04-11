import React from 'react'
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import { format } from 'date-fns'
import type { QuoteLineItem } from '@/types/database'

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: 'Helvetica' },
  header: { marginBottom: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 12, color: '#666', marginBottom: 2 },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', marginTop: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: '#ddd', paddingBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { color: '#666' },
  value: { fontWeight: 'bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f0f0f0', paddingVertical: 4, paddingHorizontal: 4, fontWeight: 'bold', fontSize: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 4, borderBottomWidth: 0.5, borderBottomColor: '#eee', fontSize: 8 },
  col1: { width: '20%' },
  col2: { width: '12%', textAlign: 'right' },
  col3: { width: '12%', textAlign: 'right' },
  col4: { width: '10%', textAlign: 'right' },
  col5: { width: '10%', textAlign: 'right' },
  col6: { width: '12%', textAlign: 'right' },
  col7: { width: '10%', textAlign: 'right' },
  col8: { width: '14%', textAlign: 'right' },
  totalRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, fontWeight: 'bold', borderTopWidth: 1, borderTopColor: '#333' },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#999', textAlign: 'center' },
  grandTotal: { fontSize: 16, fontWeight: 'bold', marginTop: 12, textAlign: 'right' },
})

interface QuotePDFProps {
  quote: {
    id: string
    created_at: string
    expires_at: string | null
    exchange_rate: number
    markup_percent: number
    duty_percent: number
    discount_percent: number
    subtotal_usd: number
    total_ttd: number
    shipping_fee_ttd: number
    labor_cost_ttd: number
    installation_cost_ttd: number
    properties: { name: string; address: string | null } | null
  }
  lineItems: QuoteLineItem[]
  profile: { first_name: string; last_name: string; email: string }
}

export function QuotePDF({ quote, lineItems, profile }: QuotePDFProps) {
  const byRoom: Record<string, QuoteLineItem[]> = {}
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
        {Object.entries(byRoom).map(([roomName, items]) => (
          <View key={roomName} wrap={false}>
            <Text style={styles.sectionTitle}>{roomName}</Text>
            <View style={styles.tableHeader}>
              <Text style={styles.col1}>Window</Text>
              <Text style={styles.col2}>Cassette</Text>
              <Text style={styles.col3}>Tube</Text>
              <Text style={styles.col4}>Rail</Text>
              <Text style={styles.col5}>Chain</Text>
              <Text style={styles.col6}>Fabric</Text>
              <Text style={styles.col7}>Fixed</Text>
              <Text style={styles.col8}>Total (USD)</Text>
            </View>
            {items.map(item => {
              const isZero = item.line_type === 'zero'
              const isAwning = item.line_type === 'awning'
              const typeLabel = isZero ? ' (no blind/awning)' : isAwning ? ' [awning]' : ''
              return (
                <View key={item.id} style={styles.tableRow}>
                  <Text style={styles.col1}>
                    {item.window_name}
                    {typeLabel && <Text style={{ color: '#999' }}>{typeLabel}</Text>}
                  </Text>
                  <Text style={styles.col2}>{isZero ? '—' : `$${Number(item.cassette_cost).toFixed(2)}`}</Text>
                  <Text style={styles.col3}>{isZero ? '—' : isAwning ? '—' : `$${Number(item.tube_cost).toFixed(2)}`}</Text>
                  <Text style={styles.col4}>{isZero ? '—' : isAwning ? '—' : `$${Number(item.bottom_rail_cost).toFixed(2)}`}</Text>
                  <Text style={styles.col5}>{isZero ? '—' : isAwning ? '—' : `$${Number(item.chain_cost).toFixed(2)}`}</Text>
                  <Text style={styles.col6}>{isZero ? '—' : `$${Number(item.fabric_cost).toFixed(2)}`}</Text>
                  <Text style={styles.col7}>{isZero ? '—' : `$${Number(item.fixed_costs).toFixed(2)}`}</Text>
                  <Text style={styles.col8}>${Number(item.line_total_usd).toFixed(2)}</Text>
                </View>
              )
            })}
            <View style={styles.totalRow}>
              <Text style={styles.col1}>Room Subtotal</Text>
              <Text style={[styles.col8, { width: '80%', textAlign: 'right' }]}>
                ${items.reduce((s, i) => s + Number(i.line_total_usd), 0).toFixed(2)}
              </Text>
            </View>
          </View>
        ))}

        {/* Totals */}
        {/*
          Batch 1: exchange rate, duty, shipping, and labour rows are hidden
          from customer-facing PDFs. Batch 4 will roll labour into line items
          and make installation conditional on retail customer type.
        */}
        <Text style={styles.sectionTitle}>Quote Totals</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Installation ({priceableCount} window{priceableCount === 1 ? '' : 's'})</Text>
          <Text>TTD ${(priceableCount * Number(quote.installation_cost_ttd)).toFixed(2)}</Text>
        </View>
        {Number(quote.discount_percent) > 0 && (
          <View style={styles.row}>
            <Text style={{ color: 'green' }}>Reseller Discount (-{Number(quote.discount_percent)}%)</Text>
            <Text style={{ color: 'green' }}>applied</Text>
          </View>
        )}
        <Text style={styles.grandTotal}>Grand Total: TTD ${Number(quote.total_ttd).toFixed(2)}</Text>

        {/* Footer */}
        <Text style={styles.footer}>
          Prices valid for 14 days. Installation must be confirmed separately.
        </Text>
      </Page>
    </Document>
  )
}
