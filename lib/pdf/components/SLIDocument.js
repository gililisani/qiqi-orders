import * as React from 'react';
import { Document, Page, View, Text, StyleSheet, Image } from '@react-pdf/renderer';
import { aggregateProductsByHS, SLIProduct } from '../../sli/productAggregator';

const LETTER = {
  page: { width: 612, height: 792 },
  margin: 36,
  live: { width: 540, height: 720 },
};

const pct = (value, base = LETTER.live.width) => (base * value) / 100;

const makeBorder = (top = 0, right = 0, bottom = 0, left = 0) => ({
  borderTopWidth: top,
  borderRightWidth: right,
  borderBottomWidth: bottom,
  borderLeftWidth: left,
  borderTopColor: '#000',
  borderRightColor: '#000',
  borderBottomColor: '#000',
  borderLeftColor: '#000',
  borderStyle: 'solid',
});

const Row = ({
  children,
  height,
  borders,
  top = 0,
  right = 0,
  bottom = 0,
  left = 0,
  style,
}) => {
  const borderStyle = borders || makeBorder(top, right, bottom, left);
  return (
    <View style={[styles.row, borderStyle, height ? { minHeight: height } : null, style]}>
      {children}
    </View>
  );
};

const Cell = ({
  width,
  children,
  borders,
  pad = 2,
  align = 'left',
  justify = 'center',
  bg,
  style,
  rightBorder = true,
  leftBorder = false,
}) => {
  const defaultBorders = borders
    ? borders
    : makeBorder(0, rightBorder ? 0.5 : 0, 0, leftBorder ? 0.5 : 0);

  const base = {
    width,
    padding: pad,
    justifyContent: justify,
    backgroundColor: bg,
    textAlign: align,
  };

  return (
    <View style={[styles.cell, defaultBorders, base, style]}>
      {typeof children === 'string' ? <Text style={styles.text}>{children}</Text> : children}
    </View>
  );
};

