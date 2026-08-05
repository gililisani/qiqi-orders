/**
 * Distributor price list PDF — one module for everyone (owner decision
 * 2026-08-04: not tailored per client; both regions' distributor prices).
 * Layout follows the hand-made "2026 updated price list" PDF: brand header
 * line, one clean table. Generated on the fly so it can never go stale.
 */

import React from 'react';
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface PriceListProduct {
  item_name: string | null;
  sku: string | null;
  price_international: number | string | null;
  price_americas: number | string | null;
}

const styles = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 40, paddingHorizontal: 40, fontSize: 9, fontFamily: 'Helvetica' },
  brandLine: { fontSize: 8, color: '#666', textAlign: 'center', marginBottom: 14 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'center' },
  subtitle: { fontSize: 8, color: '#666', textAlign: 'center', marginTop: 3, marginBottom: 16 },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#111',
    paddingBottom: 4,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ddd',
    paddingVertical: 3.5,
  },
  colProduct: { flex: 1, paddingRight: 8 },
  colPrice: { width: 110, textAlign: 'right' },
  headText: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: '#999',
    textAlign: 'center',
  },
});

function fmt(v: number | string | null): string {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return `$${n % 1 === 0 ? n : n.toFixed(2)}`;
}

export function PriceListDocument({
  products,
  generatedAt,
}: {
  products: PriceListProduct[];
  generatedAt: string;
}) {
  const year = new Date(generatedAt).getFullYear();
  return (
    <Document title={`Qiqi Price List ${year}`}>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.brandLine}>
          Qiqi Global Ltd. | www.qiqiglobal.com | @Qiqiglobal | info@qiqiglobal.com
        </Text>
        <Text style={styles.title}>{year} Distributor Price List</Text>
        <Text style={styles.subtitle}>
          Prices in USD · Generated {new Date(generatedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>

        <View style={styles.headerRow} fixed>
          <Text style={[styles.colProduct, styles.headText]}>Product</Text>
          <Text style={[styles.colPrice, styles.headText]}>International (USD)</Text>
          <Text style={[styles.colPrice, styles.headText]}>Americas (USD)</Text>
        </View>

        {products.map((p, i) => (
          <View style={styles.row} key={i} wrap={false}>
            <Text style={styles.colProduct}>{p.item_name || p.sku || '—'}</Text>
            <Text style={styles.colPrice}>{fmt(p.price_international)}</Text>
            <Text style={styles.colPrice}>{fmt(p.price_americas)}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          Prices subject to change. This list reflects the catalog at the moment of
          generation.
        </Text>
      </Page>
    </Document>
  );
}
