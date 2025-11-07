import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';

// US Letter dimensions
const LETTER = {
  page: { width: 612, height: 792 },
  margin: 36, // 0.5 inch
  live: { width: 540, height: 720 },
};

interface SLIProduct {
  hs_code: string;
  quantity: number;
  case_weight: number;
  total_price: number;
  made_in: string;
}

export interface SLIDocumentData {
  sli_number?: number;
  invoice_number: string;
  consignee_name: string;
  consignee_address_line1: string;
  consignee_address_line2?: string;
  consignee_address_line3?: string;
  consignee_country: string;
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  sli_date: string;
  date_of_export?: string;
  products: SLIProduct[];
  checkbox_states?: Record<string, boolean>;
}

const styles = StyleSheet.create({
  page: {
    width: LETTER.page.width,
    height: LETTER.page.height,
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 8,
  },
  container: {
    width: LETTER.live.width,
    height: LETTER.live.height,
    border: '1px solid black',
  },
  // Header section
  header: {
    flexDirection: 'row',
    borderBottom: '1px solid black',
  },
  headerLeft: {
    width: '50%',
    borderRight: '1px solid black',
    padding: 4,
  },
  headerRight: {
    width: '50%',
    padding: 4,
  },
  title: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 7,
    textAlign: 'center',
  },
  // Row styles
  row: {
    flexDirection: 'row',
    borderBottom: '1px solid black',
  },
  rowNoBorder: {
    flexDirection: 'row',
  },
  // Cell styles
  cell: {
    padding: 3,
    borderRight: '1px solid black',
  },
  cellNoBorder: {
    padding: 3,
  },
  cellLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  cellValue: {
    fontSize: 8,
    marginTop: 2,
  },
  // Box number styles
  boxNumber: {
    fontSize: 6,
    position: 'absolute',
    top: 1,
    left: 2,
  },
  // Checkbox styles
  checkbox: {
    width: 8,
    height: 8,
    border: '1px solid black',
    marginRight: 3,
  },
  checkboxChecked: {
    width: 8,
    height: 8,
    border: '1px solid black',
    backgroundColor: 'black',
    marginRight: 3,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  // Product table
  productTable: {
    width: '100%',
  },
  productRow: {
    flexDirection: 'row',
    borderBottom: '0.5px solid black',
  },
  productCell: {
    padding: 2,
    fontSize: 7,
    borderRight: '0.5px solid black',
  },
  productCellLast: {
    padding: 2,
    fontSize: 7,
  },
});

// Helper function to aggregate products by HS Code
function aggregateProducts(products: SLIProduct[]): SLIProduct[] {
  const grouped = new Map<string, SLIProduct>();
  
  products.forEach(product => {
    const hsCode = product.hs_code || 'N/A';
    const existing = grouped.get(hsCode);
    
    if (existing) {
      existing.quantity += product.quantity;
      existing.case_weight += product.case_weight;
      existing.total_price += product.total_price;
    } else {
      grouped.set(hsCode, { ...product });
    }
  });
  
  return Array.from(grouped.values());
}

