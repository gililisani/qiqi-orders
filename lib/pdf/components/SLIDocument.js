import * as React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';

const LETTER = {
  page: { width: 612, height: 792 },
  margin: 36,
  live: { width: 540, height: 720 },
};

// Styles - simpler, flatter structure
const styles = StyleSheet.create({
  page: {
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
  },
  
  // Table container with outer border
  table: {
    width: LETTER.live.width,
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
  },
  
  // Simple row
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    minHeight: 15, // 20px
  },
  
  rowNoBottom: {
    flexDirection: 'row',
    minHeight: 15, // 20px
  },
  
  // Cell types
  cell: {
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    minHeight: 15, // 20px
    justifyContent: 'center', // Vertical align middle
  },
  
  cellNoRight: {
    padding: 2,
    minHeight: 15, // 20px
    justifyContent: 'center', // Vertical align middle
  },
  
  labelCell: {
    padding: 2,
    backgroundColor: '#def0fd',
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    borderRightStyle: 'solid',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    minHeight: 15, // 20px
    justifyContent: 'center', // Vertical align middle
  },
  
  labelCellNoRight: {
    padding: 2,
    backgroundColor: '#def0fd',
    fontFamily: 'Helvetica-Bold',
    fontSize: 6.5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
    minHeight: 15, // 20px
    justifyContent: 'center', // Vertical align middle
  },
  
  // Title
  titleRow: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    borderBottomStyle: 'solid',
  },
  
  titleText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  
  // Text
  text: {
    fontSize: 7.5,
  },
  
  textSmall: {
    fontSize: 6.5,
  },
  
  textBold: {
    fontSize: 7.5,
    fontFamily: 'Helvetica-Bold',
  },
  
  // Checkbox
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  
  checkbox: {
    width: 6,
    height: 6,
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
    marginRight: 2,
  },
  
  checkboxFilled: {
    width: 6,
    height: 6,
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
    marginRight: 2,
    backgroundColor: '#000',
    padding: 1,
  },
  
  checkboxInner: {
    width: 4,
    height: 4,
    backgroundColor: '#000',
  },
});

// Checkbox
const CB = ({ checked, label }) => (
  <View style={styles.checkboxContainer}>
    <View style={checked ? styles.checkboxFilled : styles.checkbox}>
      {checked && <View style={styles.checkboxInner} />}
    </View>
    <Text style={styles.textSmall}>{label}</Text>
  </View>
);

