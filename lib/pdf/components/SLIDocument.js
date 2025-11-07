import * as React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

const PAGE_SIZES = {
  LETTER: {
    page: { width: 612, height: 792 },
    margin: 36,
    live: { width: 540, height: 720 },
  },
};

const { LETTER } = PAGE_SIZES;

// Create styles
const styles = StyleSheet.create({
  page: {
    width: LETTER.page.width,
    height: LETTER.page.height,
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
  },
  
  masterTable: {
    width: LETTER.live.width,
    height: LETTER.live.height,
    border: '0.5pt solid black',
    display: 'flex',
    flexDirection: 'column',
  },
  
  row: {
    borderBottom: '0.5pt solid black',
    display: 'flex',
    flexDirection: 'row',
  },
  
  rowNoBorder: {
    display: 'flex',
    flexDirection: 'row',
  },
  
  cell: {
    borderRight: '0.5pt solid black',
    padding: 2,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  
  cellNoBorderRight: {
    padding: 2,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  
  titleCell: {
    padding: 4,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  
  subtitleCell: {
    padding: 2,
    textAlign: 'center',
    fontSize: 7,
  },
  
  label: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 1,
  },
  
  text: {
    fontSize: 7.5,
  },
  
  textSmall: {
    fontSize: 6.5,
  },
  
  checkboxContainer: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
  },
  
  checkbox: {
    width: 7,
    height: 7,
    border: '0.5pt solid black',
    marginRight: 2,
  },
  
  checkboxChecked: {
    width: 7,
    height: 7,
    border: '0.5pt solid black',
    backgroundColor: '#000000',
    marginRight: 2,
  },
  
  checkboxLabel: {
    fontSize: 7,
  },
});

// Checkbox component
const Checkbox = ({ checked, label }) => (
  <View style={styles.checkboxContainer}>
    <View style={checked ? styles.checkboxChecked : styles.checkbox} />
    <Text style={styles.checkboxLabel}>{label}</Text>
  </View>
);

export const SLIDocument = ({ data }) => {
  const checkboxStates = data.checkbox_states || {};
  
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.masterTable}>
          
          {/* Title */}
          <View style={[styles.row, { borderBottom: '0.5pt solid black' }]}>
            <View style={[styles.cellNoBorderRight, { width: '100%' }]}>
              <Text style={styles.titleCell}>SHIPPER'S LETTER OF INSTRUCTION (SLI)</Text>
              <Text style={styles.subtitleCell}>FOR AIR EXPORT SHIPMENT</Text>
            </View>
          </View>

          {/* Row 2: USPPI Info */}
          <View style={[styles.row, { height: 72 }]}>
            <View style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>1. USPPI Name:</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>3. Freight Location Co Name:</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.label}>5. Forwarding Agent:</Text>
                </View>
              </View>

              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>Qiqi INC</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>PACKABLE / Webb Enterprises</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.text}>{data.forwarding_agent_line1 || ''}</Text>
                </View>
              </View>

              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>2. USPPI Address:</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>4. Freight Location Address:</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.text}>{data.forwarding_agent_line2 || ''}</Text>
                </View>
              </View>

              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>4625 West Nevso Drive, Suite 2</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>1516 Motor Parkway</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.text}>{data.forwarding_agent_line3 || ''}</Text>
                </View>
              </View>

              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>Las Vegas, NV 89103</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>Islandia, New York, 11749</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.text}>{data.forwarding_agent_line4 || ''}</Text>
                </View>
              </View>

              <View style={[styles.rowNoBorder, { height: 12 }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>United States</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.text}>United States</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%', flexDirection: 'row' }]}>
                  <View style={[styles.cell, { width: '50%' }]}>
                    <Text style={styles.label}>6. Date of Export:</Text>
                  </View>
                  <View style={[styles.cellNoBorderRight, { width: '50%' }]}>
                    <Text style={styles.text}>{data.date_of_export || ''}</Text>
                  </View>
                </View>
              </View>

            </View>
          </View>

          {/* Products Table */}
          <View style={[styles.row, { height: 12 }]}>
            <View style={{ width: '100%', flexDirection: 'row' }}>
              <View style={[styles.cell, { width: '15%' }]}>
                <Text style={styles.label}>Schedule B</Text>
              </View>
              <View style={[styles.cell, { width: '12%' }]}>
                <Text style={styles.label}>Quantity</Text>
              </View>
              <View style={[styles.cell, { width: '13%' }]}>
                <Text style={styles.label}>Weight (kg)</Text>
              </View>
              <View style={[styles.cell, { width: '10%' }]}>
                <Text style={styles.label}>Value</Text>
              </View>
              <View style={[styles.cellNoBorderRight, { width: '15%' }]}>
                <Text style={styles.label}>Made In</Text>
              </View>
            </View>
          </View>

          {/* Product Rows */}
          {(data.products || []).map((product, index) => (
            <View key={index} style={[styles.row, { height: 12 }]}>
              <View style={{ width: '100%', flexDirection: 'row' }}>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.text}>{product.hs_code || 'N/A'}</Text>
                </View>
                <View style={[styles.cell, { width: '12%' }]}>
                  <Text style={styles.text}>{product.quantity}</Text>
                </View>
                <View style={[styles.cell, { width: '13%' }]}>
                  <Text style={styles.text}>{product.weight?.toFixed(2) || '0.00'}</Text>
                </View>
                <View style={[styles.cell, { width: '10%' }]}>
                  <Text style={styles.text}>${product.value?.toFixed(2) || '0.00'}</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '15%' }]}>
                  <Text style={styles.text}>{product.made_in || ''}</Text>
                </View>
              </View>
            </View>
          ))}

          {/* Instructions - FLEX */}
          <View style={{ flex: 1, borderBottom: 'none', minHeight: 30 }}>
            <View style={[styles.cellNoBorderRight, { width: '100%', height: '100%' }]}>
              <Text style={styles.label}>26. Instructions to Forwarder:</Text>
              <Text style={styles.text}>{data.instructions_to_forwarder || ''}</Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
};

