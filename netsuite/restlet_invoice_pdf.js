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

  function renderPaymentForInvoice(invoiceId) {
    // Most recent Customer Payment applied to the invoice. mainline=T keeps
    // one row per payment; trandate DESC puts the latest first.
    var results = search
      .create({
        type: search.Type.CUSTOMER_PAYMENT,
        filters: [
          search.createFilter({
            name: 'appliedtotransaction',
            operator: search.Operator.ANYOF,
            values: [invoiceId],
          }),
          search.createFilter({ name: 'mainline', operator: search.Operator.IS, values: ['T'] }),
        ],
        columns: [
          search.createColumn({ name: 'trandate', sort: search.Sort.DESC }),
          search.createColumn({ name: 'tranid' }),
        ],
      })
      .run()
      .getRange({ start: 0, end: 1 });

    if (!results || results.length === 0) {
      throw error.create({
        name: 'NO_PAYMENT',
        message: 'No customer payment is applied to invoice ' + invoiceId,
      });
    }

    var paymentId = results[0].id;
    var tranId = String(results[0].getValue('tranid') || paymentId);

    var pdfFile = render.transaction({
      entityId: Number(paymentId),
      printMode: render.PrintMode.PDF,
    });

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
      return renderPaymentForInvoice(String(paymentFor));
    }

    var id = context.invoiceId;
    if (!id || !/^\d+$/.test(String(id))) {
      throw error.create({ name: 'BAD_ID', message: 'invoiceId=<internal id> required' });
    }
    return renderInvoice(String(id));
  }

  return { get: get };
});