export const SLIDocument: React.FC<{ data: SLIDocumentData }> = ({ data }) => {
  const aggregatedProducts = aggregateProducts(data.products);
  const totalQuantity = aggregatedProducts.reduce((sum, p) => sum + p.quantity, 0);
  const totalWeight = aggregatedProducts.reduce((sum, p) => sum + p.case_weight, 0);
  const totalValue = aggregatedProducts.reduce((sum, p) => sum + p.total_price, 0);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>SHIPPER'S LETTER OF INSTRUCTIONS</Text>
              <Text style={styles.subtitle}>FOR EXPORT SHIPMENTS</Text>
            </View>
            <View style={styles.headerRight}>
              <View style={{ position: 'relative' }}>
                <Text style={styles.boxNumber}>1.</Text>
                <Text style={styles.cellLabel}>SLI Number</Text>
                <Text style={styles.cellValue}>{data.sli_number || 'N/A'}</Text>
              </View>
            </View>
          </View>

          {/* Row 1: USPPI (2), Ultimate Consignee (3), Parties to Transaction (4) */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '33%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>2.</Text>
              <Text style={styles.cellLabel}>USPPI (Complete Name & Address)</Text>
              <Text style={styles.cellValue}>Qiqi Global LLC</Text>
              <Text style={[styles.cellValue, { fontSize: 7 }]}>10120 SW Nimbus Ave</Text>
              <Text style={[styles.cellValue, { fontSize: 7 }]}>Ste J7, Portland, OR 97223</Text>
            </View>
            <View style={[styles.cell, { width: '47%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>3.</Text>
              <Text style={styles.cellLabel}>Ultimate Consignee</Text>
              <Text style={styles.cellValue}>{data.consignee_name}</Text>
              <Text style={[styles.cellValue, { fontSize: 7 }]}>
                {data.consignee_address_line1}
              </Text>
              {data.consignee_address_line2 && (
                <Text style={[styles.cellValue, { fontSize: 7 }]}>
                  {data.consignee_address_line2}
                </Text>
              )}
              {data.consignee_address_line3 && (
                <Text style={[styles.cellValue, { fontSize: 7 }]}>
                  {data.consignee_address_line3}
                </Text>
              )}
            </View>
            <View style={[styles.cellNoBorder, { width: '20%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>4.</Text>
              <Text style={styles.cellLabel}>Parties to Transaction</Text>
              <View style={{ marginTop: 4 }}>
                <View style={styles.checkboxRow}>
                  <View style={data.checkbox_states?.related ? styles.checkboxChecked : styles.checkbox} />
                  <Text style={{ fontSize: 7 }}>Related</Text>
                </View>
                <View style={styles.checkboxRow}>
                  <View style={data.checkbox_states?.non_related ? styles.checkboxChecked : styles.checkbox} />
                  <Text style={{ fontSize: 7 }}>Non-Related</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Row 2: Forwarding Agent (5), Date of Export (6), Entry Number (7) */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '50%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>5.</Text>
              <Text style={styles.cellLabel}>Forwarding Agent</Text>
              {data.forwarding_agent_line1 && <Text style={styles.cellValue}>{data.forwarding_agent_line1}</Text>}
              {data.forwarding_agent_line2 && <Text style={[styles.cellValue, { fontSize: 7 }]}>{data.forwarding_agent_line2}</Text>}
              {data.forwarding_agent_line3 && <Text style={[styles.cellValue, { fontSize: 7 }]}>{data.forwarding_agent_line3}</Text>}
              {data.forwarding_agent_line4 && <Text style={[styles.cellValue, { fontSize: 7 }]}>{data.forwarding_agent_line4}</Text>}
            </View>
            <View style={[styles.cell, { width: '25%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>6.</Text>
              <Text style={styles.cellLabel}>Date of Export</Text>
              <Text style={styles.cellValue}>{data.date_of_export || new Date().toLocaleDateString('en-US')}</Text>
            </View>
            <View style={[styles.cellNoBorder, { width: '25%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>7.</Text>
              <Text style={styles.cellLabel}>Entry Number</Text>
              <Text style={styles.cellValue}></Text>
            </View>
          </View>

          {/* Row 3: Transport Reference (8), USPPI Reference (9), FTZ (10) */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '33%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>8.</Text>
              <Text style={styles.cellLabel}>Transport Reference</Text>
              <Text style={styles.cellValue}></Text>
            </View>
            <View style={[styles.cell, { width: '34%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>9.</Text>
              <Text style={styles.cellLabel}>USPPI Reference / Invoice #</Text>
              <Text style={styles.cellValue}>{data.invoice_number}</Text>
            </View>
            <View style={[styles.cellNoBorder, { width: '33%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>10.</Text>
              <Text style={styles.cellLabel}>FTZ</Text>
              <Text style={styles.cellValue}></Text>
            </View>
          </View>

          {/* Row 4: Point of Origin (12), Loading Pier (13), Mode of Transport (14), Country of Destination (15) */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '25%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>12.</Text>
              <Text style={styles.cellLabel}>Point (State) of Origin</Text>
              <Text style={styles.cellValue}>OR</Text>
            </View>
            <View style={[styles.cell, { width: '25%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>13.</Text>
              <Text style={styles.cellLabel}>Loading Pier</Text>
              <Text style={styles.cellValue}></Text>
            </View>
            <View style={[styles.cell, { width: '25%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>14.</Text>
              <Text style={styles.cellLabel}>Mode of Transport</Text>
              <Text style={styles.cellValue}>Ocean</Text>
            </View>
            <View style={[styles.cellNoBorder, { width: '25%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>15.</Text>
              <Text style={styles.cellLabel}>Country of Destination</Text>
              <Text style={styles.cellValue}>{data.consignee_country}</Text>
            </View>
          </View>

          {/* Row 5: Exporting Carrier (16), In-Bond Code (17), Export License Info (18-20) */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '30%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>16.</Text>
              <Text style={styles.cellLabel}>Exporting Carrier</Text>
              <Text style={styles.cellValue}></Text>
            </View>
            <View style={[styles.cell, { width: '15%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>17.</Text>
              <Text style={styles.cellLabel}>In-Bond Code</Text>
              <Text style={styles.cellValue}>{data.in_bond_code || ''}</Text>
            </View>
            <View style={[styles.cell, { width: '18%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>18.</Text>
              <Text style={styles.cellLabel}>License Code</Text>
              <Text style={styles.cellValue}>NLR</Text>
            </View>
            <View style={[styles.cell, { width: '18%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>19.</Text>
              <Text style={styles.cellLabel}>ECCN</Text>
              <Text style={styles.cellValue}>EAR99</Text>
            </View>
            <View style={[styles.cellNoBorder, { width: '19%', position: 'relative' }]}>
              <Text style={styles.boxNumber}>20.</Text>
              <Text style={styles.cellLabel}>License Number</Text>
              <Text style={styles.cellValue}></Text>
            </View>
          </View>

          {/* Product Table Header */}
          <View style={[styles.row, { backgroundColor: '#f0f0f0' }]}>
            <View style={[styles.cell, { width: '5%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>21.</Text>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>Qty</Text>
            </View>
            <View style={[styles.cell, { width: '25%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>22. Schedule B / HTS Code</Text>
            </View>
            <View style={[styles.cell, { width: '25%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>23. Description of Commodities</Text>
            </View>
            <View style={[styles.cell, { width: '15%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>24. Shipping Weight (kg)</Text>
            </View>
            <View style={[styles.cell, { width: '15%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>25. Value (USD)</Text>
            </View>
            <View style={[styles.cellNoBorder, { width: '15%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 6 }]}>Country of Origin</Text>
            </View>
          </View>

          {/* Product Rows */}
          {aggregatedProducts.map((product, index) => (
            <View key={index} style={styles.row}>
              <View style={[styles.cell, { width: '5%' }]}>
                <Text style={{ fontSize: 7 }}>{product.quantity}</Text>
              </View>
              <View style={[styles.cell, { width: '25%' }]}>
                <Text style={{ fontSize: 7 }}>{product.hs_code}</Text>
              </View>
              <View style={[styles.cell, { width: '25%' }]}>
                <Text style={{ fontSize: 7 }}>General Merchandise</Text>
              </View>
              <View style={[styles.cell, { width: '15%' }]}>
                <Text style={{ fontSize: 7 }}>{product.case_weight.toFixed(2)}</Text>
              </View>
              <View style={[styles.cell, { width: '15%' }]}>
                <Text style={{ fontSize: 7 }}>${product.total_price.toFixed(2)}</Text>
              </View>
              <View style={[styles.cellNoBorder, { width: '15%' }]}>
                <Text style={{ fontSize: 7 }}>{product.made_in || 'CN'}</Text>
              </View>
            </View>
          ))}

          {/* Totals Row */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '5%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 7 }]}>{totalQuantity}</Text>
            </View>
            <View style={[styles.cell, { width: '25%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 7 }]}>TOTALS</Text>
            </View>
            <View style={[styles.cell, { width: '25%' }]}></View>
            <View style={[styles.cell, { width: '15%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 7 }]}>{totalWeight.toFixed(2)}</Text>
            </View>
            <View style={[styles.cell, { width: '15%' }]}>
              <Text style={[styles.cellLabel, { fontSize: 7 }]}>${totalValue.toFixed(2)}</Text>
            </View>
            <View style={[styles.cellNoBorder, { width: '15%' }]}></View>
          </View>

          {/* Box 26: Instructions to Forwarder - FLEXIBLE HEIGHT */}
          <View style={[styles.cellNoBorder, { padding: 4, flex: 1, position: 'relative' }]}>
            <Text style={styles.boxNumber}>26.</Text>
            <Text style={styles.cellLabel}>Instructions to Forwarder:</Text>
            <Text style={[styles.cellValue, { marginTop: 4 }]}>
              {data.instructions_to_forwarder || 'No special instructions'}
            </Text>
          </View>

          {/* Signature Section */}
          <View style={{ borderTop: '1px solid black', padding: 4, flexDirection: 'row' }}>
            <View style={{ width: '50%' }}>
              <Text style={{ fontSize: 7 }}>Signature: _______________________</Text>
              <Text style={{ fontSize: 6, marginTop: 4 }}>
                Date: {new Date().toLocaleDateString('en-US')}
              </Text>
            </View>
            <View style={{ width: '50%', paddingLeft: 10 }}>
              <Text style={{ fontSize: 6, fontFamily: 'Helvetica-Oblique' }}>
                I declare that all statements are true and correct.
              </Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  );
};

