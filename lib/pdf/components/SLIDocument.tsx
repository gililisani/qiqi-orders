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

// Create styles
const styles = StyleSheet.create({
  page: {
    width: LETTER.page.width,
    height: LETTER.page.height,
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
  },
  
  // Master table container
  masterTable: {
    width: LETTER.live.width,
    height: LETTER.live.height,
    border: '0.5pt solid black',
    display: 'flex',
    flexDirection: 'column',
  },
  
  // Row styles
  row: {
    borderBottom: '0.5pt solid black',
    display: 'flex',
    flexDirection: 'row',
  },
  
  rowNoBorder: {
    display: 'flex',
    flexDirection: 'row',
  },
  
  // Cell styles
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
  
  // Title
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
  
  // Label text
  label: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 1,
  },
  
  // Regular text
  text: {
    fontSize: 7.5,
  },
  
  textSmall: {
    fontSize: 6.5,
  },
  
  // Checkbox
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
const Checkbox: React.FC<{ checked?: boolean; label: string }> = ({ checked, label }) => (
  <View style={styles.checkboxContainer}>
    <View style={checked ? styles.checkboxChecked : styles.checkbox} />
    <Text style={styles.checkboxLabel}>{label}</Text>
  </View>
);

export const SLIDocument: React.FC<{ data: SLIDocumentData }> = ({ data }) => {
  const checkboxStates = data.checkbox_states || {};
  
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.masterTable}>
          
          {/* Row 1: Title */}
          <View style={[styles.row, { borderBottom: '0.5pt solid black' }]}>
            <View style={[styles.cellNoBorderRight, { width: '100%' }]}>
              <Text style={styles.titleCell}>SHIPPER'S LETTER OF INSTRUCTION (SLI)</Text>
              <Text style={styles.subtitleCell}>FOR AIR EXPORT SHIPMENT</Text>
            </View>
          </View>

          {/* Row 2: USPPI Info Section - 3 columns x 6 rows */}
          <View style={[styles.row, { height: 72 }]}>
            <View style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              
              {/* Inner row 1: Labels */}
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>1. USPPI Name:</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>3. Freight Location Co Name: (if not box 2):</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.label}>5. Forwarding Agent:</Text>
                </View>
              </View>

              {/* Inner row 2: Values */}
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

              {/* Inner row 3: Labels */}
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>2. USPPI Address Including Zip Code:</Text>
                </View>
                <View style={[styles.cell, { width: '30%' }]}>
                  <Text style={styles.label}>4. Freight Location Address (if not box 2):</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.text}>{data.forwarding_agent_line2 || ''}</Text>
                </View>
              </View>

              {/* Inner row 4: Address line 1 */}
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

              {/* Inner row 5: Address line 2 */}
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

              {/* Inner row 6: Country + Date of Export */}
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

          {/* Row 3: EIN and Reference - 5 columns x 2 rows */}
          <View style={[styles.row, { height: 24 }]}>
            <View style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              
              {/* Inner row 1 */}
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.label}>7. USPPI EIN (IRS) No:</Text>
                </View>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.text}>86-2244756</Text>
                </View>
                <View style={[styles.cell, { width: '25%' }]}>
                  <Text style={styles.label}>8. Related Party Indicator:</Text>
                </View>
                <View style={[styles.cell, { width: '17.5%', flexDirection: 'row' }]}>
                  <Checkbox checked={checkboxStates['related']} label="Related" />
                </View>
                <View style={[styles.cellNoBorderRight, { width: '17.5%', flexDirection: 'row' }]}>
                  <Checkbox checked={!checkboxStates['related']} label="Non-Related" />
                </View>
              </View>

              {/* Inner row 2 */}
              <View style={[styles.rowNoBorder, { height: 12 }]}>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.label}>9. USPPI Reference #:</Text>
                </View>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.text}>{data.invoice_number || ''}</Text>
                </View>
                <View style={[styles.cell, { width: '25%' }]}>
                  <Text style={styles.label}>10. Routed Export Transaction:</Text>
                </View>
                <View style={[styles.cell, { width: '17.5%', flexDirection: 'row' }]}>
                  <Checkbox checked={checkboxStates['routed_yes']} label="Yes" />
                </View>
                <View style={[styles.cellNoBorderRight, { width: '17.5%', flexDirection: 'row' }]}>
                  <Checkbox checked={!checkboxStates['routed_yes']} label="No" />
                </View>
              </View>

            </View>
          </View>

          {/* Row 4: Consignee Section - 3 columns x 5 rows */}
          <View style={[styles.row, { height: 60 }]}>
            <View style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              
              {/* Inner row 1: Labels */}
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '35%' }]}>
                  <Text style={styles.label}>11. Ultimate Consignee Name & Address:</Text>
                </View>
                <View style={[styles.cell, { width: '25%' }]}>
                  <Text style={styles.label}>12. Ultimate Consignee Type:</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                  <Text style={styles.label}>13. Intermediate Consignee Name & Address:</Text>
                </View>
              </View>

              {/* Inner rows 2-5: Data */}
              {[
                [data.consignee_name || '', 'Government Entity', ''],
                [data.consignee_address_line1 || '', 'Direct Consumer', ''],
                [data.consignee_address_line2 || '', 'Other/Unknown', ''],
                [data.consignee_address_line3 || '', 'Re-Seller', ''],
              ].map((rowData, index) => (
                <View key={index} style={[styles.rowNoBorder, { height: 12, borderBottom: index < 3 ? '0.5pt solid black' : 'none' }]}>
                  <View style={[styles.cell, { width: '35%' }]}>
                    <Text style={styles.text}>{rowData[0]}</Text>
                  </View>
                  <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}>
                    <Checkbox checked={checkboxStates[`consignee_${rowData[1]?.toLowerCase().replace(/[^a-z]/g, '_')}`]} label={rowData[1]} />
                  </View>
                  <View style={[styles.cellNoBorderRight, { width: '40%' }]}>
                    <Text style={styles.text}>{rowData[2]}</Text>
                  </View>
                </View>
              ))}

            </View>
          </View>

          {/* Row 5: Export Details - 5 columns x 3 rows */}
          <View style={[styles.row, { height: 36 }]}>
            <View style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              
              {/* Inner row 1 */}
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '25%' }]}>
                  <Text style={styles.label}>14. State of Origin:</Text>
                </View>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.text}>NY</Text>
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.label}>17. In-Bond Code:</Text>
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.text}>{data.in_bond_code || ''}</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '25%' }]}>
                  <Text style={styles.label}>20. TIB / Carnet?</Text>
                </View>
              </View>

              {/* Inner row 2 */}
              <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                <View style={[styles.cell, { width: '25%' }]}>
                  <Text style={styles.label}>15. Country of Ultimate Destination:</Text>
                </View>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.text}>{data.consignee_country || ''}</Text>
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.label}>18. Entry Number:</Text>
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.text}></Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '25%', flexDirection: 'row' }]}>
                  <Checkbox checked={checkboxStates['tib_yes']} label="Yes" />
                  <Checkbox checked={!checkboxStates['tib_yes']} label="No" />
                </View>
              </View>

              {/* Inner row 3 */}
              <View style={[styles.rowNoBorder, { height: 12 }]}>
                <View style={[styles.cell, { width: '20%' }]}>
                  <Text style={styles.label}>16. Hazardous Material:</Text>
                </View>
                <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}>
                  <Checkbox checked={checkboxStates['hazmat_yes']} label="Yes" />
                  <Checkbox checked={!checkboxStates['hazmat_yes']} label="No" />
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.label}>19. FTZ Identifier:</Text>
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.text}></Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '25%' }]}>
                  <Text style={styles.text}></Text>
                </View>
              </View>

            </View>
          </View>

          {/* Row 6: Insurance/Payment - Complex with rowspan/colspan */}
          <View style={[styles.row, { height: 48 }]}>
            <View style={{ width: '100%', display: 'flex', flexDirection: 'row' }]}>
              
              {/* Left section: boxes 21-24 */}
              <View style={{ width: '45%', display: 'flex', flexDirection: 'column' }}>
                
                {/* Row 1 */}
                <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                  <View style={[styles.cell, { width: '55%' }]}>
                    <Text style={styles.label}>21. Shipper Requests Insurance:</Text>
                  </View>
                  <View style={[styles.cellNoBorderRight, { width: '45%', flexDirection: 'row' }]}>
                    <Checkbox checked={checkboxStates['insurance_yes']} label="Yes" />
                    <Checkbox checked={!checkboxStates['insurance_yes']} label="No" />
                  </View>
                </View>

                {/* Row 2 */}
                <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                  <View style={[styles.cell, { width: '55%' }]}>
                    <Text style={styles.label}>22. Declared Value for Cartage:</Text>
                  </View>
                  <View style={[styles.cellNoBorderRight, { width: '45%' }]}>
                    <Text style={styles.text}></Text>
                  </View>
                </View>

                {/* Row 3 */}
                <View style={[styles.rowNoBorder, { height: 12, borderBottom: '0.5pt solid black' }]}>
                  <View style={[styles.cell, { width: '55%' }]}>
                    <Text style={styles.label}>23. Shipper Must Check:</Text>
                  </View>
                  <View style={[styles.cellNoBorderRight, { width: '45%', flexDirection: 'row' }]}>
                    <Checkbox checked={checkboxStates['prepaid']} label="Prepaid" />
                    <Checkbox checked={checkboxStates['collect']} label="Collect" />
                  </View>
                </View>

                {/* Row 4 */}
                <View style={[styles.rowNoBorder, { height: 12 }]}>
                  <View style={[styles.cell, { width: '55%' }]}>
                    <Text style={styles.label}>24. C.O.D Amount:</Text>
                  </View>
                  <View style={[styles.cellNoBorderRight, { width: '45%' }]}>
                    <Text style={styles.text}>$</Text>
                  </View>
                </View>

              </View>

              {/* Right section: box 25 (spans 2 rows) and deliver to */}
              <View style={[styles.cellNoBorderRight, { width: '55%', display: 'flex', flexDirection: 'column' }]}>
                
                {/* Box 25 label + options */}
                <View style={{ height: 24, borderBottom: '0.5pt solid black', borderLeft: '0.5pt solid black', padding: 2 }}>
                  <Text style={styles.label}>25. SHIPPER'S INSTRUCTION in case of inability to deliver consignment as consigned.</Text>
                </View>

                {/* Checkboxes row */}
                <View style={[{ height: 12, borderBottom: '0.5pt solid black', borderLeft: '0.5pt solid black', flexDirection: 'row', padding: 2 }]}>
                  <View style={{ width: '50%', flexDirection: 'row' }}>
                    <Checkbox checked={checkboxStates['abandoned']} label="Abandoned" />
                  </View>
                  <View style={{ width: '50%', flexDirection: 'row' }}>
                    <Checkbox checked={checkboxStates['return']} label="Return to Shipper" />
                  </View>
                </View>

                {/* Deliver to row */}
                <View style={[{ height: 12, borderLeft: '0.5pt solid black', padding: 2, flexDirection: 'row' }]}>
                  <Checkbox checked={checkboxStates['deliver_to']} label="Deliver To:" />
                </View>

              </View>

            </View>
          </View>

          {/* Row 7: Aviation Security Text */}
          <View style={[styles.row, { height: 18 }]}>
            <View style={[styles.cellNoBorderRight, { width: '100%' }]}>
              <Text style={styles.textSmall}>
                Cargo items tendered or directed to be tendered by your firm for air transportation are subject to Aviation Security controls for air carriers and when appropriate Other Government Regulations. Copies of all relevant shipping documents showing the cargo's consignee, consignor, description, and other relevant data will be retained on file until the cargo completes its air transportation.
              </Text>
            </View>
          </View>

          {/* Row 8: TSA Regulations Text */}
          <View style={[styles.row, { height: 18 }]}>
            <View style={[styles.cellNoBorderRight, { width: '100%' }]}>
              <Text style={styles.textSmall}>
                I understand that all cargo tendered for transport by air to the nominated is subject to TSA Regulations that may require inspection or screening. I give the nominated freight forwarder my permission to inspect or screen all cargo tendered on behalf of company. My consent will remain in effect until revoked in writing.
              </Text>
            </View>
          </View>

          {/* Row 9: Instructions to Forwarder - FLEX HEIGHT */}
          <View style={{ borderBottom: '0.5pt solid black', flex: 1, minHeight: 30 }}>
            <View style={[styles.cellNoBorderRight, { width: '100%', height: '100%' }]}>
              <Text style={styles.label}>26. Instructions to Forwarder:</Text>
              <Text style={styles.text}>{data.instructions_to_forwarder || ''}</Text>
            </View>
          </View>

          {/* Row 10: Products Table Header */}
          <View style={[styles.row, { height: 12 }]}>
            <View style={{ width: '100%', flexDirection: 'row' }}>
              <View style={[styles.cell, { width: '15%' }]}>
                <Text style={styles.label}>27. Schedule B / HTS</Text>
              </View>
              <View style={[styles.cell, { width: '12%' }]}>
                <Text style={styles.label}>28. D/F</Text>
              </View>
              <View style={[styles.cell, { width: '15%' }]}>
                <Text style={styles.label}>29. Quantity - Schedule B Unit</Text>
              </View>
              <View style={[styles.cell, { width: '10%' }]}>
                <Text style={styles.label}>30. UOM</Text>
              </View>
              <View style={[styles.cell, { width: '13%' }]}>
                <Text style={styles.label}>31. Shipping Weight (kg)</Text>
              </View>
              <View style={[styles.cell, { width: '10%' }]}>
                <Text style={styles.label}>32. Value</Text>
              </View>
              <View style={[styles.cell, { width: '10%' }]}>
                <Text style={styles.label}>33. ECCN</Text>
              </View>
              <View style={[styles.cellNoBorderRight, { width: '15%' }]}>
                <Text style={styles.label}>34. Country of Origin</Text>
              </View>
            </View>
          </View>

          {/* Row 11+: Product Data Rows */}
          {(data.products || []).map((product, index) => (
            <View key={index} style={[styles.row, { height: 12 }]}>
              <View style={{ width: '100%', flexDirection: 'row' }}>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.text}>{product.hs_code || 'N/A'}</Text>
                </View>
                <View style={[styles.cell, { width: '12%' }]}>
                  <Text style={styles.text}>30</Text>
                </View>
                <View style={[styles.cell, { width: '15%' }]}>
                  <Text style={styles.text}>{product.quantity}</Text>
                </View>
                <View style={[styles.cell, { width: '10%' }]}>
                  <Text style={styles.text}>PCS</Text>
                </View>
                <View style={[styles.cell, { width: '13%' }]}>
                  <Text style={styles.text}>{product.weight.toFixed(2)}</Text>
                </View>
                <View style={[styles.cell, { width: '10%' }]}>
                  <Text style={styles.text}>${product.value.toFixed(2)}</Text>
                </View>
                <View style={[styles.cell, { width: '10%' }]}>
                  <Text style={styles.text}>EAR99</Text>
                </View>
                <View style={[styles.cellNoBorderRight, { width: '15%' }]}>
                  <Text style={styles.text}>{product.made_in || ''}</Text>
                </View>
              </View>
            </View>
          ))}

          {/* Last row: Totals */}
          <View style={{ borderBottom: 'none', height: 12 }}>
            <View style={{ width: '100%', flexDirection: 'row' }}>
              <View style={[styles.cell, { width: '27%' }]}>
                <Text style={styles.label}>TOTALS:</Text>
              </View>
              <View style={[styles.cell, { width: '15%' }]}>
                <Text style={styles.text}>
                  {(data.products || []).reduce((sum, p) => sum + p.quantity, 0)}
                </Text>
              </View>
              <View style={[styles.cell, { width: '10%' }]}>
                <Text style={styles.text}>PCS</Text>
              </View>
              <View style={[styles.cell, { width: '13%' }]}>
                <Text style={styles.text}>
                  {(data.products || []).reduce((sum, p) => sum + p.weight, 0).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.cell, { width: '10%' }]}>
                <Text style={styles.text}>
                  ${(data.products || []).reduce((sum, p) => sum + p.value, 0).toFixed(2)}
                </Text>
              </View>
              <View style={[styles.cellNoBorderRight, { width: '25%' }]}>
                <Text style={styles.text}></Text>
              </View>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
};
