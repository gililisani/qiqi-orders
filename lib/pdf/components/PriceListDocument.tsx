/**
 * Partner price list PDF — region-specific (the caller sees only THEIR
 * distributor price) with the Salon Price and MSRP columns from the
 * hand-made template this replaces. msrp null renders as "Pro use".
 * Generated on the fly, so it can never go stale.
 */

import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface PriceListRow {
  name: string;
  distributor: number | null;
  salon: number | null;
  msrp: number | null;
}

const BRAND = '#1a1a2e';
const ACCENT = '#6366f1';

const styles = StyleSheet.create({
  page: {
    paddingTop: 0,
    paddingBottom: 46,
    paddingHorizontal: 0,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#1a1a1a',
  },
  headerBand: {
    backgroundColor: BRAND,
    paddingVertical: 22,
    paddingHorizontal: 42,
    marginBottom: 18,
  },
  title: { fontSize: 20, fontFamily: 'Helvetica-Bold', color: '#ffffff' },
  subtitle: { fontSize: 8.5, color: '#c8c8dc', marginTop: 4 },
  brandLine: { fontSize: 7.5, color: '#9a9ab8', marginTop: 10 },
  body: { paddingHorizontal: 42 },
  colHead: {
    flexDirection: 'row',
    borderBottomWidth: 1.5,
    borderBottomColor: BRAND,
    paddingBottom: 5,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 4.5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e8e8ee',
  },
  rowAlt: { backgroundColor: '#f7f7fa' },
  colProduct: { flex: 1, paddingRight: 10 },
  colPrice: { width: 92, textAlign: 'right' },
  headText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8.5,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: BRAND,
  },
  proUse: { color: '#888', fontSize: 8 },
  footer: {
    position: 'absolute',
    bottom: 18,
    left: 42,
    right: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7,
    color: '#999',
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    paddingTop: 6,
  },
});

function money(v: number | null): string {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return '—';
  const n = Number(v);
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

export function PriceListDocument({
  rows,
  generatedAt,
}: {
  rows: PriceListRow[];
  generatedAt: string;
}) {
  const year = new Date(generatedAt).getFullYear();
  const dateStr = new Date(generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document title={`Qiqi Price List ${year}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.headerBand} fixed>
          <Text style={styles.title}>Qiqi {year} Price List</Text>
          <Text style={styles.subtitle}>
            Prices in USD · Generated {dateStr}
          </Text>
          <Text style={styles.brandLine}>
            Qiqi Global Ltd.  |  www.qiqiglobal.com  |  @Qiqiglobal  |  info@qiqiglobal.com
          </Text>
        </View>

        <View style={styles.body}>
          <View style={styles.colHead} fixed>
            <Text style={[styles.colProduct, styles.headText]}>Product</Text>
            <Text style={[styles.colPrice, styles.headText]}>Distributor (USD)</Text>
            <Text style={[styles.colPrice, styles.headText]}>Salon (USD)</Text>
            <Text style={[styles.colPrice, styles.headText]}>MSRP (USD)</Text>
          </View>

          {rows.map((r, i) => (
            <View style={[styles.row, ...(i % 2 ? [styles.rowAlt] : [])]} key={i} wrap={false}>
              <Text style={styles.colProduct}>{r.name}</Text>
              <Text style={[styles.colPrice, { fontFamily: 'Helvetica-Bold', color: ACCENT }]}>
                {money(r.distributor)}
              </Text>
              <Text style={styles.colPrice}>{money(r.salon)}</Text>
              {r.msrp == null ? (
                <Text style={[styles.colPrice, styles.proUse]}>Pro use</Text>
              ) : (
                <Text style={styles.colPrice}>{money(r.msrp)}</Text>
              )}
            </View>
          ))}
        </View>

        <View style={styles.footer} fixed>
          <Text>Prices subject to change without notice — this list reflects the catalog at generation time.</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
