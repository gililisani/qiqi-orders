/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Item Fulfillment creator for the Shopify sync (Loop B).
 *
 * WHY THIS EXISTS
 * Production Shopify orders fulfill CROSS-SUBSIDIARY (Qiqi INC order,
 * BrandFox location under Qiqi Global). SuiteTalk REST's transform cannot
 * initialize an IF across subsidiaries — it reports "You must have at
 * least one valid line item" (proven 2026-08-21 on #7275–#7278), while the
 * UI and SuiteScript create the same IF fine (IF18232 was created manually
 * as proof; NetScore's scripts did it for years). This RESTlet is the
 * SuiteScript path, driven by the Hub: record.transform → set lines +
 * lots + tracking → save. Same mechanism as the UI's Fulfill button,
 * including fulfilling uncommitted lines (the account's daily practice).
 *
 * DEPLOY (Administrator): see netsuite/FULFILL_DEPLOY.md.
 *
 * CALL (POST, JSON body)
 * {
 *   "salesOrderId": "598252",          // internal id
 *   "externalId": "SHOPFUL-710011..."  // idempotency key (Shopify fulfillment id)
 *   "tranDate": "2026-08-21",          // store-timezone date
 *   "memo": "Shopify #7277 · DHL 1Z...",
 *   "shipStatus": "C",                 // C = Shipped
 *   "lines": [{
 *     "orderLine": 1,                  // SO line number (transactionline.id)
 *     "quantity": 1,
 *     "locationId": "46",
 *     "lots": [{ "id": "471", "quantity": 1 }]   // inventorynumber ids (FEFO-picked by the Hub)
 *   }]
 * }
 * Returns: { fulfillmentId, tranId, adopted: false }
 * If an IF with the externalId already exists: { fulfillmentId, tranId, adopted: true }
 * Expected business failures come back as { error, message } payloads, not
 * thrown errors (thrown RESTlet errors email the script owner).
 */
define(['N/record', 'N/search', 'N/error', 'N/format'], function (record, search, error, format) {
  function findByExternalId(externalId) {
    var rows = search
      .create({
        type: search.Type.ITEM_FULFILLMENT,
        filters: [
          search.createFilter({ name: 'externalid', operator: search.Operator.ANYOF, values: [externalId] }),
          search.createFilter({ name: 'mainline', operator: search.Operator.IS, values: ['T'] }),
        ],
        columns: [search.createColumn({ name: 'tranid' })],
      })
      .run()
      .getRange({ start: 0, end: 1 });
    if (rows && rows.length) {
      return { id: String(rows[0].id), tranId: String(rows[0].getValue('tranid') || rows[0].id) };
    }
    return null;
  }

  function post(body) {
    if (!body || !/^\d+$/.test(String(body.salesOrderId || ''))) {
      throw error.create({ name: 'BAD_INPUT', message: 'salesOrderId (internal id) required' });
    }
    if (!body.externalId || !Array.isArray(body.lines) || body.lines.length === 0) {
      throw error.create({ name: 'BAD_INPUT', message: 'externalId and non-empty lines[] required' });
    }

    // Idempotency: adopt an existing IF with this externalid.
    var existing = findByExternalId(String(body.externalId));
    if (existing) {
      return { fulfillmentId: existing.id, tranId: existing.tranId, adopted: true };
    }

    var wanted = {};
    for (var i = 0; i < body.lines.length; i++) {
      wanted[String(body.lines[i].orderLine)] = body.lines[i];
    }

    // With Intercompany Cross-Subsidiary Fulfillment enabled, the transform
    // REQUIRES the inventory location as a defaultValue — without it NetSuite
    // throws VALID_LINE_ITEM_REQD ("at least one valid line item"). The UI
    // passes it implicitly when you click Fulfill; scripts must be explicit.
    var inventoryLocationId = body.lines[0] && body.lines[0].locationId;
    if (!inventoryLocationId) {
      throw error.create({ name: 'BAD_INPUT', message: 'lines[0].locationId (inventory location) required' });
    }
    var rec;
    try {
      rec = record.transform({
        fromType: record.Type.SALES_ORDER,
        fromId: Number(body.salesOrderId),
        toType: record.Type.ITEM_FULFILLMENT,
        isDynamic: true,
        defaultValues: { inventorylocation: Number(inventoryLocationId) },
      });
    } catch (e) {
      return {
        error: 'TRANSFORM_FAILED',
        message: 'transform SO ' + body.salesOrderId + ' failed: ' + ((e && e.message) || String(e)),
      };
    }

    rec.setValue({ fieldId: 'externalid', value: String(body.externalId) });
    if (body.shipStatus) rec.setValue({ fieldId: 'shipstatus', value: String(body.shipStatus) });
    if (body.memo) rec.setValue({ fieldId: 'memo', value: String(body.memo).slice(0, 999) });
    if (body.tranDate) {
      rec.setValue({
        fieldId: 'trandate',
        value: format.parse({ value: String(body.tranDate), type: format.Type.DATE, timezone: format.Timezone.AMERICA_NEW_YORK }),
      });
    }

    var fulfilled = 0;
    var lineCount = rec.getLineCount({ sublistId: 'item' });
    for (var line = 0; line < lineCount; line++) {
      rec.selectLine({ sublistId: 'item', line: line });
      var orderLine = String(rec.getCurrentSublistValue({ sublistId: 'item', fieldId: 'orderline' }));
      var spec = wanted[orderLine];
      if (!spec) {
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false });
        rec.commitLine({ sublistId: 'item' });
        continue;
      }
      rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });
      rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: Number(spec.quantity) });
      if (spec.locationId) {
        rec.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: Number(spec.locationId) });
      }
      if (spec.lots && spec.lots.length) {
        var det = rec.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
        // Clear any pre-populated assignment rows, then write ours (FEFO).
        var existingRows = det.getLineCount({ sublistId: 'inventoryassignment' });
        for (var r = existingRows - 1; r >= 0; r--) {
          det.removeLine({ sublistId: 'inventoryassignment', line: r });
        }
        for (var j = 0; j < spec.lots.length; j++) {
          det.selectNewLine({ sublistId: 'inventoryassignment' });
          det.setCurrentSublistValue({
            sublistId: 'inventoryassignment',
            fieldId: 'issueinventorynumber',
            value: Number(spec.lots[j].id),
          });
          det.setCurrentSublistValue({
            sublistId: 'inventoryassignment',
            fieldId: 'quantity',
            value: Number(spec.lots[j].quantity),
          });
          det.commitLine({ sublistId: 'inventoryassignment' });
        }
      }
      rec.commitLine({ sublistId: 'item' });
      fulfilled++;
    }

    if (fulfilled === 0) {
      return {
        error: 'NO_MATCHING_LINES',
        message: 'None of the requested orderLine values matched SO ' + body.salesOrderId + ' fulfillable lines',
      };
    }

    var id;
    try {
      id = rec.save();
    } catch (e) {
      return {
        error: 'SAVE_FAILED',
        message: 'IF save failed for SO ' + body.salesOrderId + ': ' + ((e && e.message) || String(e)),
      };
    }
    var tranId = String(search.lookupFields({ type: search.Type.ITEM_FULFILLMENT, id: id, columns: ['tranid'] }).tranid || id);
    return { fulfillmentId: String(id), tranId: tranId, adopted: false };
  }

  return { post: post };
});
