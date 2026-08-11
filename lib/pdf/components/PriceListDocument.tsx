/**
 * Partner price list PDF — faithful replica of the owner's hand-made
 * template, iterated with them: wordmark + tagline logos top left (both
 * real brand assets from /public), ABC P3rman3nt (the Hub's brand font),
 * single thin black grid (no doubled borders), left-aligned $9.5-style
 * prices, "Pro use" where there is no MSRP, contact-only footer.
 * Region-specific: the caller's distributor price and ONLY the products
 * visible to their region.
 */

import React from 'react';
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';

export interface PriceListRow {
  name: string;
  casePack: number | null;
  distributor: number | null;
  salon: number | null;
  msrp: number | null;
}

/** Register the Hub's brand font for the PDF. `base` is the app origin in
 *  the browser, or a filesystem path in node (tests/verification). */
export function registerPriceListFonts(base: string): void {
  Font.register({
    family: 'ABC P3rman3nt',
    fonts: [
      { src: `${base}/fonts/abc-p3rman3nt/ABCP3rman3nt-Book.otf`, fontWeight: 400 },
      { src: `${base}/fonts/abc-p3rman3nt/ABCP3rman3nt-Bold.otf`, fontWeight: 700 },
    ],
  });
}

const B = 0.5; // hairline black border, matching the owner's template

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 62,
    fontSize: 9,
    fontFamily: 'ABC P3rman3nt',
    color: '#000',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 34 },
  logo: { height: 32 },
  taglineLogo: { height: 20, marginLeft: 16 },
  // Single-line grid: the table draws top+left once; every cell draws only
  // its right+bottom edge. No edge is ever drawn twice.
  table: {
    borderTopWidth: B,
    borderLeftWidth: B,
    borderColor: '#000',
  },
  row: { flexDirection: 'row' },
  cell: {
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRightWidth: B,
    borderBottomWidth: B,
    borderColor: '#000',
    justifyContent: 'center',
  },
  // Product gets the room — the other columns are as tight as their
  // headers allow, so product names never wrap.
  colProduct: { flex: 1 },
  colCase: { width: 44 },
  colPrice: { width: 74 },
  colMsrp: { width: 62 },
  headText: { fontWeight: 700, fontSize: 9 },
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
  taglineUrl,
}: {
  rows: PriceListRow[];
  generatedAt: string;
  logoUrl?: string;
  taglineUrl?: string;
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
          {taglineUrl && (
            // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not a DOM img
            <Image src={taglineUrl} style={styles.taglineLogo} />
          )}
        </View>

        <View style={styles.table}>
          <View style={styles.row} fixed>
            <View style={[styles.cell, styles.colProduct]}>
              <Text style={styles.headText}>Product</Text>
            </View>
            <View style={[styles.cell, styles.colCase]}>
              <Text style={styles.headText}>Case Pack</Text>
            </View>
            <View style={[styles.cell, styles.colPrice]}>
              <Text style={styles.headText}>Distributor Price (USD)</Text>
            </View>
            <View style={[styles.cell, styles.colPrice]}>
              <Text style={styles.headText}>Salon Price (USD)</Text>
            </View>
            <View style={[styles.cell, styles.colMsrp]}>
              <Text style={styles.headText}>MSRP (USD)</Text>
            </View>
          </View>

          {rows.map((r, i) => (
            <View style={styles.row} key={i} wrap={false}>
              <View style={[styles.cell, styles.colProduct]}>
                <Text>{r.name}</Text>
              </View>
              <View style={[styles.cell, styles.colCase]}>
                <Text>{r.casePack ?? ''}</Text>
              </View>
              <View style={[styles.cell, styles.colPrice]}>
                <Text>{money(r.distributor)}</Text>
              </View>
              <View style={[styles.cell, styles.colPrice]}>
                <Text>{money(r.salon)}</Text>
              </View>
              <View style={[styles.cell, styles.colMsrp]}>
                <Text>{r.msrp == null ? 'Pro use' : money(r.msrp)}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          www.qiqiglobal.com | @Qiqiglobal | info@qiqiglobal.com
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