const styles = StyleSheet.create({
  page: {
    padding: LETTER.margin,
    fontFamily: 'Helvetica',
    fontSize: 7.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  cell: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
  text: {
    fontSize: 7.5,
  },
  textSmall: {
    fontSize: 6.5,
  },
  textBold: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 6,
    flexWrap: 'nowrap',
  },
  checkbox: {
    width: 8,
    height: 8,
    borderWidth: 0.5,
    borderColor: '#000',
    borderStyle: 'solid',
    marginRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },

  signatureWrapper: {
    position: 'relative',
    height: 12,
  },
  signatureImage: {
    position: 'absolute',
    width: 120,
    height: 60,
    left: -10,
    top: -25,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberLabel: {
    marginRight: 4,
  },
  titleText: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
});

import { Svg, Line } from '@react-pdf/renderer';

const CB = ({ checked, label }) => (
  <View style={styles.checkboxContainer}>
    <View style={styles.checkbox}>
      {checked ? (
        <Svg width={8} height={8}>
          {/* more horizontal inset (makes X thinner) */}
          <Line
            x1={1.8}
            y1={1.2}
            x2={6.2}
            y2={6.8}
            stroke="#000"
            strokeWidth={1.1}
          />
          <Line
            x1={6.2}
            y1={1.2}
            x2={1.8}
            y2={6.8}
            stroke="#000"
            strokeWidth={1.1}
          />
        </Svg>
      ) : null}
    </View>
    {label ? <Text style={styles.textSmall}>{label}</Text> : null}
  </View>
);




export const SLIDocument = ({ data }) => {
  const cs = data.checkbox_states || {};
  const rawProducts = data.products || [];

  const normalizeProduct = (product) => {
    const totalQuantity = Number(product.total_quantity ?? product.quantity) || 0;
    const totalWeight = Number(product.total_weight ?? product.weight) || 0;
    const totalValue = Number(product.total_value ?? product.value) || 0;

    return {
      hs_code: (product.hs_code || '').trim() || 'N/A',
      total_quantity: totalQuantity,
      total_weight: totalWeight,
      total_value: totalValue,
      made_in: product.made_in || '',
    };
  };

  const hasAggregatedFields = rawProducts.every(
    (p) => p && (p.total_quantity !== undefined || p.total_weight !== undefined || p.total_value !== undefined)
  );

  const allProducts = hasAggregatedFields
    ? rawProducts.map(normalizeProduct)
    : (() => {
        const aggregated = aggregateProductsByHS({ products: rawProducts });
        return [
          ...aggregated.productsWithHS.map(normalizeProduct),
          ...aggregated.productsWithoutHS.map(normalizeProduct),
        ];
      })();

  const getDorF = (madeIn) => {
    const country = (madeIn || '').toLowerCase().trim();
    if (country === 'usa' || country === 'united states' || country === 'us') return 'D';
    return 'F';
  };

  const formatCurrency = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '';
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <View style={[{ width: LETTER.live.width }, makeBorder(0.5, 0.5, 0.5, 0.5)]}>
          {/* Row 1: Title */}
          <Row>
            <Cell
              width={LETTER.live.width}
              borders={makeBorder(0, 0, 0, 0)}
              pad={0}
              align="center"
              style={{ height: 40, justifyContent: 'center' }}
              rightBorder={false}
            >
              <Text style={styles.textBold}>SHIPPER'S LETTER OF INSTRUCTION (SLI)</Text>
            </Cell>
          </Row>

          {/* Row 2: USPPI Info */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const col30 = pct(30);
                  const col40 = pct(40);
                  const lineBorder = makeBorder(0.5, 0, 0.5, 0);

                  return (
                    <>
                      <Row>
                        <Cell width={col30} borders={makeBorder(0, 0.5, 0, 0)} bg="#def0fd">
                          <Text style={styles.textBold}>1. USPPI Name:</Text>
                        </Cell>
                        <Cell width={col30} borders={makeBorder(0, 0.5, 0, 0)} bg="#def0fd">
                          <Text style={styles.textBold}>3. Freight Location Co Name: (if not box 2):</Text>
                        </Cell>
                        <Cell width={col40} borders={makeBorder(0, 0, 0, 0)} bg="#def0fd" rightBorder={false}>
                          <Text style={styles.textBold}>5. Forwarding Agent:</Text>
                        </Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={col30}>Qiqi INC</Cell>
                        <Cell width={col30}>PACKABLE / Webb Enterprises</Cell>
                        <Cell width={col40} rightBorder={false}>{data.forwarding_agent_line1 || ''}</Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={col30} bg="#def0fd">
                          <Text style={styles.textBold}>2. USPPI Address Including Zip Code:</Text>
                        </Cell>
                        <Cell width={col30} bg="#def0fd">
                          <Text style={styles.textBold}>4. Freight Location Address (if not box 2):</Text>
                        </Cell>
                        <Cell width={col40} rightBorder={false}>{data.forwarding_agent_line2 || ''}</Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={col30}>4625 West Nevso Drive, Suite 2</Cell>
                        <Cell width={col30}>1516 Motor Parkway</Cell>
                        <Cell width={col40} rightBorder={false}>{data.forwarding_agent_line3 || ''}</Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={col30}>Las Vegas, NV 89103</Cell>
                        <Cell width={col30}>Islandia, New York, 11749</Cell>
                        <Cell width={col40} rightBorder={false}>{data.forwarding_agent_line4 || ''}</Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={col30} borders={makeBorder(0, 0.5, 0, 0)}>United States</Cell>
                        <Cell width={col30} borders={makeBorder(0, 0.5, 0, 0)}>United States</Cell>
                        <Cell width={col40} pad={0} borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
                          <Row>
                            <Cell width={col40 / 2} bg="#def0fd">
                              <Text style={styles.textBold}>6. Date of Export:</Text>
                            </Cell>
                            <Cell width={col40 / 2} rightBorder={false}>{data.date_of_export || new Date().toLocaleDateString('en-US')}</Cell>
                          </Row>
                        </Cell>
                      </Row>
                    </>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 3: EIN & Reference */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const widths = [pct(20), pct(20), pct(25), pct(15), pct(20)];

                  return (
                    <>
                      <Row>
                        <Cell width={widths[0]} bg="#def0fd">
                          <Text style={styles.textBold}>7. USPPI EIN (IRS) No:</Text>
                        </Cell>
                        <Cell width={widths[1]}>86-2244756</Cell>
                        <Cell width={widths[2]} bg="#def0fd">
                          <Text style={styles.textBold}>8. Related Party Indicator:</Text>
                        </Cell>
                        <Cell width={widths[3]}>
                          <CB checked={cs.related_party_related} label="Related" />
                        </Cell>
                        <Cell width={widths[4]} rightBorder={false}>
                          <CB checked={cs.related_party_non_related} label="Non-Related" />
                        </Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={widths[0]} bg="#def0fd">
                          <Text style={styles.textBold}>9. USPPI Reference #:</Text>
                        </Cell>
                        <Cell width={widths[1]}>{data.invoice_number || ''}</Cell>
                        <Cell width={widths[2]} bg="#def0fd">
                          <Text style={styles.textBold}>10. Routed Export Transaction:</Text>
                        </Cell>
                        <Cell width={widths[3]}>
                          <CB checked={cs.routed_export_yes} label="Yes" />
                        </Cell>
                        <Cell width={widths[4]} rightBorder={false}>
                          <CB checked={cs.routed_export_no} label="No" />
                        </Cell>
                      </Row>
                    </>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 4: Consignee Section */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const widths = [pct(35), pct(25), pct(40)];

                  return (
                    <>
                      <Row>
                        <Cell width={widths[0]} bg="#def0fd">
                          <Text style={styles.textBold}>11. Ultimate Consignee Name & Address:</Text>
                        </Cell>
                        <Cell width={widths[1]} bg="#def0fd">
                          <Text style={styles.textBold}>12. Ultimate Consignee Type:</Text>
                        </Cell>
                        <Cell width={widths[2]} bg="#def0fd" rightBorder={false}>
                          <Text style={styles.textBold}>13. Intermediate Consignee Name & Address:</Text>
                        </Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={widths[0]}>{data.consignee_name || ''}</Cell>
                        <Cell width={widths[1]}>
                          <CB checked={cs.consignee_type_government} label="Government Entity" />
                        </Cell>
                        <Cell width={widths[2]} rightBorder={false}></Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={widths[0]}>{data.consignee_address_line1 || ''}</Cell>
                        <Cell width={widths[1]}>
                          <CB checked={cs.consignee_type_direct_consumer} label="Direct Consumer" />
                        </Cell>
                        <Cell width={widths[2]} rightBorder={false}></Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={widths[0]}>{data.consignee_address_line2 || ''}</Cell>
                        <Cell width={widths[1]}>
                          <CB checked={cs.consignee_type_other_unknown} label="Other/Unknown" />
                        </Cell>
                        <Cell width={widths[2]} rightBorder={false}></Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={widths[0]}>{data.consignee_address_line3 || ''}</Cell>
                        <Cell width={widths[1]}>
                          <CB checked={cs.consignee_type_reseller} label="Re-Seller" />
                        </Cell>
                        <Cell width={widths[2]} rightBorder={false}></Cell>
                      </Row>
                    </>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 5: Export Details */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const widths = [pct(25), pct(20), pct(15), pct(15), pct(25)];

                  return (
                    <>
                      <Row>
                        <Cell width={widths[0]} bg="#def0fd">
                          <Text style={styles.textBold}>14. State of Origin:</Text>
                        </Cell>
                        <Cell width={widths[1]}>{data.state_of_origin || 'NY'}</Cell>
                        <Cell width={widths[2]} bg="#def0fd">
                          <Text style={styles.textBold}>17. In-Bond Code:</Text>
                        </Cell>
                        <Cell width={widths[3]}>{data.in_bond_code || ''}</Cell>
                        <Cell width={widths[4]} bg="#def0fd" rightBorder={false}>
                          <Text style={styles.textBold}>20. TIB / Carnet?</Text>
                        </Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={widths[0]} bg="#def0fd">
                          <Text style={styles.textBold}>15. Country of Ultimate Destination:</Text>
                        </Cell>
                        <Cell width={widths[1]}>{data.consignee_country || ''}</Cell>
                        <Cell width={widths[2]} bg="#def0fd">
                          <Text style={styles.textBold}>18. Entry Number:</Text>
                        </Cell>
                        <Cell width={widths[3]}></Cell>
                        <Cell width={widths[4]} rightBorder={false}>
                          <View style={styles.inlineRow}>
                            <CB checked={cs.tib_carnet_yes} label="Yes" />
                            <CB checked={cs.tib_carnet_no} label="No" />
                          </View>
                        </Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={pct(20)} bg="#def0fd">
                          <Text style={styles.textBold}>16. Hazardous Material:</Text>
                        </Cell>
                        <Cell width={pct(25)}>
                          <View style={styles.inlineRow}>
                            <CB checked={cs.hazardous_material_yes} label="Yes" />
                            <CB checked={cs.hazardous_material_no} label="No" />
                          </View>
                        </Cell>
                        <Cell width={pct(15)} bg="#def0fd">
                          <Text style={styles.textBold}>19. FTZ Identifier:</Text>
                        </Cell>
                        <Cell width={pct(15)}></Cell>
                        <Cell width={pct(25)} rightBorder={false}></Cell>
                      </Row>
                    </>
                  );
                })()}
              </View>
            </Cell>
          </Row>

{/* Row 6: Insurance/Payment (true nested tables, rowspan+colspan) */}
<Row top={0.5}>
  <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
    <View>
      {(() => {
        // exact widths to avoid rounding drift on the seam
        const wLeft  = pct(45);                         // single calc for left block (21+22)
        const wRight = LETTER.live.width - wLeft;       // exact complement (right merged cell)

        // split the left block exactly into 25% and the remainder (20%)
        const col25  = pct(25);
        const col20  = wLeft - col25;

        // row 3–4 widths (unchanged)
        const col25b = pct(25);
        const col30b = pct(30);

        return (
          <>
            {/* A1: left nested table (21 + 22) + right rowspan cell (25) */}
            <Row>
              {/* LEFT nested table */}
              <View style={{ width: wLeft }}>
                {/* 21 */}
                <Row>
                  <Cell width={col25} bg="#def0fd">
                    <Text style={styles.textBold}>21. Shipper Requests Insurance:</Text>
                  </Cell>
                  {/* seam drawn by the merged cell's LEFT border */}
                  <Cell width={col20} rightBorder={false}>
                    <View style={styles.inlineRow}>
                      <CB checked={cs.insurance_yes} label="Yes" />
                      <CB checked={cs.insurance_no} label="No" />
                    </View>
                  </Cell>
                </Row>

                {/* 22 */}
                <Row top={0.5}>
                  <Cell width={col25} bg="#def0fd">
                    <Text style={styles.textBold}>22. Declared Value for Cartage:</Text>
                  </Cell>
                  {/* seam drawn by the merged cell's LEFT border */}
                  <Cell width={col20} rightBorder={false}>
                    <Text>{formatCurrency(data.declared_value_cartage)}</Text>
                  </Cell>
                </Row>
              </View>

              {/* RIGHT cell (visual rowspan over the two left rows) */}
              <Cell
                width={wRight}
                justify="flex-start"
                pad={4}
                bg="#def0fd"
                // LEFT border only (no right), so: top=0, right=0, bottom=0, left=0.5
                borders={makeBorder(0, 0, 0, 0.5)}
                rightBorder={false}
              >
                <Text style={styles.textBold}>
                  25. SHIPPER&apos;S INSTRUCTION in case of inability to deliver consignment as consigned.
                </Text>
                <Text style={styles.text}>{data.shipper_instruction || ''}</Text>
              </Cell>
            </Row>

            {/* A2: row 3 (four columns) */}
            <Row top={0.5}>
              <Cell width={col25} bg="#def0fd">
                <Text style={styles.textBold}>23. Shipper Must Check:</Text>
              </Cell>
              <Cell width={col20}>
                <View style={styles.inlineRow}>
                  <CB checked={cs.payment_prepaid} label="Prepaid" />
                  <CB checked={cs.payment_collect} label="Collect" />
                </View>
              </Cell>
              <Cell width={col25b}>
                <CB checked={cs.abandoned} label="Abandoned" />
              </Cell>
              <Cell width={col30b} rightBorder={false}>
                <CB checked={cs.return_to_shipper} label="Return To Shipper" />
              </Cell>
            </Row>

            {/* A3: row 4 (colspan on last two columns via nested table) */}
            <Row top={0.5}>
              <Cell width={col25} bg="#def0fd">
                <Text style={styles.textBold}>24. C.O.D Amount:</Text>
              </Cell>
              <Cell width={col20}>
                <Text>{formatCurrency(data.cod_amount)}</Text>
              </Cell>

              {/* colspan = col3+col4 */}
              <Cell width={col25b + col30b} pad={0} rightBorder={false}>
                <View>
                  <Row>
                    <Cell
                      width={col25b + col30b}
                      borders={makeBorder(0, 0, 0, 0)} // inner row; outer borders already drawn
                      rightBorder={false}
                    >
                      <CB checked={cs.deliver_to} label="Deliver To:" />
                    </Cell>
                  </Row>
                </View>
              </Cell>
            </Row>
          </>
        );
      })()}
    </View>
  </Cell>
</Row>


          {/* Row 7: Aviation Security Text */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
              <Text style={styles.textSmall}>
                Cargo items tendered or directed to be tendered by your firm for air transportation are subject to Aviation Security controls for air carriers and when appropriate Other Government Regulations. Copies of all relevant shipping documents showing the cargo's consignee, consignor, description, and other relevant data will be retained on file until the cargo completes its air transportation.
              </Text>
            </Cell>
          </Row>

          {/* Row 8: TSA Regulations Text */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
              <Text style={styles.textSmall}>
                I understand that all cargo tendered for transport by air to the nominated is subject to TSA Regulations that may require inspection or screening. I give the nominated freight forwarder my permission to inspect or screen all cargo tendered on behalf of company. My consent will remain in effect until revoked in writing.
              </Text>
            </Cell>
          </Row>

          {/* Row 9: Instructions to Forwarder */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} justify="flex-start" rightBorder={false} style={{ minHeight: 34 }}>
              <Text style={styles.textBold}>26. Instructions to Forwarder:</Text>
              <Text style={styles.text}>{data.instructions_to_forwarder || ''}</Text>
            </Cell>
          </Row>

          {/* Row 10: Products Table */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const widths = [pct(8), pct(18), pct(10), pct(12), pct(10), pct(10), pct(8), pct(12), pct(12), pct(10)];

                  return (
                    <>
                      <Row>
                        <Cell width={widths[0]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>27. D/F</Text>
                        </Cell>
                        <Cell width={widths[1]} bg="#def0fd">
                          <Text style={styles.textBold}>28. Schedule B / HTS Commercial Commodity Desc</Text>
                        </Cell>
                        <Cell width={widths[2]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>28. SchB/HTS QTY / UOM (if applicable)</Text>
                        </Cell>
                        <Cell width={widths[3]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>30. DDTC Quantity and DDTC Unit of Measure</Text>
                        </Cell>
                        <Cell width={widths[4]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>31. Shipping Weight (in Kilos)</Text>
                        </Cell>
                        <Cell width={widths[5]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>32. ECCN EAR99 or USML Category #</Text>
                        </Cell>
                        <Cell width={widths[6]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>33. S M E (Y/N)</Text>
                        </Cell>
                        <Cell width={widths[7]} bg="#def0fd">
                          <Text style={styles.textBold}>34. NLR, Export License No, License Exception Symbol, DDTC Exemption No, DDTC ACM No.,</Text>
                        </Cell>
                        <Cell width={widths[8]} bg="#def0fd" align="center">
                          <Text style={styles.textBold}>35. Value at the Port of Export (US Dollars)</Text>
                        </Cell>
                        <Cell width={widths[9]} bg="#def0fd" align="center" borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
                          <Text style={styles.textBold}>36. License Value by item (if applicable) (US Dollars)</Text>
                        </Cell>
                      </Row>
                      {allProducts.map((product, index) => (
                        <Row key={`${product.hs_code}-${index}`} top={0.5}>
                          <Cell width={widths[0]} align="center">{getDorF(product.made_in)}</Cell>
                          <Cell width={widths[1]} align="center">{product.hs_code}</Cell>
                          <Cell width={widths[2]} align="center">{product.total_quantity.toLocaleString('en-US')}</Cell>
                          <Cell width={widths[3]} align="center">Each</Cell>
                          <Cell width={widths[4]} align="center"><Text>{`${Number(product.total_weight ?? product.weight ?? 0).toFixed(2)} kg`}</Text></Cell>
                          <Cell width={widths[5]} align="center">EAR99</Cell>
                          <Cell width={widths[6]} align="center"></Cell>
                          <Cell width={widths[7]} align="center">NLR</Cell>
                          <Cell width={widths[8]} align="center">{formatCurrency(product.total_value)}</Cell>
                          <Cell width={widths[9]} align="center" borders={makeBorder(0, 0, 0, 0)} rightBorder={false}></Cell>
                        </Row>
                      ))}
                    </>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 11: DDTC Registration */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const widths = [pct(30), pct(20), pct(25), pct(25)];
                  return (
                    <Row>
                      <Cell width={widths[0]} bg="#def0fd">
                        <Text style={styles.textBold}>37. DDTC Applicant Registration Number:</Text>
                      </Cell>
                      <Cell width={widths[1]}>{data.ddtc_registration || ''}</Cell>
                      <Cell width={widths[2]} bg="#def0fd">
                        <Text style={styles.textBold}>38. Eligible Party Certification:</Text>
                      </Cell>
                      <Cell width={widths[3]} rightBorder={false}>
                        <View style={styles.inlineRow}>
                          <CB checked={cs.eligible_party_yes} label="Yes" />
                          <CB checked={cs.eligible_party_no} label="No" />
                        </View>
                      </Cell>
                    </Row>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 12: Checkboxes 39-40 */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0}>
              <View>
                {(() => {
                  const col8 = pct(8);
                  const col92 = pct(92);
                  return (
                    <>
                      <Row>
                        <Cell width={col8}>
                          <View style={styles.inlineRow}>
                            <Text style={[styles.text, styles.numberLabel]}>39</Text>
                            <CB checked={cs.checkbox_39} label="" />
                          </View>
                        </Cell>
                        <Cell width={col92} rightBorder={false}>
                          Check here if there are any remaining non-licensable Schedule B / HTS Numbers that are valued $2500.00 or less and that do not otherwise require AES filing.
                        </Cell>
                      </Row>
                      <Row top={0.5}>
                        <Cell width={col8}>
                          <View style={styles.inlineRow}>
                            <Text style={[styles.text, styles.numberLabel]}>40</Text>
                            <CB checked={cs.checkbox_40} label="" />
                          </View>
                        </Cell>
                        <Cell width={col92} rightBorder={false}>
                          Check here if the USPPI authorizes the above named forwarder to act as authorized agent for export control, U.S. Census Bureau reporting, and U.S. Customs and Border Protection purposes. Also, to prepare and transmit any Electronic Export Information (EEI) or other documents or records required to be filed by the Census Bureau, CBP, the Bureau of Industry and Security, or any other U.S. Government agency.
                        </Cell>
                      </Row>
                    </>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 13: Certification Text */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
              <Text style={styles.textSmall}>
                41. I certify that the statements made and all information contained herein are true and correct. I understand that civil and criminal penalties, including forfeiture and sale, may be imposed for making false and fraudulent statements herein, failing to provide the requested information or for violation of U.S. laws on exportation (13 U.S.C. Sec. 305; 22 U.S.C. Sec. 401; 18 U.S.C. Sec. 1001; 50 U.S.C. app. 2410).
              </Text>
            </Cell>
          </Row>

          {/* Row 14: Email and Phone */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0} rightBorder={false}>
              <View>
                {(() => {
                  const widths = [pct(25), pct(25), pct(30), pct(20)];
                  return (
                    <Row>
                      <Cell width={widths[0]} bg="#def0fd">
                        <Text style={styles.textBold}>42. USPPI E-mail Address:</Text>
                      </Cell>
                      <Cell width={widths[1]}>{data.usppi_email || 'aaron@qiqiglobal.com'}</Cell>
                      <Cell width={widths[2]} bg="#def0fd">
                        <Text style={styles.textBold}>43. USPPI Telephone No.:</Text>
                      </Cell>
                      <Cell width={widths[3]} rightBorder={false}>{data.usppi_phone || '00972-54-6248884'}</Cell>
                    </Row>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 15: Printed Name */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0} rightBorder={false}>
              <View>
                {(() => {
                  const widths = [pct(50), pct(50)];
                  return (
                    <Row>
                      <Cell width={widths[0]} bg="#def0fd">
                        <Text style={styles.textBold}>44. Printed Name of Duly authorized officer or employee:</Text>
                      </Cell>
                      <Cell width={widths[1]} rightBorder={false}>{data.printed_name || 'Aaron Lisani'}</Cell>
                    </Row>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 16: Signature */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} pad={0} rightBorder={false}>
              <View>
                {(() => {
                  const widths = [pct(15), pct(30), pct(15), pct(15), pct(10), pct(15)];
                  return (
                    <Row>
                      <Cell width={widths[0]} bg="#def0fd">
                        <Text style={styles.textBold}>45. Signature:</Text>
                      </Cell>
                      <Cell width={widths[1]} style={styles.signatureWrapper} borders={makeBorder(0, 0.5, 0, 0)}>
                        <Image src={data.signature_url || '/templates/Sig.png'} style={styles.signatureImage} />
                      </Cell>
                      <Cell width={widths[2]} bg="#def0fd">
                        <Text style={styles.textBold}>46. Title:</Text>
                      </Cell>
                      <Cell width={widths[3]}>{data.signer_title || 'CPO'}</Cell>
                      <Cell width={widths[4]} bg="#def0fd">
                        <Text style={styles.textBold}>47. Date:</Text>
                      </Cell>
                      <Cell width={widths[5]} rightBorder={false}>{data.sli_date || new Date().toLocaleDateString('en-US')}</Cell>
                    </Row>
                  );
                })()}
              </View>
            </Cell>
          </Row>

          {/* Row 17: Electronic Signature */}
          <Row top={0.5}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
              <CB
                checked={cs.checkbox_48}
                label="48. Check here to validate Electronic Signature. Electronic signatures must be typed in all capital letters in Box 38 in order to be valid."
              />
            </Cell>
          </Row>

          {/* Row 18: Important Notice */}
          <Row top={0.5} borders={makeBorder(0, 0, 0, 0)} rightBorder={false}>
            <Cell width={LETTER.live.width} borders={makeBorder(0, 0, 0, 0)}>
              <Text style={styles.textSmall}>
                Important: The shipment herein described is accepted in apparent good order (except as noted) subject to all terms and conditions of this contract on this letter of instruction. Liability for this shipment covered by this letter of instruction does not extend beyond its actual air movement and the territorial extent of the terminal area defined in our tariffs.
              </Text>
            </Cell>
          </Row>
        </View>
      </Page>
    </Document>
  );
};
