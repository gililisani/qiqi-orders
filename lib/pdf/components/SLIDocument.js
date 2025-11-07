import * as React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';

const LETTER = {
  page: { width: 612, height: 792 },
  margin: 36,
  live: { width: 540, height: 720 },
};

// --- Table primitives (CSS table layout) ---
const t = StyleSheet.create({
  table: { display: "table", width: "auto", borderStyle: "solid" },
  row: { display: "table-row" },
  cell: { display: "table-cell", verticalAlign: "top" },
  text: { fontSize: 7.5 },
});

function Table({ children, border = 0.5, style }) {
  const bw = typeof border === 'number' ? border : 0;
  const base = {
    borderStyle: 'solid',
    borderWidth: bw,
    borderColor: '#000',
  };
  return <View style={[t.table, style || {}, base]}>{children}</View>;
}

function Tr({ children, top = 0, bottom = 0.5, style }) {
  const bwTop = typeof top === 'number' ? top : 0;
  const bwBottom = typeof bottom === 'number' ? bottom : 0;

  const base = {
    borderStyle: 'solid',
    borderTopWidth: bwTop,
    borderBottomWidth: bwBottom,
    borderTopColor: '#000',
    borderBottomColor: '#000',
  };

  return (
    <View style={[t.row, style || {}, base]}>
      {children}
    </View>
  );
}

