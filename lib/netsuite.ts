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
    location: { location_name: string; netsuite_id: string } | null;
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
}

export interface NSInventoryItem {
  sku: string;
  locationId: string;
  quantityOnHand: number;
  quantityAvailable: number;
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

  // SuiteQL — returns rows array
  async suiteQL<T = Record<string, unknown>>(query: string): Promise<T[]> {
    const response = await this.request<{ items: T[] }>(
      '/query/v1/suiteql',
      'POST',
      { q: query }
    );
    return response.items || [];
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

    const lineItems: object[] = [];
    for (const item of consolidated.values()) {
      lineItems.push({
        item: { id: item.nsItemId },
        quantity: item.quantity,
        rate: item.rate,
      });
    }

    // Support fund discount line — single negative-rate line, matches CSV export
    if (order.support_fund_used && order.support_fund_used > 0) {
      const discountRows = await this.suiteQL<{ id: string }>(
        `SELECT id FROM item WHERE itemid = 'Partner Discount'`
      );
      if (discountRows.length === 0) {
        throw new Error(
          'Order uses support funds but no item named "Partner Discount" exists in NetSuite. Create it as a Discount or Other Charge item.'
        );
      }
      lineItems.push({
        item: { id: String(discountRows[0].id) },
        quantity: 1,
        rate: -order.support_fund_used,
        description: 'Distributor Support Fund',
      });
    }

    const subsidiaryName = company.subsidiary.name;
    const orderDate = new Date(order.created_at);
    const tranDate = orderDate.toISOString().split('T')[0];

    const payload: Record<string, unknown> = {
      entity: { id: company.netsuite_internal_id },
      subsidiary: { id: company.subsidiary.netsuite_id },
      location: { id: company.location.netsuite_id },
      tranDate,
      orderstatus: { id: 'B' }, // Pending Fulfillment
      currency: { id: '1' }, // USD — adjust if your NS USD currency internal ID differs
      otherRefNum: order.po_number || '',
      item: {
        items: lineItems,
      },
    };

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

    // Fetch invoice details
    const inv = await this.request<{ tranId: string; tranDate: string; status: { refName: string } }>(
      `/record/v1/invoice/${nsInvoiceId}`
    );

    return {
      nsInvoiceId,
      invoiceNumber: inv.tranId || nsInvoiceId,
      invoiceDate: inv.tranDate || new Date().toISOString().split('T')[0],
      status: inv.status?.refName || 'Open',
    };
  }

  // ---------------------------------------------------------------------------
  // Sync invoice data back from NetSuite
  // ---------------------------------------------------------------------------
  async getInvoiceDetails(nsInvoiceId: string): Promise<NSInvoiceResult> {
    const inv = await this.request<{ tranId: string; tranDate: string; status: { refName: string } }>(
      `/record/v1/invoice/${nsInvoiceId}`
    );
    return {
      nsInvoiceId,
      invoiceNumber: inv.tranId || nsInvoiceId,
      invoiceDate: inv.tranDate || '',
      status: inv.status?.refName || '',
    };
  }

  // ---------------------------------------------------------------------------
  // Inventory sync — returns on-hand quantities by location
  // locationNsId: the NS internal ID of the location (from Locations.netsuite_id)
  // ---------------------------------------------------------------------------
  async getInventoryByLocation(locationNsId: string): Promise<NSInventoryItem[]> {
    const rows = await this.suiteQL<{
      item: string;
      location: string;
      quantityonhand: string;
      quantityavailable: string;
      itemid: string;
    }>(
      `SELECT il.item, il.location, il.quantityonhand, il.quantityavailable, i.itemid
       FROM inventoryBalance il
       JOIN item i ON i.id = il.item
       WHERE il.location = ${locationNsId}
       AND i.itemid IS NOT NULL`
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
