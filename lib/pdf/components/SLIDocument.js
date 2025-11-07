import * as React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';

const LETTER = {
  page: { width: 612, height: 792 },
  margin: 36,
  live: { width: 540, height: 720 },
};

// Styles
const styles = StyleSheet.create({
  page: {
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
    lineHeight: 1.1,
  },
  
  masterTable: {
    width: LETTER.live.width,
    height: LETTER.live.height,
    border: '0.5pt solid black',
  },
  
  // Row that contains a full-width cell
  fullRow: {
    borderBottom: '0.5pt solid black',
  },
  
  titleCell: {
    padding: 4,
    textAlign: 'center',
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  
  textCell: {
    padding: 2,
    fontSize: 6.5,
    lineHeight: 1.2,
  },
  
  // Nested table row
  nestedRow: {
    flexDirection: 'row',
    borderBottom: '0.5pt solid black',
  },
  
  nestedRowLast: {
    flexDirection: 'row',
  },
  
  // Cell with right border
  cell: {
    borderRight: '0.5pt solid black',
    padding: 2,
    fontSize: 7.5,
  },
  
  // Cell without right border (last cell in row)
  cellLast: {
    padding: 2,
    fontSize: 7.5,
  },
  
  labelCell: {
    padding: 2,
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
  },
  
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  
  checkbox: {
    width: 6,
    height: 6,
    border: '0.5pt solid black',
    marginRight: 2,
  },
  
  checkboxChecked: {
    width: 6,
    height: 6,
    border: '0.5pt solid black',
    backgroundColor: '#000000',
    marginRight: 2,
  },
});

// Checkbox component
const CB = ({ checked, label }) => (
  <View style={styles.checkboxRow}>
    <View style={checked ? styles.checkboxChecked : styles.checkbox} />
    <Text style={{ fontSize: 7 }}>{label}</Text>
  </View>
);

export const SLIDocument = ({ data }) => {
  const cs = data.checkbox_states || {};
  const products = data.products || [];
  
  // Calculate heights
  const fixedHeight = 600; // All fixed rows combined
  const productRowHeight = 12;
  const productTableHeight = productRowHeight * (products.length + 1); // +1 for header
  const instructionsHeight = LETTER.live.height - fixedHeight - productTableHeight;
  
  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={styles.masterTable}>
          
          {/* Row 1: Title */}
          <View style={styles.fullRow}>
            <Text style={styles.titleCell}>SHIPPER'S LETTER OF INSTRUCTION (SLI)</Text>
          </View>

          {/* Row 2: USPPI Info - 3 cols x 6 rows */}
          <View style={styles.fullRow}>
            <View>
              <View style={styles.nestedRow}>
                <View style={[styles.labelCell, { width: '30%' }]}><Text>1. USPPI Name:</Text></View>
                <View style={[styles.labelCell, { width: '30%' }]}><Text>3. Freight Location Co Name: (if not box 2):</Text></View>
                <View style={[styles.labelCell, { width: '40%' }]}><Text>5. Forwarding Agent:</Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.cell, { width: '30%' }]}><Text>Qiqi INC</Text></View>
                <View style={[styles.cell, { width: '30%' }]}><Text>PACKABLE / Webb Enterprises</Text></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text>{data.forwarding_agent_line1 || ''}</Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.labelCell, { width: '30%' }]}><Text>2. USPPI Address Including Zip Code:</Text></View>
                <View style={[styles.labelCell, { width: '30%' }]}><Text>4. Freight Location Address (if not box 2):</Text></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text>{data.forwarding_agent_line2 || ''}</Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.cell, { width: '30%' }]}><Text>4625 West Nevso Drive, Suite 2</Text></View>
                <View style={[styles.cell, { width: '30%' }]}><Text>1516 Motor Parkway</Text></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text>{data.forwarding_agent_line3 || ''}</Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.cell, { width: '30%' }]}><Text>Las Vegas, NV 89103</Text></View>
                <View style={[styles.cell, { width: '30%' }]}><Text>Islandia, New York, 11749</Text></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text>{data.forwarding_agent_line4 || ''}</Text></View>
              </View>
              <View style={styles.nestedRowLast}>
                <View style={[styles.cell, { width: '30%' }]}><Text>United States</Text></View>
                <View style={[styles.cell, { width: '30%' }]}><Text>United States</Text></View>
                <View style={[styles.cellLast, { width: '40%', flexDirection: 'row' }]}>
                  <View style={[styles.labelCell, { width: '50%', borderRight: '0.5pt solid black' }]}><Text>6. Date of Export:</Text></View>
                  <View style={[styles.cellLast, { width: '50%' }]}><Text>{data.date_of_export || ''}</Text></View>
                </View>
              </View>
            </View>
          </View>

          {/* Row 3: EIN and Reference - 5 cols x 2 rows */}
          <View style={styles.fullRow}>
            <View>
              <View style={styles.nestedRow}>
                <View style={[styles.labelCell, { width: '20%' }]}><Text>7. USPPI EIN (IRS) No:</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text>86-2244756</Text></View>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>8. Related Party Indicator:</Text></View>
                <View style={[styles.cell, { width: '17.5%' }]}><CB checked={cs.related} label="Related" /></View>
                <View style={[styles.cellLast, { width: '17.5%' }]}><CB checked={!cs.related} label="Non-Related" /></View>
              </View>
              <View style={styles.nestedRowLast}>
                <View style={[styles.labelCell, { width: '20%' }]}><Text>9. USPPI Reference #:</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text>{data.invoice_number || ''}</Text></View>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>10. Routed Export Transaction:</Text></View>
                <View style={[styles.cell, { width: '17.5%' }]}><CB checked={cs.routed_yes} label="Yes" /></View>
                <View style={[styles.cellLast, { width: '17.5%' }]}><CB checked={!cs.routed_yes} label="No" /></View>
              </View>
            </View>
          </View>

          {/* Row 4: Consignee - 3 cols x 5 rows */}
          <View style={styles.fullRow}>
            <View>
              <View style={styles.nestedRow}>
                <View style={[styles.labelCell, { width: '35%' }]}><Text>11. Ultimate Consignee Name & Address:</Text></View>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>12. Ultimate Consignee Type:</Text></View>
                <View style={[styles.labelCell, { width: '40%' }]}><Text>13. Intermediate Consignee Name & Address:</Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.cell, { width: '35%' }]}><Text>{data.consignee_name || ''}</Text></View>
                <View style={[styles.cell, { width: '25%' }]}><CB checked={cs.govt_entity} label="Government Entity" /></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text></Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.cell, { width: '35%' }]}><Text>{data.consignee_address_line1 || ''}</Text></View>
                <View style={[styles.cell, { width: '25%' }]}><CB checked={cs.direct_consumer} label="Direct Consumer" /></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text></Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.cell, { width: '35%' }]}><Text>{data.consignee_address_line2 || ''}</Text></View>
                <View style={[styles.cell, { width: '25%' }]}><CB checked={cs.other_unknown} label="Other/Unknown" /></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text></Text></View>
              </View>
              <View style={styles.nestedRowLast}>
                <View style={[styles.cell, { width: '35%' }]}><Text>{data.consignee_address_line3 || ''}</Text></View>
                <View style={[styles.cell, { width: '25%' }]}><CB checked={cs.reseller} label="Re-Seller" /></View>
                <View style={[styles.cellLast, { width: '40%' }]}><Text></Text></View>
              </View>
            </View>
          </View>

          {/* Row 5: Export Details - 5 cols x 3 rows */}
          <View style={styles.fullRow}>
            <View>
              <View style={styles.nestedRow}>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>14. State of Origin:</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text>NY</Text></View>
                <View style={[styles.labelCell, { width: '15%' }]}><Text>17. In-Bond Code:</Text></View>
                <View style={[styles.cell, { width: '15%' }]}><Text>{data.in_bond_code || ''}</Text></View>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>20. TIB / Carnet?</Text></View>
              </View>
              <View style={styles.nestedRow}>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>15. Country of Ultimate Destination:</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text>{data.consignee_country || ''}</Text></View>
                <View style={[styles.labelCell, { width: '15%' }]}><Text>18. Entry Number:</Text></View>
                <View style={[styles.cell, { width: '15%' }]}><Text></Text></View>
                <View style={[styles.cellLast, { width: '25%', flexDirection: 'row' }]}>
                  <CB checked={cs.tib_yes} label="Yes" />
                  <CB checked={!cs.tib_yes} label="No" />
                </View>
              </View>
              <View style={styles.nestedRowLast}>
                <View style={[styles.labelCell, { width: '20%' }]}><Text>16. Hazardous Material:</Text></View>
                <View style={[styles.cell, { width: '25%', flexDirection: 'row' }]}>
                  <CB checked={cs.hazmat_yes} label="Yes" />
                  <CB checked={!cs.hazmat_yes} label="No" />
                </View>
                <View style={[styles.labelCell, { width: '15%' }]}><Text>19. FTZ Identifier:</Text></View>
                <View style={[styles.cell, { width: '15%' }]}><Text></Text></View>
                <View style={[styles.cellLast, { width: '25%' }]}><Text></Text></View>
              </View>
            </View>
          </View>

          {/* Row 6: Insurance/Payment - Complex with rowspan/colspan simulation */}
          <View style={styles.fullRow}>
            <View style={{ height: 48 }}>
              {/* Row 1 */}
              <View style={[styles.nestedRow, { height: 12 }]}>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>21. Shipper Requests Insurance:</Text></View>
                <View style={[styles.cell, { width: '20%', flexDirection: 'row' }]}>
                  <CB checked={cs.insurance_yes} label="Yes" />
                  <CB checked={!cs.insurance_yes} label="No" />
                </View>
                <View style={[styles.labelCell, { width: '55%', height: 24, borderRight: 'none', borderBottom: 'none' }]}>
                  <Text>25. SHIPPER'S INSTRUCTION in case of inability to deliver consignment as consigned.</Text>
                </View>
              </View>
              
              {/* Row 2 */}
              <View style={[styles.nestedRow, { height: 12 }]}>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>22. Declared Value for Cartage:</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text></Text></View>
              </View>
              
              {/* Row 3 */}
              <View style={[styles.nestedRow, { height: 12 }]}>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>23. Shipper Must Check:</Text></View>
                <View style={[styles.cell, { width: '20%', flexDirection: 'row' }]}>
                  <CB checked={cs.prepaid} label="Prepaid" />
                  <CB checked={cs.collect} label="Collect" />
                </View>
                <View style={[styles.cell, { width: '27.5%' }]}><CB checked={cs.abandoned} label="Abandoned" /></View>
                <View style={[styles.cellLast, { width: '27.5%' }]}><CB checked={cs.return_to_shipper} label="Return to Shipper" /></View>
              </View>
              
              {/* Row 4 */}
              <View style={styles.nestedRowLast}>
                <View style={[styles.labelCell, { width: '25%' }]}><Text>24. C.O.D Amount:</Text></View>
                <View style={[styles.cell, { width: '20%' }]}><Text>$</Text></View>
                <View style={[styles.cellLast, { width: '55%' }]}><CB checked={cs.deliver_to} label="Deliver To:" /></View>
              </View>
            </View>
          </View>

          {/* Row 7: Aviation Security */}
          <View style={styles.fullRow}>
            <Text style={styles.textCell}>
              Cargo items tendered or directed to be tendered by your firm for air transportation are subject to Aviation Security controls for air carriers and when appropriate Other Government Regulations. Copies of all relevant shipping documents showing the cargo's consignee, consignor, description, and other relevant data will be retained on file until the cargo completes its air transportation.
            </Text>
          </View>

          {/* Row 8: TSA Regulations */}
          <View style={styles.fullRow}>
            <Text style={styles.textCell}>
              I understand that all cargo tendered for transport by air to the nominated is subject to TSA Regulations that may require inspection or screening. I give the nominated freight forwarder my permission to inspect or screen all cargo tendered on behalf of company. My consent will remain in effect until revoked in writing.
            </Text>
          </View>

          {/* Row 9: Instructions to Forwarder - FLEX HEIGHT */}
          <View style={[styles.fullRow, { height: instructionsHeight, minHeight: 30 }]}>
            <View style={{ padding: 2 }}>
              <Text style={styles.labelCell}>26. Instructions to Forwarder:</Text>
              <Text style={styles.textCell}>{data.instructions_to_forwarder || ''}</Text>
            </View>
          </View>

          {/* Row 10: Products Table Header */}
          <View style={[styles.fullRow, { height: productRowHeight }]}>
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.labelCell, { width: '8%' }]}><Text>27. D/F</Text></View>
              <View style={[styles.labelCell, { width: '18%' }]}><Text>28. Schedule B / HTS</Text></View>
              <View style={[styles.labelCell, { width: '10%' }]}><Text>28. Qty/UOM</Text></View>
              <View style={[styles.labelCell, { width: '12%' }]}><Text>30. DDTC Qty/UOM</Text></View>
              <View style={[styles.labelCell, { width: '10%' }]}><Text>31. Weight (kg)</Text></View>
              <View style={[styles.labelCell, { width: '10%' }]}><Text>32. ECCN</Text></View>
              <View style={[styles.labelCell, { width: '8%' }]}><Text>33. SME</Text></View>
              <View style={[styles.labelCell, { width: '12%' }]}><Text>34. License</Text></View>
              <View style={[styles.labelCell, { width: '12%', borderRight: 'none' }]}><Text>35. Value (USD)</Text></View>
            </View>
          </View>

          {/* Product Rows */}
          {products.map((product, i) => (
            <View key={i} style={[{ height: productRowHeight }, i < products.length - 1 ? styles.fullRow : {}]}>
              <View style={{ flexDirection: 'row' }}>
                <View style={[styles.cell, { width: '8%' }]}><Text>30</Text></View>
                <View style={[styles.cell, { width: '18%' }]}><Text>{product.hs_code || 'N/A'}</Text></View>
                <View style={[styles.cell, { width: '10%' }]}><Text>{product.quantity} PCS</Text></View>
                <View style={[styles.cell, { width: '12%' }]}><Text></Text></View>
                <View style={[styles.cell, { width: '10%' }]}><Text>{(product.weight || 0).toFixed(2)}</Text></View>
                <View style={[styles.cell, { width: '10%' }]}><Text>EAR99</Text></View>
                <View style={[styles.cell, { width: '8%' }]}><Text></Text></View>
                <View style={[styles.cell, { width: '12%' }]}><Text></Text></View>
                <View style={[styles.cellLast, { width: '12%' }]}><Text>${(product.value || 0).toFixed(2)}</Text></View>
              </View>
            </View>
          ))}

          {/* Row 11: DDTC Registration */}
          <View style={styles.fullRow}>
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.labelCell, { width: '30%' }]}><Text>37. DDTC Applicant Registration Number:</Text></View>
              <View style={[styles.cell, { width: '20%' }]}><Text></Text></View>
              <View style={[styles.labelCell, { width: '25%' }]}><Text>38. Eligible Party Certification:</Text></View>
              <View style={[styles.cellLast, { width: '25%', flexDirection: 'row' }]}>
                <CB checked={cs.eligible_yes} label="Yes" />
                <CB checked={!cs.eligible_yes} label="No" />
              </View>
            </View>
          </View>

          {/* Row 12: Checkboxes 39-40 */}
          <View style={styles.fullRow}>
            <View>
              <View style={[styles.nestedRow, { height: 12 }]}>
                <View style={[styles.cell, { width: '8%' }]}><Text>39</Text></View>
                <View style={[styles.cellLast, { width: '92%' }]}><CB checked={cs.cb_39} label="Check here if there are any remaining non-licensable Schedule B / HTS Numbers that are valued $2500.00 or less and that do not otherwise require AES filing." /></View>
              </View>
              <View style={styles.nestedRowLast}>
                <View style={[styles.cell, { width: '8%' }]}><Text>40</Text></View>
                <View style={[styles.cellLast, { width: '92%' }]}><CB checked={cs.cb_40} label="Check here if the USPPI authorizes the above named forwarder to Act as authorized agent for export control, U.S. Census Bureau (Census Bureau) reporting, and U.S. Customs and Border Protection (CBP) purposes..." /></View>
              </View>
            </View>
          </View>

          {/* Row 13: Certification */}
          <View style={styles.fullRow}>
            <Text style={styles.textCell}>
              41. I certify that the statements made and all information contained herein are true and correct. I understand that civil and criminal penalties, including forfeiture and sale, may be imposed for making false and fraudulent statements herein, failing to provide the requested information or for violation of U.S. laws on exportation.
            </Text>
          </View>

          {/* Row 14: Email and Phone */}
          <View style={styles.fullRow}>
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.labelCell, { width: '25%' }]}><Text>42. USPPI E-mail Address:</Text></View>
              <View style={[styles.cell, { width: '25%' }]}><Text>aaron@qiqiglobal.com</Text></View>
              <View style={[styles.labelCell, { width: '30%' }]}><Text>43. USPPI Telephone No.:</Text></View>
              <View style={[styles.cellLast, { width: '20%' }]}><Text>00972-54-6248884</Text></View>
            </View>
          </View>

          {/* Row 15: Printed Name */}
          <View style={styles.fullRow}>
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.labelCell, { width: '50%' }]}><Text>44. Printed Name of Duly authorized officer or employee:</Text></View>
              <View style={[styles.cellLast, { width: '50%' }]}><Text>Aaron Lisani</Text></View>
            </View>
          </View>

          {/* Row 16: Signature */}
          <View style={styles.fullRow}>
            <View style={{ flexDirection: 'row', height: 24 }}>
              <View style={[styles.labelCell, { width: '15%' }]}><Text>45. Signature:</Text></View>
              <View style={[styles.cell, { width: '30%' }]}>
                <Image src="/templates/Sig.png" style={{ height: 20 }} />
              </View>
              <View style={[styles.labelCell, { width: '15%' }]}><Text>46. Title:</Text></View>
              <View style={[styles.cell, { width: '15%' }]}><Text>CPO</Text></View>
              <View style={[styles.labelCell, { width: '10%' }]}><Text>47. Date:</Text></View>
              <View style={[styles.cellLast, { width: '15%' }]}><Text>{data.sli_date || new Date().toLocaleDateString()}</Text></View>
            </View>
          </View>

          {/* Row 17: Electronic Signature */}
          <View style={styles.fullRow}>
            <View style={{ padding: 2, flexDirection: 'row' }}>
              <CB checked={cs.electronic_sig} label="48. Check here to validate Electronic Signature. Electronic signatures must be typed in all capital letters in Box 38 in order to be valid." />
            </View>
          </View>

          {/* Row 18: Important Notice - NO BORDER BOTTOM */}
          <View style={{ borderBottom: 'none' }}>
            <Text style={styles.textCell}>
              Important: The shipment herein described is accepted in apparent good order (except as noted) subject to all terms and conditions of this contract on this letter of instruction. Liability for this shipment covered by this letter of instruction does not extend beyond its actual air movement and the territorial extent of the terminal area defined in our tariffs.
            </Text>
          </View>

        </View>
      </Page>
    </Document>
  );
};
