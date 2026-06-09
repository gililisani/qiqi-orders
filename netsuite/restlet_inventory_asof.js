/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Inventory "as-of-date" RESTlet for the Qiqi inventory-investigation tool.
 *
 * WHY THIS EXISTS
 * NetSuite's SuiteQL/REST API exposes only CURRENT on-hand (`inventorybalance`
 * is a live snapshot, no history). The investigation tool therefore had to
 * reconstruct past balances by replaying transactions from an opening — which
 * is wrong whenever NetSuite holds stock that has no visible transaction (a
 * "phantom residual", e.g. FPS0017 @ Packable-Qiqi-INC was +7). This RESTlet
 * runs INSIDE NetSuite, where a Transaction saved-search can sum every
 * inventory posting (incl. the ones the external API can't see) through a given
 * date — returning NetSuite's OWN measured on-hand per (item, location).
 *
 * DEPLOY (Administrator):
 *   1. Customization → Scripting → Scripts → New. Upload this file.
 *      Script type: RESTlet. Function: GET = `get`. Save.
 *   2. On the script record → Deploy Script. Status: Released. Log Level: Error.
 *      Roles: add the role used by the integration's token (so TBA can call it).
 *   3. Note the External URL / the script id + deploy id (e.g. customscript_…,
 *      customdeploy_…) and the numeric script=NNN & deploy=MM in the URL.
 *      Put those in the app env as NETSUITE_ASOF_SCRIPT_ID / _DEPLOY_ID.
 *
 * CALL
 *   GET .../restlet.nl?script=NNN&deploy=MM&date=2024-09-30
 *     optional: &item=FPS0017   (single SKU; omit for the whole catalog)
 *   Returns: { asOfDate, rows: [{ itemId, itemCode, locationId, locationName, qty }] }
 *
 * METHOD
 * Sum transactionline.quantity for inventory-affecting lines with trandate <=
 * the as-of date, grouped by item + location. Run inside NetSuite, this sees
 * ALL inventory postings — so the sum equals NetSuite's on-hand as of that date,
 * phantom units included. (Validate against a known value, e.g. FPS0017 @
 * Packable-Qiqi-INC = 5 on 2024-09-30, before trusting it.)
 */
define(['N/search', 'N/error'], function (search, error) {
  function get(context) {
    var asOf = context.date;
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw error.create({ name: 'BAD_DATE', message: 'date=YYYY-MM-DD required' });
    }
    var asOfDate = asOf;

    // The trandate filter must be built with search.createFilter using the
    // ONORBEFORE operator and a DD/MM/YYYY string. (Empirically validated on
    // this account: the array form, a Date object, and an MM/DD string all throw
    // a generic UNEXPECTED_ERROR; only createFilter + DD/MM works. Note that's
    // DD/MM even though the UI displays MM/DD — a NetSuite search quirk.)
    var p = asOf.split('-'); // [YYYY, MM, DD]
    var ddmm = p[2] + '/' + p[1] + '/' + p[0];

    // posting=T + mainline=F + non-tax = the inventory ledger lines.
    var filters = [
      search.createFilter({ name: 'posting', operator: search.Operator.IS, values: ['T'] }),
      search.createFilter({ name: 'mainline', operator: search.Operator.IS, values: ['F'] }),
      search.createFilter({ name: 'taxline', operator: search.Operator.IS, values: ['F'] }),
      search.createFilter({ name: 'trandate', operator: search.Operator.ONORBEFORE, values: [ddmm] }),
    ];
    if (context.item) {
      filters.push(search.createFilter({ name: 'itemid', join: 'item', operator: search.Operator.IS, values: [context.item] }));
    }

    // NON-grouped search; aggregate by (item, location) in JS.
    var itemCol = search.createColumn({ name: 'item' });
    var locCol = search.createColumn({ name: 'location' });
    var qtyCol = search.createColumn({ name: 'quantity' });

    var s = search.create({
      type: search.Type.TRANSACTION,
      filters: filters,
      columns: [itemCol, locCol, qtyCol],
    });

    var agg = {}; // key "itemId|locId" -> {itemId,itemCode,locationId,locationName,qty}
    var runner = s.run();
    var start = 0;
    var PAGE = 1000;
    for (;;) {
      var slice = runner.getRange({ start: start, end: start + PAGE });
      if (!slice || slice.length === 0) break;
      for (var i = 0; i < slice.length; i++) {
        var r = slice[i];
        var itemId = r.getValue(itemCol);
        var locId = r.getValue(locCol);
        if (!itemId) continue;
        var key = itemId + '|' + (locId || '');
        if (!agg[key]) {
          agg[key] = {
            itemId: itemId,
            itemCode: r.getText(itemCol) || '',
            locationId: locId || '',
            locationName: r.getText(locCol) || '',
            qty: 0,
          };
        }
        agg[key].qty += Number(r.getValue(qtyCol)) || 0;
      }
      if (slice.length < PAGE) break;
      start += PAGE;
    }

    var rows = [];
    for (var k in agg) {
      if (agg.hasOwnProperty(k)) rows.push(agg[k]);
    }

    return { asOfDate: asOfDate, count: rows.length, rows: rows };
  }

  return { get: get };
});
