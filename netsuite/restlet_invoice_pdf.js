/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Invoice / payment-confirmation PDF RESTlet for the Qiqi Partners Hub
 * billing center (Billing Phase B).
 *
 * WHY THIS EXISTS
 * NetSuite's SuiteTalk REST API cannot return a transaction's printed PDF.
 * The only supported path is SuiteScript's N/render module, which runs INSIDE
 * NetSuite and produces the exact document the UI's Print button does — the
 * account's Advanced PDF/HTML template with remittance details, bank info,
 * terms, logo, everything. This RESTlet renders it and hands the bytes to the
 * Hub, which streams them to the partner. Nothing is composed or replicated
 * outside NetSuite; a template change in NetSuite is picked up automatically.
 *
 * The payment lookup also lives here on purpose: on this account the
 * payment→invoice link tables are NOT readable via external SuiteQL (known
 * quirk), but a native N/search inside NetSuite traverses them fine.
 *
 * DEPLOY (Administrator): see netsuite/INVOICE_PDF_DEPLOY.md.
 * UPDATE (new version of this file): Customization → Scripting → Scripts →
 * open the script → click the Script File link → Edit → paste the new
 * content (or upload the file over it). Same script/deploy IDs keep working.
 *
 * CALL (both GET)
 *   ?script=NNN&deploy=MM&invoiceId=12345
 *     → the invoice PDF. invoiceId = internal id (orders.netsuite_invoice_id).
 *     Returns: { invoiceId, tranId, fileName, base64 }
 *   ?script=NNN&deploy=MM&paymentForInvoice=12345
 *     → the payment-confirmation PDF for the MOST RECENT Customer Payment
 *       applied to that invoice. Throws NO_PAYMENT if none is applied.
 *     Returns: { paymentId, invoiceId, tranId, fileName, base64 }
 *
 * SECURITY
 * Renders only INVOICE records and CUSTOMER PAYMENTS applied to them —
 * record.load is pinned to INVOICE, and the payment search is filtered by
 * appliedToTransaction, so arbitrary record ids can't be rendered. Read-only.
 */
define(['N/render', 'N/record', 'N/search', 'N/error'], function (render, record, search, error) {
  function renderInvoice(id) {
    // Type guard + tranid lookup in one load: pinned to INVOICE, so a sales
    // order / any other record id throws rather than rendering.
    var inv = record.load({ type: record.Type.INVOICE, id: id });
    var tranId = String(inv.getValue('tranid') || id);

    var pdfFile = render.transaction({
      entityId: Number(id),
      printMode: render.PrintMode.PDF,
    });

    return {
      invoiceId: String(id),
      tranId: tranId,
      fileName: 'Invoice-' + tranId + '.pdf',
      base64: pdfFile.getContents(), // N/file returns base64 for binary types
    };
  }

  // Everything applied against the invoice (payments, credit memos, deposit
  // applications), read from the INVOICE side via the applyingtransaction
  // join — the reliable direction on this account.
  function findApplyingTransactions(invoiceId) {
    var rows = search
      .create({
        type: search.Type.TRANSACTION,
        filters: [
          search.createFilter({ name: 'internalid', operator: search.Operator.ANYOF, values: [invoiceId] }),
          search.createFilter({ name: 'mainline', operator: search.Operator.IS, values: ['T'] }),
        ],
        columns: [
          search.createColumn({ name: 'applyingtransaction' }),
          search.createColumn({ name: 'applyinglinktype' }),
        ],
      })
      .run()
      .getRange({ start: 0, end: 50 });

    var applying = [];
    for (var i = 0; i < (rows || []).length; i++) {
      var id = rows[i].getValue('applyingtransaction');
      if (!id) continue;
      applying.push({
        id: String(id),
        tranid: String(rows[i].getText('applyingtransaction') || id),
        linkType: String(rows[i].getValue('applyinglinktype') || ''),
      });
    }
    return applying;
  }

  function renderPaymentForInvoice(invoiceId, debug) {
    var applying = findApplyingTransactions(invoiceId);

    if (debug) {
      return { invoiceId: String(invoiceId), applying: applying };
    }

    // Real Customer Payments only, by DISPLAY NAME ("Payment #PIL10678").
    // linkType is useless here: on IL invoices the Currency Revaluation row
    // (CRIL…, unprintable) ALSO reports linkType "Payment", and it always has
    // a newer internal id than the true payment — so filtering by linkType
    // and taking the newest rendered the revaluation and failed.
    var payments = applying.filter(function (a) {
      return /^payment\b/i.test(a.tranid);
    });
    payments.sort(function (a, b) { return Number(b.id) - Number(a.id); });

    if (payments.length === 0) {
      var seen = applying
        .map(function (a) { return a.linkType + ' ' + a.tranid; })
        .join(', ');
      // RETURNED, not thrown: a thrown RESTlet error makes NetSuite email the
      // script owner, and "no payment yet" is an expected business answer,
      // not a malfunction. The Hub treats this payload as its 404.
      return {
        error: 'NO_PAYMENT',
        invoiceId: String(invoiceId),
        message:
          'No customer payment is applied to invoice ' + invoiceId +
          (seen ? ' (applying transactions: ' + seen + ')' : ' (nothing applied)'),
      };
    }

    var paymentId = payments[0].id;
    // getText gives display text like "Payment #PUS16830" — keep the number.
    var tranId = payments[0].tranid.replace(/^[^#]*#\s*/, '');

    var pdfFile;
    try {
      pdfFile = render.transaction({
        entityId: Number(paymentId),
        printMode: render.PrintMode.PDF,
      });
    } catch (e) {
      // RETURNED, not thrown (same reason as NO_PAYMENT): some payment
      // records fail NetSuite's renderer (seen on an IL-subsidiary payment,
      // presumably a localization template). The Hub turns this into a
      // friendly "not available" message instead of a 500 + owner email.
      return {
        error: 'RENDER_FAILED',
        invoiceId: String(invoiceId),
        paymentId: String(paymentId),
        tranId: tranId,
        message:
          'NetSuite could not render payment ' + tranId + ' (id ' + paymentId + '): ' +
          ((e && e.message) || String(e)),
      };
    }

    return {
      paymentId: String(paymentId),
      invoiceId: String(invoiceId),
      tranId: tranId,
      fileName: 'Payment-' + tranId + '.pdf',
      base64: pdfFile.getContents(),
    };
  }

  function get(context) {
    var paymentFor = context.paymentForInvoice;
    if (paymentFor) {
      if (!/^\d+$/.test(String(paymentFor))) {
        throw error.create({ name: 'BAD_ID', message: 'paymentForInvoice=<internal id> required' });
      }
      return renderPaymentForInvoice(String(paymentFor), context.debug === '1');
    }

    var id = context.invoiceId;
    if (!id || !/^\d+$/.test(String(id))) {
      throw error.create({ name: 'BAD_ID', message: 'invoiceId=<internal id> required' });
    }
    return renderInvoice(String(id));
  }

  return { get: get };
});