export const SLIDocument = ({ data }) => {
  const cs = data.checkbox_states || {};
  const rawProducts = data.products || [];
  
  // Helper: Determine D or F based on made_in
  const getDorF = (madeIn) => {
    const country = (madeIn || '').toLowerCase().trim();
    if (country === 'usa' || country === 'united states' || country === 'us') {
      return 'D';
    }
    return 'F';
  };
  
  // Aggregate products by HS code (same logic as HTML generator)
  const groupedProducts = new Map();
  const productsWithoutHS = [];
  
  rawProducts.forEach(product => {
    if (product.hs_code && product.hs_code.trim() !== '') {
      const hsCode = product.hs_code.trim();
      if (groupedProducts.has(hsCode)) {
        const existing = groupedProducts.get(hsCode);
        existing.total_quantity += product.quantity;
        existing.total_weight += product.weight;
        existing.total_value += product.value;
      } else {
        groupedProducts.set(hsCode, {
          hs_code: hsCode,
          total_quantity: product.quantity,
          total_weight: product.weight,
          total_value: product.value,
          made_in: product.made_in || '',
        });
      }
    } else {
      productsWithoutHS.push({
        quantity: product.quantity,
        weight: product.weight,
        value: product.value,
        made_in: product.made_in || '',
      });
    }
  });
  
  // Combine: products with HS code + products without HS code
  const productsWithHS = Array.from(groupedProducts.values());
  const allProducts = [
    ...productsWithHS,
    ...productsWithoutHS.map(p => ({
      hs_code: 'N/A',
      total_quantity: p.quantity,
      total_weight: p.weight,
      total_value: p.value,
      made_in: p.made_in,
    }))
  ];
  
  console.log('Raw products:', rawProducts.length);
  console.log('Aggregated products:', allProducts.length);
  
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.table}>
          
          {/* Title */}
          <View style={styles.titleRow}>
            <Text style={styles.titleText}>SHIPPER'S LETTER OF INSTRUCTION (SLI)</Text>
          </View>

          {/* USPPI Section - Row 1 of 6: Labels */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '30%' }]}><Text>1. USPPI Name:</Text></View>
            <View style={[styles.labelCell, { width: '30%' }]}><Text>3. Freight Location Co Name: (if not box 2):</Text></View>
            <View style={[styles.labelCellNoRight, { width: '40%' }]}><Text>5. Forwarding Agent:</Text></View>
          </View>
          
          {/* USPPI Section - Row 2 of 6 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>Qiqi INC</Text></View>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>PACKABLE / Webb Enterprises</Text></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}>{data.forwarding_agent_line1 || ''}</Text></View>
          </View>
          
          {/* USPPI Section - Row 3 of 6: Labels */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '30%' }]}><Text>2. USPPI Address Including Zip Code:</Text></View>
            <View style={[styles.labelCell, { width: '30%' }]}><Text>4. Freight Location Address (if not box 2):</Text></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}>{data.forwarding_agent_line2 || ''}</Text></View>
          </View>
          
          {/* USPPI Section - Row 4 of 6 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>4625 West Nevso Drive, Suite 2</Text></View>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>1516 Motor Parkway</Text></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}>{data.forwarding_agent_line3 || ''}</Text></View>
          </View>
          
          {/* USPPI Section - Row 5 of 6 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>Las Vegas, NV 89103</Text></View>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>Islandia, New York, 11749</Text></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}>{data.forwarding_agent_line4 || ''}</Text></View>
          </View>
          
          {/* USPPI Section - Row 6 of 6 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>United States</Text></View>
            <View style={[styles.cell, { width: '30%' }]}><Text style={styles.text}>United States</Text></View>
            <View style={[styles.labelCell, { width: '20%' }]}><Text>6. Date of Export:</Text></View>
            <View style={[styles.cellNoRight, { width: '20%' }]}><Text style={styles.text}>{data.date_of_export || new Date().toLocaleDateString('en-US')}</Text></View>
          </View>

          {/* EIN Section - Row 1 of 2 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '20%' }]}><Text>7. USPPI EIN (IRS) No:</Text></View>
            <View style={[styles.cell, { width: '20%' }]}><Text style={styles.text}>86-2244756</Text></View>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>8. Related Party Indicator:</Text></View>
            <View style={[styles.cell, { width: '17.5%', flexDirection: 'row' }]}><CB checked={cs.related_party_related} label="Related" /></View>
            <View style={[styles.cellNoRight, { width: '17.5%', flexDirection: 'row' }]}><CB checked={cs.related_party_non_related} label="Non-Related" /></View>
          </View>
          
          {/* EIN Section - Row 2 of 2 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '20%' }]}><Text>9. USPPI Reference #:</Text></View>
            <View style={[styles.cell, { width: '20%' }]}><Text style={styles.text}>{data.invoice_number || ''}</Text></View>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>10. Routed Export Transaction:</Text></View>
            <View style={[styles.cell, { width: '17.5%', flexDirection: 'row' }]}><CB checked={cs.routed_export_yes} label="Yes" /></View>
            <View style={[styles.cellNoRight, { width: '17.5%', flexDirection: 'row' }]}><CB checked={cs.routed_export_no} label="No" /></View>
          </View>

          {/* Consignee Section - Row 1 of 5: Labels */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '35%' }]}><Text>11. Ultimate Consignee Name & Address:</Text></View>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>12. Ultimate Consignee Type:</Text></View>
            <View style={[styles.labelCellNoRight, { width: '40%' }]}><Text>13. Intermediate Consignee Name & Address:</Text></View>
          </View>
          
          {/* Consignee Section - Rows 2-5 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '35%' }]}><Text style={styles.text}>{data.consignee_name || ''}</Text></View>
            <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}><CB checked={cs.consignee_type_government} label="Government Entity" /></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}></Text></View>
          </View>
          
          <View style={styles.row}>
            <View style={[styles.cell, { width: '35%' }]}><Text style={styles.text}>{data.consignee_address_line1 || ''}</Text></View>
            <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}><CB checked={cs.consignee_type_direct_consumer} label="Direct Consumer" /></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}></Text></View>
          </View>
          
          <View style={styles.row}>
            <View style={[styles.cell, { width: '35%' }]}><Text style={styles.text}>{data.consignee_address_line2 || ''}</Text></View>
            <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}><CB checked={cs.consignee_type_other_unknown} label="Other/Unknown" /></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}></Text></View>
          </View>
          
          <View style={styles.row}>
            <View style={[styles.cell, { width: '35%' }]}><Text style={styles.text}>{data.consignee_address_line3 || ''}</Text></View>
            <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}><CB checked={cs.consignee_type_reseller} label="Re-Seller" /></View>
            <View style={[styles.cellNoRight, { width: '40%' }]}><Text style={styles.text}></Text></View>
          </View>

          {/* Export Details - Row 1 of 3 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>14. State of Origin:</Text></View>
            <View style={[styles.cell, { width: '20%' }]}><Text style={styles.text}>NY</Text></View>
            <View style={[styles.labelCell, { width: '15%' }]}><Text>17. In-Bond Code:</Text></View>
            <View style={[styles.cell, { width: '15%' }]}><Text style={styles.text}>{data.in_bond_code || ''}</Text></View>
            <View style={[styles.labelCellNoRight, { width: '25%' }]}><Text>20. TIB / Carnet?</Text></View>
          </View>
          
          {/* Export Details - Row 2 of 3 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>15. Country of Ultimate Destination:</Text></View>
            <View style={[styles.cell, { width: '20%' }]}><Text style={styles.text}>{data.consignee_country || ''}</Text></View>
            <View style={[styles.labelCell, { width: '15%' }]}><Text>18. Entry Number:</Text></View>
            <View style={[styles.cell, { width: '15%' }]}><Text style={styles.text}></Text></View>
            <View style={[styles.cellNoRight, { width: '25%', flexDirection: 'row' }]}>
              <CB checked={cs.tib_carnet_yes} label="Yes" />
              <CB checked={cs.tib_carnet_no} label="No" />
            </View>
          </View>
          
          {/* Export Details - Row 3 of 3 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>16. Hazardous Material:</Text></View>
            <View style={[styles.cell, { width: '20%', flexDirection: 'row' }]}>
              <CB checked={cs.hazardous_material_yes} label="Yes" />
              <CB checked={cs.hazardous_material_no} label="No" />
            </View>
            <View style={[styles.labelCell, { width: '15%' }]}><Text>19. FTZ Identifier:</Text></View>
            <View style={[styles.cell, { width: '15%' }]}><Text style={styles.text}></Text></View>
            <View style={[styles.cellNoRight, { width: '25%' }]}><Text style={styles.text}></Text></View>
          </View>

          {/* Insurance/Payment Section - Box 25 merged with rows 1+2 */}
          {/* Row 1: Box 21 + Box 25 (starts, spans 2 rows) */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>21. Shipper Requests Insurance:</Text></View>
            <View style={[styles.cell, { width: '20%', flexDirection: 'row' }]}>
              <CB checked={cs.insurance_yes} label="Yes" />
              <CB checked={cs.insurance_no} label="No" />
            </View>
            <View style={[styles.labelCellNoRight, { width: '55%', minHeight: 30, justifyContent: 'center', alignItems: 'center' }]}>
              <Text>25. SHIPPER'S INSTRUCTION in case of inability to deliver consignment as consigned.</Text>
            </View>
          </View>
          
          {/* Row 2: Box 22 only (box 25 continues above) */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>22. Declared Value for Cartage:</Text></View>
            <View style={[styles.cellNoRight, { width: '20%' }]}><Text style={styles.text}></Text></View>
          </View>
          
          {/* Row 3 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>23. Shipper Must Check:</Text></View>
            <View style={[styles.cell, { width: '20%', flexDirection: 'row' }]}>
              <CB checked={cs.payment_prepaid} label="Prepaid" />
              <CB checked={cs.payment_collect} label="Collect" />
            </View>
            <View style={[styles.cell, { width: '27.5%', flexDirection: 'row' }]}><CB checked={cs.abandoned} label="Abandoned" /></View>
            <View style={[styles.cellNoRight, { width: '27.5%', flexDirection: 'row' }]}><CB checked={cs.return_to_shipper} label="Return to Shipper" /></View>
          </View>
          
          {/* Row 4 */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>24. C.O.D Amount:</Text></View>
            <View style={[styles.cell, { width: '20%' }]}><Text style={styles.text}>$</Text></View>
            <View style={[styles.cellNoRight, { width: '55%', flexDirection: 'row' }]}><CB checked={cs.deliver_to} label="Deliver To:" /></View>
          </View>

          {/* Aviation Security Text */}
          <View style={styles.row}>
            <View style={[styles.cellNoRight, { width: '100%' }]}>
              <Text style={styles.textSmall}>
                Cargo items tendered or directed to be tendered by your firm for air transportation are subject to Aviation Security controls for air carriers and when appropriate Other Government Regulations. Copies of all relevant shipping documents showing the cargo's consignee, consignor, description, and other relevant data will be retained on file until the cargo completes its air transportation.
              </Text>
            </View>
          </View>

          {/* TSA Regulations Text */}
          <View style={styles.row}>
            <View style={[styles.cellNoRight, { width: '100%' }]}>
              <Text style={styles.textSmall}>
                I understand that all cargo tendered for transport by air to the nominated is subject to TSA Regulations that may require inspection or screening. I give the nominated freight forwarder my permission to inspect or screen all cargo tendered on behalf of company. My consent will remain in effect until revoked in writing.
              </Text>
            </View>
          </View>

          {/* Instructions to Forwarder - FLEX */}
          <View style={{ flex: 1, minHeight: 30, borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid' }}>
            <View style={[styles.cellNoRight, { width: '100%' }]}>
              <Text style={styles.textBold}>26. Instructions to Forwarder:</Text>
              <Text style={styles.text}>{data.instructions_to_forwarder || ''}</Text>
            </View>
          </View>

          {/* Products Table Header - No double border */}
          <View style={{ flexDirection: 'row', minHeight: 15, borderBottomWidth: 0.5, borderBottomColor: '#000', borderBottomStyle: 'solid' }}>
            <View style={[styles.labelCell, { width: '8%' }]}><Text>27. D/F</Text></View>
            <View style={[styles.labelCell, { width: '16%' }]}><Text>28. Schedule B / HTS Commercial Commodity Desc</Text></View>
            <View style={[styles.labelCell, { width: '10%' }]}><Text>28. SchB/HTS QTY / UOM (if applicable)</Text></View>
            <View style={[styles.labelCell, { width: '11%' }]}><Text>30. DDTC Quantity and DDTC Unit of Measure</Text></View>
            <View style={[styles.labelCell, { width: '10%' }]}><Text>31. Shipping Weight (in Kilos)</Text></View>
            <View style={[styles.labelCell, { width: '10%' }]}><Text>32. ECCN EAR99 or USML Category #</Text></View>
            <View style={[styles.labelCell, { width: '7%' }]}><Text>33. S M E (Y/N)</Text></View>
            <View style={[styles.labelCell, { width: '11%' }]}><Text>34. NLR, Export License No, License Exception Symbol, DDTC Exemption No, DDTC ACM No.,</Text></View>
            <View style={[styles.labelCell, { width: '10%' }]}><Text>35. Value at the Port of Export (US Dollars)</Text></View>
            <View style={[styles.labelCellNoRight, { width: '7%' }]}><Text>36. License Value by item (if applicable) (US Dollars)</Text></View>
          </View>

          {/* Product Rows - Only actual products, no empty rows */}
          {allProducts.map((product, index) => (
            <View key={index} style={styles.row}>
              <View style={[styles.cell, { width: '8%' }]}><Text style={styles.text}>{getDorF(product.made_in)}</Text></View>
              <View style={[styles.cell, { width: '16%' }]}><Text style={styles.text}>{product.hs_code}</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text style={styles.text}>{product.total_quantity.toLocaleString('en-US')}</Text></View>
              <View style={[styles.cell, { width: '11%' }]}><Text style={styles.text}>Each</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text style={styles.text}>{product.total_weight.toFixed(2)} kg</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text style={styles.text}>EAR99</Text></View>
              <View style={[styles.cell, { width: '7%' }]}><Text style={styles.text}></Text></View>
              <View style={[styles.cell, { width: '11%' }]}><Text style={styles.text}>NLR</Text></View>
              <View style={[styles.cell, { width: '10%' }]}><Text style={styles.text}>${product.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></View>
              <View style={[styles.cellNoRight, { width: '7%' }]}><Text style={styles.text}></Text></View>
            </View>
          ))}

          {/* DDTC Registration */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '30%' }]}><Text>37. DDTC Applicant Registration Number:</Text></View>
            <View style={[styles.cell, { width: '20%' }]}><Text style={styles.text}></Text></View>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>38. Eligible Party Certification:</Text></View>
            <View style={[styles.cellNoRight, { width: '25%', flexDirection: 'row' }]}>
              <CB checked={cs.eligible_party_yes} label="Yes" />
              <CB checked={cs.eligible_party_no} label="No" />
            </View>
          </View>

          {/* Checkbox 39 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '3%', flexDirection: 'row' }]}>
              <Text style={styles.text}>39</Text>
            </View>
            <View style={[styles.cellNoRight, { width: '97%', flexDirection: 'row' }]}>
              <CB checked={cs.checkbox_39} label="Check here if there are any remaining non-licensable Schedule B / HTS Numbers that are valued $2500.00 or less and that do not otherwise require AES filing." />
            </View>
          </View>

          {/* Checkbox 40 */}
          <View style={styles.row}>
            <View style={[styles.cell, { width: '3%', flexDirection: 'row' }]}>
              <Text style={styles.text}>40</Text>
            </View>
            <View style={[styles.cellNoRight, { width: '97%', flexDirection: 'row' }]}>
              <CB checked={cs.checkbox_40} label="Check here if the USPPI authorizes the above named forwarder to Act as authorized agent for export control, U.S. Census Bureau (Census Bureau) reporting, and U.S. Customs and Border Protection (CBP) purposes. Also, to prepare and transmit any Electronic Export Information (EEI) or other documents or records required to be filed by the Census Bureau, CBP, the Bureau of Industry and Security, or any other U.S. Government agency, and perform any other act that may be required by law or regulation in connection with the exportation or transportation of any goods shipped or consigned by or to the USPPI, and to receive or ship any goods on behalf of the USPPI." />
            </View>
          </View>

          {/* Certification */}
          <View style={styles.row}>
            <View style={[styles.cellNoRight, { width: '100%' }]}>
              <Text style={styles.textSmall}>
                41. I certify that the statements made and all information contained herein are true and correct. I understand that civil and criminal penalties, including forfeiture and sale, may be imposed for making false and fraudulent statements herein, failing to provide the requested information or for violation of U.S. laws on exportation.
              </Text>
            </View>
          </View>

          {/* Email and Phone */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '25%' }]}><Text>42. USPPI E-mail Address:</Text></View>
            <View style={[styles.cell, { width: '25%' }]}><Text style={styles.text}>aaron@qiqiglobal.com</Text></View>
            <View style={[styles.labelCell, { width: '30%' }]}><Text>43. USPPI Telephone No.:</Text></View>
            <View style={[styles.cellNoRight, { width: '20%' }]}><Text style={styles.text}>00972-54-6248884</Text></View>
          </View>

          {/* Printed Name */}
          <View style={styles.row}>
            <View style={[styles.labelCell, { width: '50%' }]}><Text>44. Printed Name of Duly authorized officer or employee:</Text></View>
            <View style={[styles.cellNoRight, { width: '50%' }]}><Text style={styles.text}>Aaron Lisani</Text></View>
          </View>

          {/* Signature Row - with overlay signature */}
          <View style={[styles.row, { height: 15, position: 'relative' }]}>
            <View style={[styles.labelCell, { width: '15%' }]}><Text>45. Signature:</Text></View>
            <View style={[styles.cell, { width: '30%' }]}>
              <Text style={styles.text}> </Text>
            </View>
            <View style={[styles.labelCell, { width: '15%' }]}><Text>46. Title:</Text></View>
            <View style={[styles.cell, { width: '15%' }]}><Text style={styles.text}>CPO</Text></View>
            <View style={[styles.labelCell, { width: '10%' }]}><Text>47. Date:</Text></View>
            <View style={[styles.cellNoRight, { width: '15%' }]}><Text style={styles.text}>{data.sli_date || new Date().toLocaleDateString()}</Text></View>
            
            {/* Signature image overlays the row */}
            <Image 
              src="/templates/Sig.png" 
              style={{ 
                position: 'absolute', 
                height: 45, // 50% bigger (was 30)
                width: 90, // 50% bigger (was 60)
                left: 85, // 15% of 540 = 81pts
                top: -15, // Overlay upward to span multiple rows
              }} 
            />
          </View>

          {/* Electronic Signature */}
          <View style={styles.row}>
            <View style={[styles.cellNoRight, { width: '100%', flexDirection: 'row' }]}>
              <CB checked={cs.checkbox_48} label="48. Check here to validate Electronic Signature. Electronic signatures must be typed in all capital letters in Box 38 in order to be valid." />
            </View>
          </View>

          {/* Important Notice - Last row, no bottom border */}
          <View style={styles.rowNoBottom}>
            <View style={[styles.cellNoRight, { width: '100%' }]}>
              <Text style={styles.textSmall}>
                Important: The shipment herein described is accepted in apparent good order (except as noted) subject to all terms and conditions of this contract on this letter of instruction. Liability for this shipment covered by this letter of instruction does not extend beyond its actual air movement and the territorial extent of the terminal area defined in our tariffs.
              </Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
};