function Td({
  children,
  right = 0.5,
  left = 0,
  pad = 2,
  style,
  align = 'left',
  valign = 'top',       // <- 'top'/'center'/'bottom' (not 'middle')
  width,
  bg,
}) {
  const bwRight = typeof right === 'number' ? right : 0;
  const bwLeft = typeof left === 'number' ? left : 0;

  const base = {
    borderStyle: 'solid',
    borderRightWidth: bwRight,
    borderLeftWidth: bwLeft,
    borderRightColor: '#000',
    borderLeftColor: '#000',
    padding: pad,
    textAlign: align,
    verticalAlign: valign,
  };
  if (width !== undefined) base.width = width;
  if (bg !== undefined) base.backgroundColor = bg;

  return (
    <View style={[t.cell, style || {}, base]}>
      {typeof children === 'string' ? <Text style={t.text}>{children}</Text> : children}
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  page: {
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
  },
  
  titleText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  
  text: {
    fontSize: 7.5,
  },
  
  textSmall: {
    fontSize: 6.5,
  },
  
  textBold: {
    fontSize: 6.5,
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
        
        {/* Master Table - contains everything */}
        <Table border={0.5} style={{ width: LETTER.live.width }}>
          
          {/* Row 1: Title */}
          <Tr bottom={0.5}>
            <Td right={0} pad={4} style={{ height: 40, textAlign: 'center', verticalAlign: 'middle' }}>
              <Text style={styles.titleText}>SHIPPER'S LETTER OF INSTRUCTION (SLI)</Text>
            </Td>
          </Tr>

          {/* Row 2: USPPI Info Section (nested table: 3 columns, 6 rows) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="30%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>1. USPPI Name:</Text></Td>
                  <Td width="30%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>3. Freight Location Co Name: (if not box 2):</Text></Td>
                  <Td width="40%" bg="#def0fd" right={0}><Text style={styles.textBold}>5. Forwarding Agent:</Text></Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="30%" right={0.5}>Qiqi INC</Td>
                  <Td width="30%" right={0.5}>PACKABLE / Webb Enterprises</Td>
                  <Td width="40%" right={0}>{data.forwarding_agent_line1 || ''}</Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="30%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>2. USPPI Address Including Zip Code:</Text></Td>
                  <Td width="30%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>4. Freight Location Address (if not box 2):</Text></Td>
                  <Td width="40%" right={0}>{data.forwarding_agent_line2 || ''}</Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="30%" right={0.5}>4625 West Nevso Drive, Suite 2</Td>
                  <Td width="30%" right={0.5}>1516 Motor Parkway</Td>
                  <Td width="40%" right={0}>{data.forwarding_agent_line3 || ''}</Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="30%" right={0.5}>Las Vegas, NV 89103</Td>
                  <Td width="30%" right={0.5}>Islandia, New York, 11749</Td>
                  <Td width="40%" right={0}>{data.forwarding_agent_line4 || ''}</Td>
                </Tr>
                <Tr bottom={0}>
                  <Td width="30%" right={0.5}>United States</Td>
                  <Td width="30%" right={0.5}>United States</Td>
                  <Td width="40%" right={0} pad={0}>
                    <Table border={0}>
                      <Tr bottom={0}>
                        <Td width="50%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>6. Date of Export:</Text></Td>
                        <Td width="50%" right={0}>{data.date_of_export || new Date().toLocaleDateString('en-US')}</Td>
                      </Tr>
                    </Table>
                  </Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 3: EIN and Reference (nested table: 5 columns, 2 rows) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="20%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>7. USPPI EIN (IRS) No:</Text></Td>
                  <Td width="20%" right={0.5}>86-2244756</Td>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>8. Related Party Indicator:</Text></Td>
                  <Td width="15%" right={0.5}><CB checked={cs.related_party_related} label="Related" /></Td>
                  <Td width="20%" right={0}><CB checked={cs.related_party_non_related} label="Non-Related" /></Td>
                </Tr>
                <Tr bottom={0}>
                  <Td width="20%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>9. USPPI Reference #:</Text></Td>
                  <Td width="20%" right={0.5}>{data.invoice_number || ''}</Td>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>10. Routed Export Transaction:</Text></Td>
                  <Td width="15%" right={0.5}><CB checked={cs.routed_export_yes} label="Yes" /></Td>
                  <Td width="20%" right={0}><CB checked={cs.routed_export_no} label="No" /></Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 4: Consignee Section (nested table: 3 columns, 5 rows) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="35%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>11. Ultimate Consignee Name & Address:</Text></Td>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>12. Ultimate Consignee Type:</Text></Td>
                  <Td width="40%" bg="#def0fd" right={0}><Text style={styles.textBold}>13. Intermediate Consignee Name & Address:</Text></Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="35%" right={0.5}>{data.consignee_name || ''}</Td>
                  <Td width="25%" right={0.5}><CB checked={cs.consignee_type_government} label="Government Entity" /></Td>
                  <Td width="40%" right={0}></Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="35%" right={0.5}>{data.consignee_address_line1 || ''}</Td>
                  <Td width="25%" right={0.5}><CB checked={cs.consignee_type_direct_consumer} label="Direct Consumer" /></Td>
                  <Td width="40%" right={0}></Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="35%" right={0.5}>{data.consignee_address_line2 || ''}</Td>
                  <Td width="25%" right={0.5}><CB checked={cs.consignee_type_other_unknown} label="Other/Unknown" /></Td>
                  <Td width="40%" right={0}></Td>
                </Tr>
                <Tr bottom={0}>
                  <Td width="35%" right={0.5}>{data.consignee_address_line3 || ''}</Td>
                  <Td width="25%" right={0.5}><CB checked={cs.consignee_type_reseller} label="Re-Seller" /></Td>
                  <Td width="40%" right={0}></Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 5: Export Details (nested table: 5 columns, 3 rows) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>14. State of Origin:</Text></Td>
                  <Td width="20%" right={0.5}>NY</Td>
                  <Td width="15%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>17. In-Bond Code:</Text></Td>
                  <Td width="15%" right={0.5}>{data.in_bond_code || ''}</Td>
                  <Td width="25%" bg="#def0fd" right={0}><Text style={styles.textBold}>20. TIB / Carnet?</Text></Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>15. Country of Ultimate Destination:</Text></Td>
                  <Td width="20%" right={0.5}>{data.consignee_country || ''}</Td>
                  <Td width="15%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>18. Entry Number:</Text></Td>
                  <Td width="15%" right={0.5}></Td>
                  <Td width="25%" right={0}>
                    <CB checked={cs.tib_carnet_yes} label="Yes" />
                    <CB checked={cs.tib_carnet_no} label="No" />
                  </Td>
                </Tr>
                <Tr bottom={0}>
                  <Td width="20%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>16. Hazardous Material:</Text></Td>
                  <Td width="25%" right={0.5} style={{ wordSpacing: 15 }}>
                    <CB checked={cs.hazardous_material_yes} label="Yes" />
                    <CB checked={cs.hazardous_material_no} label="No" />
                  </Td>
                  <Td width="15%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>19. FTZ Identifier:</Text></Td>
                  <Td width="15%" right={0.5}></Td>
                  <Td width="25%" right={0}></Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 6: Insurance/Payment Section (nested table with rowspan/colspan) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>21. Shipper Requests Insurance:</Text></Td>
                  <Td width="20%" right={0.5} style={{ wordSpacing: 15 }}>
                    <CB checked={cs.insurance_yes} label="Yes" />
                    <CB checked={cs.insurance_no} label="No" />
                  </Td>
                  <Td width="55%" bg="#def0fd" right={0} style={{ height: 30 }}>
                    <Text style={styles.textBold}>25. SHIPPER'S INSTRUCTION in case of inability to deliver consignment as consigned.</Text>
                  </Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>22. Declared Value for Cartage:</Text></Td>
                  <Td width="20%" right={0}></Td>
                </Tr>
                <Tr bottom={0.5}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>23. Shipper Must Check:</Text></Td>
                  <Td width="20%" right={0.5}>
                    <CB checked={cs.payment_prepaid} label="Prepaid" />
                    <CB checked={cs.payment_collect} label="Collect" />
                  </Td>
                  <Td width="25%" right={0.5}><CB checked={cs.abandoned} label="Abandoned" /></Td>
                  <Td width="30%" right={0}><CB checked={cs.return_to_shipper} label="Return to Shipper" /></Td>
                </Tr>
                <Tr bottom={0}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>24. C.O.D Amount:</Text></Td>
                  <Td width="20%" right={0.5}>$</Td>
                  <Td width="55%" right={0} pad={0}>
                    <Table border={0}>
                      <Tr bottom={0}>
                        <Td width="100%" right={0}><CB checked={cs.deliver_to} label="Deliver To:" /></Td>
                      </Tr>
                    </Table>
                  </Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 7: Aviation Security Text */}
          <Tr bottom={0.5}>
            <Td right={0}>
              <Text style={styles.textSmall}>
                Cargo items tendered or directed to be tendered by your firm for air transportation are subject to Aviation Security controls for air carriers and when appropriate Other Government Regulations. Copies of all relevant shipping documents showing the cargo's consignee, consignor, description, and other relevant data will be retained on file until the cargo completes its air transportation.
              </Text>
            </Td>
          </Tr>

          {/* Row 8: TSA Regulations Text */}
          <Tr bottom={0.5}>
            <Td right={0}>
              <Text style={styles.textSmall}>
                I understand that all cargo tendered for transport by air to the nominated is subject to TSA Regulations that may require inspection or screening. I give the nominated freight forwarder my permission to inspect or screen all cargo tendered on behalf of company. My consent will remain in effect until revoked in writing.
              </Text>
            </Td>
          </Tr>

          {/* Row 9: Instructions to Forwarder */}
          <Tr bottom={0.5}>
            <Td right={0}>
              <Text style={styles.textBold}>26. Instructions to Forwarder:</Text>
              <Text style={styles.text}>{data.instructions_to_forwarder || ''}</Text>
            </Td>
          </Tr>

          {/* Row 10: Products Table (nested table: 10 columns, multiple rows) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="8%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>27. D/F</Text></Td>
                  <Td width="18%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>28. Schedule B / HTS Commercial Commodity Desc</Text></Td>
                  <Td width="10%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>28. SchB/HTS QTY / UOM (if applicable)</Text></Td>
                  <Td width="12%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>30. DDTC Quantity and DDTC Unit of Measure</Text></Td>
                  <Td width="10%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>31. Shipping Weight (in Kilos)</Text></Td>
                  <Td width="10%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>32. ECCN EAR99 or USML Category #</Text></Td>
                  <Td width="8%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>33. S M E (Y/N)</Text></Td>
                  <Td width="12%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>34. NLR, Export License No, License Exception Symbol, DDTC Exemption No, DDTC ACM No.,</Text></Td>
                  <Td width="12%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>35. Value at the Port of Export (US Dollars)</Text></Td>
                  <Td width="10%" bg="#def0fd" right={0}><Text style={styles.textBold}>36. License Value by item (if applicable) (US Dollars)</Text></Td>
                </Tr>
                {allProducts.map((product, index) => (
                  <Tr key={index} bottom={index === allProducts.length - 1 ? 0 : 0.5}>
                    <Td width="8%" right={0.5}><Text style={styles.text}>{getDorF(product.made_in)}</Text></Td>
                    <Td width="18%" right={0.5}><Text style={styles.text}>{product.hs_code}</Text></Td>
                    <Td width="10%" right={0.5}><Text style={styles.text}>{product.total_quantity.toLocaleString('en-US')}</Text></Td>
                    <Td width="12%" right={0.5}><Text style={styles.text}>Each</Text></Td>
                    <Td width="10%" right={0.5}><Text style={styles.text}>{product.total_weight.toFixed(2)} kg</Text></Td>
                    <Td width="10%" right={0.5}><Text style={styles.text}>EAR99</Text></Td>
                    <Td width="8%" right={0.5}></Td>
                    <Td width="12%" right={0.5}><Text style={styles.text}>NLR</Text></Td>
                    <Td width="12%" right={0.5}><Text style={styles.text}>${product.total_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text></Td>
                    <Td width="10%" right={0}></Td>
                  </Tr>
                ))}
              </Table>
            </Td>
          </Tr>

          {/* Row 11: DDTC Registration (nested table: 4 columns, 1 row) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0}>
                  <Td width="30%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>37. DDTC Applicant Registration Number:</Text></Td>
                  <Td width="20%" right={0.5}></Td>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>38. Eligible Party Certification:</Text></Td>
                  <Td width="25%" right={0} style={{ wordSpacing: 15 }}>
                    <CB checked={cs.eligible_party_yes} label="Yes" />
                    <CB checked={cs.eligible_party_no} label="No" />
                  </Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 12: Checkboxes 39-40 (nested table: 2 columns, 2 rows) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0.5}>
                  <Td width="8%" right={0.5}>
                    <Text style={styles.text}>39 </Text>
                    <CB checked={cs.checkbox_39} label="" />
                  </Td>
                  <Td width="92%" right={0}>Check here if there are any remaining non-licensable Schedule B / HTS Numbers that are valued $2500.00 or less and that do not otherwise require AES filing.</Td>
                </Tr>
                <Tr bottom={0}>
                  <Td width="8%" right={0.5}>
                    <Text style={styles.text}>40 </Text>
                    <CB checked={cs.checkbox_40} label="" />
                  </Td>
                  <Td width="92%" right={0}>Check here if the USPPI authorizes the above named forwarder to Act as authorized agent for export control, U.S. Census Bureau (Census Bureau) reporting, and U.S. Customs and Border Protection (CBP) purposes. Also, to prepare and transmit any Electronic Export Information (EEI) or other documents or records required to be filed by the Census Bureau, CBP, the Bureau of Industry and Security, or any other U.S. Government agency, and perform any other act that may be required by law or regulation in connection with the exportation or transportation of any goods shipped or consigned by or to the USPPI, and to receive or ship any goods on behalf of the USPPI.</Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 13: Certification Text */}
          <Tr bottom={0.5}>
            <Td right={0}>
              <Text style={styles.textSmall}>
                41. I certify that the statements made and all information contained herein are true and correct. I understand that civil and criminal penalties, including forfeiture and sale, may be imposed for making false and fraudulent statements herein, failing to provide the requested information or for violation of U.S. laws on exportation.
              </Text>
            </Td>
          </Tr>

          {/* Row 14: Email and Phone (nested table: 4 columns, 1 row) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0}>
                  <Td width="25%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>42. USPPI E-mail Address:</Text></Td>
                  <Td width="25%" right={0.5}>aaron@qiqiglobal.com</Td>
                  <Td width="30%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>43. USPPI Telephone No.:</Text></Td>
                  <Td width="20%" right={0}>00972-54-6248884</Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 15: Printed Name (nested table: 2 columns, 1 row) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0}>
                  <Td width="50%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>44. Printed Name of Duly authorized officer or employee:</Text></Td>
                  <Td width="50%" right={0}>Aaron Lisani</Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 16: Signature (nested table: 6 columns, 1 row) */}
          <Tr bottom={0.5}>
            <Td right={0} pad={0}>
              <Table border={0}>
                <Tr bottom={0}>
                  <Td width="15%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>45. Signature:</Text></Td>
                  <Td width="30%" right={0.5} style={{ position: 'relative' }}>
                    <Image 
                      src="/templates/Sig.png" 
                      style={{ 
                        position: 'absolute', 
                        height: 100, 
                        left: -10, 
                        top: '50%', 
                        transform: 'translateY(-50%)', 
                        zIndex: 10 
                      }} 
                    />
                  </Td>
                  <Td width="15%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>46. Title:</Text></Td>
                  <Td width="15%" right={0.5}>CPO</Td>
                  <Td width="10%" bg="#def0fd" right={0.5}><Text style={styles.textBold}>47. Date:</Text></Td>
                  <Td width="15%" right={0}>{data.sli_date || new Date().toLocaleDateString()}</Td>
                </Tr>
              </Table>
            </Td>
          </Tr>

          {/* Row 17: Electronic Signature */}
          <Tr bottom={0.5}>
            <Td right={0}>
              <Text style={styles.text}>48. </Text>
              <CB checked={cs.checkbox_48} label="Check here to validate Electronic Signature. Electronic signatures must be typed in all capital letters in Box 38 in order to be valid." />
            </Td>
          </Tr>

          {/* Row 18: Important Notice - Last row, no bottom border */}
          <Tr bottom={0}>
            <Td right={0}>
              <Text style={styles.textSmall}>
                Important: The shipment herein described is accepted in apparent good order (except as noted) subject to all terms and conditions of this contract on this letter of instruction. Liability for this shipment covered by this letter of instruction does not extend beyond its actual air movement and the territorial extent of the terminal area defined in our tariffs.
              </Text>
            </Td>
          </Tr>

        </Table>

      </Page>
    </Document>
  );
};
