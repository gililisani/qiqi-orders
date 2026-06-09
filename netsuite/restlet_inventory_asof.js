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

    // LOCALE-SAFE date: build a JS Date from the ISO parts and hand it to the
    // search. The search engine accepts a Date object regardless of the
    // account's display format (MM/DD vs DD/MM), so we never hardcode a format.
    var p = asOf.split('-');
    var asOfDateObj = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));

    // posting=T + mainline=F + non-tax = the inventory ledger lines. (The
    // line-level "inventory affecting" flag isn't a valid search filter id in
    // this account; we validate the resulting on-hand against a known value
    // instead — see RESTLET_DEPLOY.md.)
    var filters = [
      ['posting', 'is', 'T'],
      'AND',
      ['mainline', 'is', 'F'],
      'AND',
      ['taxline', 'is', 'F'],
      'AND',
      ['trandate', 'onorbefore', asOfDateObj],
    ];
    if (context.item) {
      filters.push('AND');
      // Filter by SKU via the item join's itemid field.
      filters.push(['item.itemid', 'is', context.item]);
    }

    // ── Self-diagnosing probe ────────────────────────────────────────────────
    // NetSuite returns an opaque "UNEXPECTED_ERROR" with no detail, so we run a
    // sequence of progressively-fuller searches inside try/catch and, with
    // ?debug=1, return WHICH step fails and its real .message. Remove once the
    // working combination is confirmed.
    if (context.debug) {
      var steps = [];
      function tryStep(label, build) {
        try {
          var ss = build();
          var n = ss.run().getRange({ start: 0, end: 5 }).length;
          steps.push({ step: label, ok: true, sampleRows: n });
          return true;
        } catch (e) {
          steps.push({ step: label, ok: false, error: (e && (e.message || e.toString())) || 'unknown' });
          return false;
        }
      }
      tryStep('A: minimal type=item only', function () {
        return search.create({ type: search.Type.TRANSACTION, filters: [['mainline', 'is', 'F']], columns: [search.createColumn({ name: 'internalid' })] });
      });
      tryStep('B: + item/location/quantity columns', function () {
        return search.create({ type: search.Type.TRANSACTION, filters: [['mainline', 'is', 'F']], columns: [search.createColumn({ name: 'item' }), search.createColumn({ name: 'location' }), search.createColumn({ name: 'quantity' })] });
      });
      tryStep('C: + posting + taxline filters', function () {
        return search.create({ type: search.Type.TRANSACTION, filters: [['posting', 'is', 'T'], 'AND', ['mainline', 'is', 'F'], 'AND', ['taxline', 'is', 'F']], columns: [search.createColumn({ name: 'item' }), search.createColumn({ name: 'location' }), search.createColumn({ name: 'quantity' })] });
      });
      tryStep('D: + trandate onorbefore (Date object)', function () {
        return search.create({ type: search.Type.TRANSACTION, filters: [['posting', 'is', 'T'], 'AND', ['mainline', 'is', 'F'], 'AND', ['trandate', 'onorbefore', asOfDateObj]], columns: [search.createColumn({ name: 'item' })] });
      });
      tryStep('E: + trandate onorbefore (MM/DD/YYYY string)', function () {
        var mmdd = p[1] + '/' + p[2] + '/' + p[0];
        return search.create({ type: search.Type.TRANSACTION, filters: [['posting', 'is', 'T'], 'AND', ['mainline', 'is', 'F'], 'AND', ['trandate', 'onorbefore', mmdd]], columns: [search.createColumn({ name: 'item' })] });
      });
      tryStep('F: + item.itemid filter', function () {
        return search.create({ type: search.Type.TRANSACTION, filters: [['mainline', 'is', 'F'], 'AND', ['item.itemid', 'is', context.item || 'FPS0017']], columns: [search.createColumn({ name: 'item' })] });
      });
      return { debug: true, steps: steps };
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
