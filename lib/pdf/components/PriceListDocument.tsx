/**
 * Partner price list PDF — a faithful replica of the owner's hand-made
 * template ("2026 updated price list.pdf"): Qiqi wordmark + tagline top
 * left, plain fully-bordered black-on-white table (Product | Distributor
 * Price | Salon Price | MSRP, values left-aligned, $9.5-style formatting,
 * "Pro use" where there is no MSRP), centered contact line at the bottom.
 * Region-specific: the caller's distributor price only.
 */

import React from 'react';
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface PriceListRow {
  name: string;
  distributor: number | null;
  salon: number | null;
  msrp: number | null;
}

const BORDER = 0.75;

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 62,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: '#000',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 36 },
  logo: { height: 34, marginRight: 14 },
  tagline: { fontSize: 10.5, lineHeight: 1.25 },
  taglineLight: { fontFamily: 'Helvetica-Oblique' },
  taglineBold: { fontFamily: 'Helvetica-Bold' },
  table: {
    borderWidth: BORDER,
    borderColor: '#000',
  },
  row: { flexDirection: 'row' },
  rowBorder: { borderBottomWidth: BORDER, borderBottomColor: '#000' },
  cell: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRightWidth: BORDER,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  cellLast: { borderRightWidth: 0 },
  colProduct: { flex: 1 },
  colPrice: { width: 92 },
  colMsrp: { width: 80 },
  headText: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 62,
    right: 62,
    textAlign: 'center',
    fontSize: 9.5,
    color: '#000',
  },
  generated: {
    position: 'absolute',
    bottom: 18,
    left: 62,
    right: 62,
    textAlign: 'center',
    fontSize: 6.5,
    color: '#999',
  },
});

/** Template-style price: $25, $9.5, $4.75 — no forced decimals. */
function money(v: number | null): string {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return '';
  const n = Number(v);
  if (n % 1 === 0) return `$${n}`;
  return `$${parseFloat(n.toFixed(2))}`;
}

export function PriceListDocument({
  rows,
  generatedAt,
  logoUrl,
}: {
  rows: PriceListRow[];
  generatedAt: string;
  logoUrl?: string;
}) {
  const year = new Date(generatedAt).getFullYear();
  return (
    <Document title={`Qiqi Price List ${year}`}>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.logoRow}>
          {logoUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not a DOM img
            <Image src={logoUrl} style={styles.logo} />
          )}
          <View>
            <Text style={styles.tagline}>
              <Text style={styles.taglineLight}>The </Text>
              <Text style={styles.taglineBold}>Art and Science</Text>
            </Text>
            <Text style={styles.tagline}>
              <Text style={styles.taglineLight}>of </Text>
              <Text style={styles.taglineBold}>Hair Control</Text>
            </Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.row, styles.rowBorder]} fixed>
            <View style={[styles.cell, styles.colProduct]}>
              <Text style={styles.headText}>Product</Text>
            </View>
            <View style={[styles.cell, styles.colPrice]}>
              <Text style={styles.headText}>Distributor Price (USD)</Text>
            </View>
            <View style={[styles.cell, styles.colPrice]}>
              <Text style={styles.headText}>Salon Price (USD)</Text>
            </View>
            <View style={[styles.cell, styles.colMsrp, styles.cellLast]}>
              <Text style={styles.headText}>MSRP (USD)</Text>
            </View>
          </View>

          {rows.map((r, i) => (
            <View
              style={[styles.row, ...(i < rows.length - 1 ? [styles.rowBorder] : [])]}
              key={i}
              wrap={false}
            >
              <View style={[styles.cell, styles.colProduct]}>
                <Text>{r.name}</Text>
              </View>
              <View style={[styles.cell, styles.colPrice]}>
                <Text>{money(r.distributor)}</Text>
              </View>
              <View style={[styles.cell, styles.colPrice]}>
                <Text>{money(r.salon)}</Text>
              </View>
              <View style={[styles.cell, styles.colMsrp, styles.cellLast]}>
                <Text>{r.msrp == null ? 'Pro use' : money(r.msrp)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          Qiqi Global Ltd. | www.qiqiglobal.com | @Qiqiglobal | info@qiqiglobal.com
        </Text>
        <Text style={styles.generated} fixed>
          Generated{' '}
          {new Date(generatedAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </Page>
    </Document>
  );
}
