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
define(['N/search', 'N/format', 'N/error'], function (search, format, error) {
  function get(context) {
    var asOf = context.date;
    if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
      throw error.create({ name: 'BAD_DATE', message: 'date=YYYY-MM-DD required' });
    }
    var asOfDate = asOf;

    // LOCALE-SAFE date: parse the ISO date into a real Date via N/format. The
    // search engine accepts a Date object regardless of the account's display
    // format (MM/DD vs DD/MM), so we never have to hardcode a format string.
    var p = asOf.split('-');
    var asOfDateObj = format.parse({
      value: new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])),
      type: format.Type.DATE,
    });

    var filters = [
      ['posting', 'is', 'T'],
      'AND',
      ['trandate', 'onorbefore', asOfDateObj],
      'AND',
      ['inventory', 'is', 'T'], // inventory-affecting lines only
    ];
    if (context.item) {
      filters.push('AND');
      filters.push(['item.nameinternal', 'is', context.item]); // by SKU if provided
    }

    var rows = [];
    var s = search.create({
      type: search.Type.TRANSACTION,
      filters: filters,
      columns: [
        search.createColumn({ name: 'internalid', join: 'item', summary: search.Summary.GROUP }),
        search.createColumn({ name: 'itemid', join: 'item', summary: search.Summary.GROUP }),
        search.createColumn({ name: 'internalid', join: 'inventoryLocation', summary: search.Summary.GROUP }),
        search.createColumn({ name: 'name', join: 'inventoryLocation', summary: search.Summary.GROUP }),
        search.createColumn({ name: 'quantity', summary: search.Summary.SUM }),
      ],
    });

    var paged = s.runPaged({ pageSize: 1000 });
    paged.pageRanges.forEach(function (range) {
      var page = paged.fetch({ index: range.index });
      page.data.forEach(function (r) {
        var c = r.columns;
        rows.push({
          itemId: r.getValue(c[0]),
          itemCode: r.getValue(c[1]),
          locationId: r.getValue(c[2]),
          locationName: r.getValue(c[3]),
          qty: Number(r.getValue(c[4])) || 0,
        });
      });
    });

    return { asOfDate: asOfDate, count: rows.length, rows: rows };
  }

  return { get: get };
});
