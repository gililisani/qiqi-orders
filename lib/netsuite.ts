import OAuth from 'oauth-1.0a';
import crypto from 'crypto-js';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NetSuiteConfig {
  accountId: string;
  consumerKey: string;
  consumerSecret: string;
  tokenId: string;
  tokenSecret: string;
}

interface HubOrderForSync {
  id: string;
  po_number: string | null;
  created_at: string;
  company: {
    company_name: string;
    netsuite_number: string;
    netsuite_internal_id: string;
    subsidiary: { name: string; netsuite_id: string } | null;
    // The location passed here is the FULFILLING location (typically the
    // snapshot from orders.location_id, falling back to companies.location_id).
    // Includes the location's own subsidiary so push-SO can detect cross-sub
    // fulfillment (location.subsidiary.netsuite_id !== company.subsidiary.netsuite_id).
    location: {
      location_name: string;
      netsuite_id: string;
      subsidiary: { netsuite_id: string } | null;
    } | null;
    class: { name: string } | null;
  };
  order_items: Array<{
    quantity: number;
    unit_price: number;
    total_price: number;
    is_support_fund_item: boolean;
    product: { sku: string; item_name: string; netsuite_name: string | null };
  }>;
  support_fund_used: number | null;
}

export interface NSSalesOrderResult {
  nsSOId: string;
  soNumber: string;
}

export interface NSInvoiceResult {
  nsInvoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  // Both fields come straight off the NS invoice record. amountRemaining is
  // the canonical "open balance" — 0 means paid in full. dueDate is ISO.
  // Both may be null if NS doesn't expose the field for a given invoice
  // (e.g. drafts) — callers should handle null gracefully.
  amountRemaining: number | null;
  dueDate: string | null;
}

export interface NSInventoryItem {
  sku: string;
  locationId: string;
  quantityOnHand: number;
  quantityAvailable: number;
}

// One row from the as-of-date inventory RESTlet.
export interface AsOfInventoryRow {
  itemId: string;
  itemCode: string;
  locationId: string;
  locationName: string;
  qty: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a date string returned by SuiteQL into ISO YYYY-MM-DD that
 * Postgres DATE columns accept. SuiteQL renders dates in the NetSuite
 * account's preferred format (e.g. "29/04/2026" on a DD/MM/YYYY account),
 * which Postgres rejects with "date/time field value out of range".
 *
 * The NS REST API ("/record/v1/...") already returns ISO, so this is only
 * needed at the SuiteQL boundary.
 *
 * Strategy: pass through ISO; for slash/dash-separated 3-part dates use a
 * heuristic on the first two components (a > 12 → DD/MM, b > 12 → MM/DD,
 * ambiguous → assume DD/MM since the production account is DD/MM/YYYY).
 * Returns null when the input is empty or unparseable so callers can decide
 * whether to drop the field or surface the error.
 */
export function normalizeNsDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return null;
  let day = parseInt(m[1], 10);
  let month = parseInt(m[2], 10);
  const year = m[3];

  if (day > 12 && month <= 12) {
    // DD/MM/YYYY — keep as parsed
  } else if (month > 12 && day <= 12) {
    // MM/DD/YYYY — swap
    [day, month] = [month, day];
  }
  // Ambiguous (both ≤ 12) → keep as DD/MM (Israeli account default)

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// NetSuiteAPI class
// ---------------------------------------------------------------------------

export class NetSuiteAPI {
  private oauth: OAuth;
  private config: NetSuiteConfig;
  private baseUrl: string;

  constructor(config: NetSuiteConfig) {
    this.config = config;
    // Account ID in URL uses hyphens (e.g. 7505124 → 7505124, 7505124_SB1 → 7505124-sb1)
    const urlAccountId = config.accountId.toLowerCase().replace(/_/g, '-');
    this.baseUrl = `https://${urlAccountId}.suitetalk.api.netsuite.com/services/rest`;

    this.oauth = new OAuth({
      consumer: {
        key: config.consumerKey,
        secret: config.consumerSecret,
      },
      signature_method: 'HMAC-SHA256',
      hash_function(base_string: string, key: string) {
        return crypto.HmacSHA256(base_string, key).toString(crypto.enc.Base64);
      },
    });
  }

