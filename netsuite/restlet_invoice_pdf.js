/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 *
 * Invoice PDF RESTlet for the Qiqi Partners Hub billing center (Phase B).
 *
 * WHY THIS EXISTS
 * NetSuite's SuiteTalk REST API cannot return a transaction's printed PDF.
 * The only supported path is SuiteScript's N/render module, which runs INSIDE
 * NetSuite and produces the exact document the UI's Print button does — the
 * account's Advanced PDF/HTML invoice template with remittance details, bank
 * info, terms, logo, everything. This RESTlet renders it and hands the bytes
 * to the Hub, which streams them to the partner. Nothing is composed or
 * replicated outside NetSuite; a template change in NetSuite is picked up
 * automatically.
 *
 * DEPLOY (Administrator): see netsuite/INVOICE_PDF_DEPLOY.md — same 10-minute
 * routine as the as-of inventory RESTlet.
 *
 * CALL
 *   GET .../restlet.nl?script=NNN&deploy=MM&invoiceId=12345
 *     invoiceId = the invoice's INTERNAL id (orders.netsuite_invoice_id).
 *   Returns: { invoiceId, tranId, fileName, base64 }
 *     base64 = the PDF bytes, base64-encoded (RESTlets can't return binary).
 *
 * SECURITY
 * Renders INVOICE records only: record.load is pinned to record.Type.INVOICE,
 * so an id belonging to any other record type throws instead of rendering.
 * Read-only — nothing is created or modified.
 */
define(['N/render', 'N/record', 'N/error'], function (render, record, error) {
  function get(context) {
    var id = context.invoiceId;
    if (!id || !/^\d+$/.test(String(id))) {
      throw error.create({ name: 'BAD_ID', message: 'invoiceId=<internal id> required' });
    }

    // Type guard + tranid lookup in one load: pinned to INVOICE, so a sales
    // order / payment / any other record id throws rather than rendering.
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

  return { get: get };
});
