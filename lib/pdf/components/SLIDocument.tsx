import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { PAGE_SIZES } from '../constants';

const { LETTER } = PAGE_SIZES;

interface SLIProduct {
  hs_code: string;
  quantity: number;
  weight: number;
  value: number;
  made_in: string;
}

export interface SLIDocumentData {
  sli_number?: string | number;
  invoice_number?: string;
  consignee_name?: string;
  consignee_address_line1?: string;
  consignee_address_line2?: string;
  consignee_address_line3?: string;
  consignee_country?: string;
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  sli_date?: string;
  date_of_export?: string;
  products?: SLIProduct[];
  checkbox_states?: Record<string, boolean>;
}

// Styles
const styles = StyleSheet.create({
  page: {
    width: LETTER.page.width,
    height: LETTER.page.height,
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    lineHeight: 1.1,
  },
  container: {
    width: LETTER.live.width,
    height: LETTER.live.height,
    border: '0.5pt solid black',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid black',
  },
  cell: {
    borderRight: '0.5pt solid black',
    padding: 2,
  },
  cellNoBorder: {
    padding: 2,
  },
  title: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    padding: 4,
  },
  label: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  text: {
    fontSize: 7.5,
  },
  checkbox: {
    width: 8,
    height: 8,
    border: '0.5pt solid black',
    marginRight: 3,
  },
  checkboxChecked: {
    width: 8,
    height: 8,
    border: '0.5pt solid black',
    backgroundColor: '#000000',
    marginRight: 3,
  },
});

export const SLIDocument: React.FC<{ data: SLIDocumentData }> = ({ data }) => {
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.container}>
          {/* Title */}
          <View style={[styles.row, { borderBottom: '0.5pt solid black' }]}>
            <View style={[styles.cellNoBorder, { width: '100%' }]}>
              <Text style={styles.title}>SHIPPER'S LETTER OF INSTRUCTIONS</Text>
              <Text style={[styles.text, { textAlign: 'center', fontSize: 6 }]}>
                FOR AIR EXPORT SHIPMENT
              </Text>
            </View>
          </View>

          {/* Box 1-4: First row */}
          <View style={styles.row}>
            {/* Box 1: SLI Number */}
            <View style={[styles.cell, { width: '25%' }]}>
              <Text style={styles.label}>1. SLI Number</Text>
              <Text style={styles.text}>{data.sli_number || ''}</Text>
            </View>
            
            {/* Box 2: Date */}
            <View style={[styles.cell, { width: '25%' }]}>
              <Text style={styles.label}>2. Date</Text>
              <Text style={styles.text}>{data.sli_date || new Date().toLocaleDateString()}</Text>
            </View>
            
            {/* Box 3: USPPI EIN */}
            <View style={[styles.cell, { width: '25%' }]}>
              <Text style={styles.label}>3. USPPI EIN (IRS) No.</Text>
              <Text style={styles.text}>95-3829716</Text>
            </View>
            
            {/* Box 4: Parties to Transaction */}
            <View style={[styles.cell, { width: '25%', borderRight: 'none' }]}>
              <Text style={styles.label}>4. Parties to Transaction</Text>
              <Text style={styles.text}>☑ Related  ☐ Non-Related</Text>
            </View>
          </View>

          {/* More rows will be added here */}
          
          {/* Placeholder for remaining boxes - will implement incrementally */}
          <View style={{ flex: 1, padding: 10 }}>
            <Text style={styles.text}>Building SLI template...</Text>
            <Text style={styles.text}>Consignee: {data.consignee_name}</Text>
            <Text style={styles.text}>Invoice: {data.invoice_number}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};