  private getAuthHeader(url: string, method: string): string {
    const requestData = { url, method };
    const token = { key: this.config.tokenId, secret: this.config.tokenSecret };
    const authHeader = this.oauth.toHeader(this.oauth.authorize(requestData, token));
    // NetSuite requires realm= in the Authorization header
    return authHeader.Authorization.replace(
      'OAuth ',
      `OAuth realm="${this.config.accountId.toUpperCase()}",`
    );
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const authHeader = this.getAuthHeader(url, method);

    const response = await axios({
      method,
      url,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        prefer: 'transient',
      },
      data: body !== undefined ? JSON.stringify(body) : undefined,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      const msg =
        response.data?.['o:message'] ||
        response.data?.message ||
        JSON.stringify(response.data) ||
        `HTTP ${response.status}`;
      throw new Error(`NetSuite ${response.status}: ${msg}`);
    }

    return response.data as T;
  }

  // SuiteQL — returns rows array (first page only, max 1000 rows)
  async suiteQL<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const response = await this.request<{ items: T[] }>(
      '/query/v1/suiteql',
      'POST',
      { q: query }
    );
    return response.items || [];
  }

  // SuiteQL with pagination — loops offset until NetSuite reports no more rows.
  // Use this for unbounded result sets (e.g. a full transaction history); the
  // plain suiteQL() caps at the first 1000 rows.
  async suiteQLPaged<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    for (;;) {
      const response = await this.request<{ items: T[]; hasMore: boolean }>(
        `/query/v1/suiteql?limit=1000&offset=${offset}`,
        'POST',
        { q: query }
      );
      out.push(...(response.items || []));
      if (!response.hasMore) break;
      offset += 1000;
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // RESTlet: as-of-date inventory (deployed in NetSuite, see netsuite/).
  // RESTlets live on a DIFFERENT host than SuiteTalk REST, and OAuth must sign
  // the FULL url incl. query params. Returns NetSuite's own measured on-hand per
  // (item, location) as of a date — the authoritative anchor for the engine.
  // ---------------------------------------------------------------------------
  async getInventoryAsOf(
    dateIso: string,
    opts?: { itemCode?: string },
  ): Promise<{ asOfDate: string; rows: AsOfInventoryRow[] }> {
    const scriptId = process.env.NETSUITE_ASOF_SCRIPT_ID;
    const deployId = process.env.NETSUITE_ASOF_DEPLOY_ID;
    if (!scriptId || !deployId) {
      throw new Error('RESTlet not configured: set NETSUITE_ASOF_SCRIPT_ID and NETSUITE_ASOF_DEPLOY_ID');
    }
    const urlAccountId = this.config.accountId.toLowerCase().replace(/_/g, '-');
    const base = `https://${urlAccountId}.restlets.api.netsuite.com/app/site/hosting/restlet.nl`;
    const params = new URLSearchParams({ script: scriptId, deploy: deployId, date: dateIso });
    if (opts?.itemCode) params.set('item', opts.itemCode);
    const url = `${base}?${params.toString()}`;

    const authHeader = this.getAuthHeader(url, 'GET');
    const response = await axios({
      method: 'GET',
      url,
      headers: { Authorization: authHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    if (response.status >= 400) {
      const msg = response.data?.['o:message'] || response.data?.message || JSON.stringify(response.data) || `HTTP ${response.status}`;
      throw new Error(`RESTlet ${response.status}: ${msg}`);
    }
    return response.data as { asOfDate: string; rows: AsOfInventoryRow[] };
  }

  isAsOfConfigured(): boolean {
    return !!process.env.NETSUITE_ASOF_SCRIPT_ID && !!process.env.NETSUITE_ASOF_DEPLOY_ID;
  }

  // ---------------------------------------------------------------------------
  // Item ID resolution — looks up NS internal IDs for a list of SKUs in one call
  // ---------------------------------------------------------------------------
  async resolveItemIdsBySku(skus: string[]): Promise<Map<string, string>> {
    const escaped = skus.map(s => `'${s.replace(/'/g, "''")}'`).join(', ');
    // itemId is NetSuite's standard SKU field (matches what the CSV import uses)
    const rows = await this.suiteQL<{ id: string; itemid: string }>(
      `SELECT id, itemid FROM item WHERE itemid IN (${escaped})`
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      if (row.itemid && row.id) {
        map.set(row.itemid, String(row.id));
      }
    }
    return map;
  }

  // ---------------------------------------------------------------------------
  // Tax item logic (mirrors CSV export)
  // ---------------------------------------------------------------------------
  private taxItemForSubsidiary(subsidiaryName: string): string {
    const lower = subsidiaryName.toLowerCase();
    if (lower.includes('global')) return 'ILY – Sales Export';
    if (lower.includes('inc')) return '';
    return 'ILY – Sales Export';
  }

  // ---------------------------------------------------------------------------
  // Push Hub order → NetSuite Sales Order
  // Returns { nsSOId, soNumber }
  // ---------------------------------------------------------------------------
  async pushOrderToNetSuite(order: HubOrderForSync): Promise<NSSalesOrderResult> {
    const company = order.company;

    if (!company.netsuite_internal_id) {
      throw new Error(
        `Company "${company.company_name}" has no NetSuite Internal ID set. Edit the company and add it.`
      );
    }
    if (!company.subsidiary?.netsuite_id) {
      throw new Error(
        `Subsidiary "${company.subsidiary?.name ?? 'unknown'}" has no NetSuite ID set. Edit the subsidiary and add it.`
      );
    }
    if (!company.location?.netsuite_id) {
      throw new Error(
        `Location "${company.location?.location_name ?? 'unknown'}" has no NetSuite ID set. Edit the location and add it.`
      );
    }

    // Resolve item internal IDs by SKU — include ALL items (regular + support-fund-tab
    // items) since they share SKUs and must be merged into single NS lines, matching
    // the CSV export logic. The support fund discount is applied as a separate
    // negative "Partner Discount" line below.
    const allItems = order.order_items;
    const skus = Array.from(new Set(allItems.map(i => i.product.sku)));
    const skuToId = await this.resolveItemIdsBySku(skus);

    const missingSkus = skus.filter(s => !skuToId.has(s));
    if (missingSkus.length > 0) {
      throw new Error(
        `Could not find NetSuite items for SKUs: ${missingSkus.join(', ')}. Check that SKUs match exactly in NetSuite.`
      );
    }

    // Consolidate duplicate SKUs by (sku, unit_price) — same as CSV export
    const consolidated = new Map<string, { nsItemId: string; quantity: number; rate: number }>();
    for (const item of allItems) {
      const key = `${item.product.sku}_${item.unit_price}`;
      if (consolidated.has(key)) {
        consolidated.get(key)!.quantity += item.quantity;
      } else {
        consolidated.set(key, {
          nsItemId: skuToId.get(item.product.sku)!,
          quantity: item.quantity,
          rate: item.unit_price,
        });
      }
    }

    // Cross-subsidiary fulfillment detection: when the fulfilling location
    // belongs to a different subsidiary than the customer, NetSuite needs
    // per-line `location` so it can auto-populate the inventory subsidiary.
    // Falls through to the simpler header-only location when same-subsidiary.
    const locationSubsidiaryNsId = company.location.subsidiary?.netsuite_id;
    const isCrossSubsidiary =
      !!locationSubsidiaryNsId &&
      locationSubsidiaryNsId !== company.subsidiary.netsuite_id;

    const lineItems: object[] = [];
    for (const item of consolidated.values()) {
      const line: Record<string, unknown> = {
        item: { id: item.nsItemId },
        quantity: item.quantity,
        rate: item.rate,
      };
      if (isCrossSubsidiary) {
        line.location = { id: company.location.netsuite_id };
      }
      lineItems.push(line);
    }

    // Support fund discount line — single negative-rate line
    if (order.support_fund_used && order.support_fund_used > 0) {
      const discountRows = await this.suiteQL<{ id: string; itemid: string }>(
        `SELECT id, itemid FROM item WHERE LOWER(itemid) = 'partners support funds'`
      );
      if (discountRows.length === 0) {
        throw new Error(
          'Order uses support funds but no item named "Partners Support Funds" was found in NetSuite. ' +
          'Verify the item exists and the integration role can see it.'
        );
      }
      const discountLine: Record<string, unknown> = {
        item: { id: String(discountRows[0].id) },
        quantity: 1,
        rate: -order.support_fund_used,
        description: 'Distributor Support Fund',
      };
      if (isCrossSubsidiary) {
        discountLine.location = { id: company.location.netsuite_id };
      }
      lineItems.push(discountLine);
    }

    const subsidiaryName = company.subsidiary.name;
    const orderDate = new Date(order.created_at);
    const tranDate = orderDate.toISOString().split('T')[0];

    const payload: Record<string, unknown> = {
      entity: { id: company.netsuite_internal_id },
      subsidiary: { id: company.subsidiary.netsuite_id },
      tranDate,
      orderstatus: { id: 'B' }, // Pending Fulfillment
      currency: { id: '1' }, // USD — adjust if your NS USD currency internal ID differs
      otherRefNum: order.po_number || '',
      item: {
        items: lineItems,
      },
    };

    // Header location: skip in cross-sub mode (lines carry their own
    // location). For normal same-subsidiary orders, set it as before so
    // every line inherits.
    if (!isCrossSubsidiary) {
      payload.location = { id: company.location.netsuite_id };
    }

    // Tax item — added as a custom body field if applicable
    const taxItem = this.taxItemForSubsidiary(subsidiaryName);
    if (taxItem) {
      payload['taxItem'] = { refName: taxItem };
    }

    // Class if available
    if (company.class?.name) {
      payload['class'] = { refName: company.class.name };
    }

    // POST to create the sales order — NS returns 204 with Location header containing internal ID
    const url = `${this.baseUrl}/record/v1/salesOrder`;
    const authHeader = this.getAuthHeader(url, 'POST');
    const createResponse = await axios({
      method: 'POST',
      url,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: JSON.stringify(payload),
      validateStatus: () => true,
    });

    if (createResponse.status !== 204 && createResponse.status !== 200 && createResponse.status !== 201) {
      const msg =
        createResponse.data?.['o:message'] ||
        createResponse.data?.message ||
        JSON.stringify(createResponse.data) ||
        `HTTP ${createResponse.status}`;
      throw new Error(`NetSuite create SO failed: ${msg}`);
    }

    // Extract the internal ID from the Location response header
    const location = createResponse.headers['location'] as string | undefined;
    const nsSOId = location ? location.split('/').pop() ?? '' : '';

    if (!nsSOId) {
      throw new Error('NetSuite created the SO but did not return an ID in the Location header.');
    }

    // Fetch the SO to get the readable SO number (tranId)
    const soData = await this.request<{ tranId: string }>(`/record/v1/salesOrder/${nsSOId}`);
    const soNumber = soData.tranId || nsSOId;

    return { nsSOId, soNumber };
  }

  // ---------------------------------------------------------------------------
  // Transform Sales Order → Invoice
  // ---------------------------------------------------------------------------
  async createInvoiceFromSO(nsSOId: string): Promise<NSInvoiceResult> {
    const url = `${this.baseUrl}/record/v1/salesOrder/${nsSOId}/!transform/invoice`;
    const authHeader = this.getAuthHeader(url, 'POST');
    const response = await axios({
      method: 'POST',
      url,
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      data: JSON.stringify({}),
      validateStatus: () => true,
    });

    if (response.status !== 204 && response.status !== 200 && response.status !== 201) {
      const msg =
        response.data?.['o:message'] ||
        response.data?.message ||
        JSON.stringify(response.data) ||
        `HTTP ${response.status}`;
      throw new Error(`NetSuite create invoice failed: ${msg}`);
    }

    const location = response.headers['location'] as string | undefined;
    const nsInvoiceId = location ? location.split('/').pop() ?? '' : '';
    if (!nsInvoiceId) {
      throw new Error('NetSuite created the invoice but did not return an ID.');
    }

    // Fetch full invoice details via the shared helper so amountRemaining +
    // dueDate are populated for create-invoice callers (same as sync).
    return this.getInvoiceDetails(nsInvoiceId);
  }

  // ---------------------------------------------------------------------------
  // Sync invoice data back from NetSuite
  // ---------------------------------------------------------------------------
  async getInvoiceDetails(nsInvoiceId: string): Promise<NSInvoiceResult> {
    // NS REST returns the invoice record. The amountRemaining + dueDate
    // fields aren't always present in the default response — pulled when
    // they exist, otherwise null. Date fields come back ISO from REST
    // (unlike SuiteQL), so no normalizeNsDate needed here.
    const inv = await this.request<{
      tranId: string;
      tranDate: string;
      status: { refName: string };
      amountRemaining?: number | string;
      dueDate?: string;
    }>(`/record/v1/invoice/${nsInvoiceId}`);

    const amountRemainingRaw = inv.amountRemaining;
    const amountRemaining =
      amountRemainingRaw == null
        ? null
        : typeof amountRemainingRaw === 'number'
          ? amountRemainingRaw
          : parseFloat(String(amountRemainingRaw));

    return {
      nsInvoiceId,
      invoiceNumber: inv.tranId || nsInvoiceId,
      invoiceDate: inv.tranDate || '',
      status: inv.status?.refName || '',
      amountRemaining: Number.isFinite(amountRemaining) ? amountRemaining : null,
      dueDate: inv.dueDate || null,
    };
  }

  // ---------------------------------------------------------------------------
  // Look up a Sales Order by its tranid (the human-readable SO number).
  // Returns null if no SO with that tranid exists in NetSuite. Used by the
  // reconcile-order flow to backfill netsuite_so_id on legacy orders that
  // have an admin-entered so_number but were never pushed through the Hub.
  // ---------------------------------------------------------------------------
  async findSalesOrderByTranId(
    tranId: string,
  ): Promise<NSSalesOrderResult | null> {
    // Normalize: trim + uppercase on both sides. Admin-typed SO numbers can
    // drift in case/whitespace vs the NS canonical form (e.g. "sous16162" vs
    // "SOUS16162"). Using transaction.type ('SalesOrd' code) is the canonical
    // column — recordtype works in most accounts but type is more portable.
    const escaped = tranId.trim().toUpperCase().replace(/'/g, "''");
    const rows = await this.suiteQL<{ id: string; tranid: string }>(
      `SELECT id, tranid
         FROM transaction
        WHERE type = 'SalesOrd'
          AND UPPER(TRIM(tranid)) = '${escaped}'
        FETCH FIRST 1 ROWS ONLY`,
    );
    if (rows.length === 0) return null;
    return { nsSOId: String(rows[0].id), soNumber: rows[0].tranid };
  }

  // ---------------------------------------------------------------------------
  // Look up the invoice created from a given SO (if any). Used by reconcile.
  // ---------------------------------------------------------------------------
  async findInvoiceForSalesOrder(
    nsSOId: string,
  ): Promise<NSInvoiceResult | null> {
    // Invoices created from an SO link via nexttransactionlink.previousdoc.
    const rows = await this.suiteQL<{
      id: string;
      tranid: string;
      trandate: string;
      status: string;
    }>(
      `SELECT t.id, t.tranid, t.trandate, BUILTIN.DF(t.status) AS status
         FROM transaction t
         JOIN nexttransactionlink ntl ON ntl.nextdoc = t.id
        WHERE ntl.previousdoc = ${nsSOId}
          AND t.type = 'CustInvc'
        ORDER BY t.trandate DESC
        FETCH FIRST 1 ROWS ONLY`,
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    // SuiteQL gives us enough to find the invoice; for amountRemaining +
    // dueDate the caller should call getInvoiceDetails(nsInvoiceId) which
    // hits the REST record endpoint. We return null for those fields here.
    return {
      nsInvoiceId: String(r.id),
      invoiceNumber: r.tranid,
      invoiceDate: normalizeNsDate(r.trandate) ?? '',
      status: r.status || '',
      amountRemaining: null,
      dueDate: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Check if an invoice has any payments applied (Customer Payments)
  // Returns the list of payment internal IDs, empty array if none.
  // ---------------------------------------------------------------------------
  async getInvoicePayments(nsInvoiceId: string): Promise<string[]> {
    const rows = await this.suiteQL<{ id: string }>(
      `SELECT DISTINCT t.id
       FROM transaction t
       JOIN nexttransactionlink ntl ON ntl.nextdoc = t.id
       WHERE ntl.previousdoc = ${nsInvoiceId}
       AND t.type = 'CustPymt'`
    );
    return rows.map(r => String(r.id));
  }

  /**
   * Rich version of getInvoicePayments — returns one row per payment that
   * applies to the given invoice.
   *
   * Link direction (verified against the QiqiIL account, May 2026): the
   * payment is the `previousdoc` (the applying transaction) and the
   * invoice is the `nextdoc` (the target). The NextTransactionLink table
   * does NOT have a foreignamount column in this account, so we cannot get
   * the per-application amount from the link itself — we report the
   * payment's total. For the common case (1 payment = 1 invoice) this is
   * exactly the applied amount; for split payments (one payment applied
   * to multiple invoices) it over-reports. We accept that for v1 — if it
   * becomes a real issue we'll join transactionline for the per-line
   * apply amount.
   *
   * Includes CustPymt (Customer Payment), CustCred (Credit Memo) and
   * CustDep (Customer Deposit) — any of these can settle an invoice.
   * Dates are normalized via normalizeNsDate.
   */
  async getInvoicePaymentsDetailed(nsInvoiceId: string): Promise<
    Array<{
      nsPaymentId: string;
      tranId: string;
      tranDate: string | null;
      status: string;
      type: string;
      paymentTotal: number;
    }>
  > {
    const rows = await this.suiteQL<{
      id: string;
      tranid: string;
      trandate: string;
      status: string;
      type: string;
      payment_total: string;
    }>(
      `SELECT DISTINCT t.id,
              t.tranid,
              t.trandate,
              BUILTIN.DF(t.status) AS status,
              t.type,
              ABS(t.foreigntotal)  AS payment_total
         FROM transaction t
         JOIN nexttransactionlink ntl ON ntl.previousdoc = t.id
        WHERE ntl.nextdoc = ${nsInvoiceId}
          AND t.type IN ('CustPymt', 'CustCred', 'CustDep')
        ORDER BY t.trandate DESC`,
    );
    return rows.map((r) => ({
      nsPaymentId: String(r.id),
      tranId: r.tranid,
      tranDate: normalizeNsDate(r.trandate),
      status: r.status || '',
      type: r.type || '',
      paymentTotal: parseFloat(r.payment_total) || 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Delete a NetSuite Sales Order by internal ID.
  // Idempotent: 404 (already gone) is treated as success.
  // ---------------------------------------------------------------------------
  async deleteSalesOrder(nsSOId: string): Promise<void> {
    try {
      await this.request(`/record/v1/salesOrder/${nsSOId}`, 'DELETE');
    } catch (e: any) {
      if (e?.message?.includes('NetSuite 404')) return;
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Delete a NetSuite Invoice by internal ID.
  // Idempotent: 404 (already gone) is treated as success.
  // ---------------------------------------------------------------------------
  async deleteInvoice(nsInvoiceId: string): Promise<void> {
    try {
      await this.request(`/record/v1/invoice/${nsInvoiceId}`, 'DELETE');
    } catch (e: any) {
      if (e?.message?.includes('NetSuite 404')) return;
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Inventory sync — returns on-hand quantities by location
  // locationNsId: the NS internal ID of the location (from Locations.netsuite_id)
  // ---------------------------------------------------------------------------
  async getInventoryByLocation(locationNsId: string): Promise<NSInventoryItem[]> {
    // inventoryBalance can return multiple rows per (item, location) when an
    // item is stocked in multiple bins / lots / serials. Aggregate at the
    // SuiteQL layer so the caller gets exactly one row per item — otherwise
    // the downstream upsert against (product_id, location_id) errors with
    // "ON CONFLICT DO UPDATE command cannot affect row a second time".
    const rows = await this.suiteQL<{
      item: string;
      location: string;
      quantityonhand: string;
      quantityavailable: string;
      itemid: string;
    }>(
      `SELECT il.item,
              il.location,
              SUM(il.quantityonhand)    AS quantityonhand,
              SUM(il.quantityavailable) AS quantityavailable,
              i.itemid
         FROM inventoryBalance il
         JOIN item i ON i.id = il.item
        WHERE il.location = ${locationNsId}
          AND i.itemid IS NOT NULL
        GROUP BY il.item, il.location, i.itemid`
    );

    return rows.map(r => ({
      sku: r.itemid,
      locationId: String(r.location),
      quantityOnHand: parseFloat(r.quantityonhand) || 0,
      quantityAvailable: parseFloat(r.quantityavailable) || 0,
    }));
  }

  // ---------------------------------------------------------------------------
  // Connection test
  // ---------------------------------------------------------------------------
  async testConnection(): Promise<boolean> {
    try {
      await this.suiteQL('SELECT id FROM subsidiary LIMIT 1');
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createNetSuiteAPI(): NetSuiteAPI {
  const accountId = process.env.NETSUITE_ACCOUNT_ID;
  if (!accountId) throw new Error('NETSUITE_ACCOUNT_ID env var is not set');

  return new NetSuiteAPI({
    accountId,
    consumerKey: process.env.NETSUITE_CONSUMER_KEY ?? '',
    consumerSecret: process.env.NETSUITE_CONSUMER_SECRET ?? '',
    tokenId: process.env.NETSUITE_TOKEN_ID ?? '',
    tokenSecret: process.env.NETSUITE_TOKEN_SECRET ?? '',
  });
}
