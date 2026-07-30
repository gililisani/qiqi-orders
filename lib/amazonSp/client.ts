/**
 * Amazon Selling Partner API client (server-only).
 *
 * Self-authorized private app — auth is Login-with-Amazon only (new SP-API
 * apps don't use AWS SigV4): exchange the refresh token for a short-lived
 * access token, send it as `x-amz-access-token`. Access tokens are cached
 * in-module until ~1 minute before expiry.
 *
 * Env: AMAZON_SP_CLIENT_ID, AMAZON_SP_CLIENT_SECRET, AMAZON_SP_REFRESH_TOKEN
 * Optional: AMAZON_SP_MARKETPLACE_ID (defaults to Amazon.com US).
 */

import axios from 'axios';
import { gunzipSync } from 'zlib';

const LWA_URL = 'https://api.amazon.com/auth/o2/token';
const BASE = 'https://sellingpartnerapi-na.amazon.com';

export const US_MARKETPLACE_ID = process.env.AMAZON_SP_MARKETPLACE_ID || 'ATVPDKIKX0DER';

// Seller Central (and the Sales API's day boundaries) run on Pacific time.
export const AMAZON_TZ_OFFSET = '-07:00';

let cachedToken: { token: string; expiresAt: number } | null = null;

export function isAmazonSpConfigured(): boolean {
  return !!(
    process.env.AMAZON_SP_CLIENT_ID &&
    process.env.AMAZON_SP_CLIENT_SECRET &&
    process.env.AMAZON_SP_REFRESH_TOKEN
  );
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;
  const res = await axios.post(
    LWA_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: process.env.AMAZON_SP_REFRESH_TOKEN || '',
      client_id: process.env.AMAZON_SP_CLIENT_ID || '',
      client_secret: process.env.AMAZON_SP_CLIENT_SECRET || '',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true }
  );
  if (res.status !== 200 || !res.data?.access_token) {
    throw new Error(
      `Amazon LWA token exchange failed (HTTP ${res.status}): ${JSON.stringify(res.data).slice(0, 300)}`
    );
  }
  cachedToken = {
    token: res.data.access_token,
    expiresAt: Date.now() + (res.data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function spGet<T>(path: string, params?: Record<string, string | number | boolean>): Promise<T> {
  const token = await getAccessToken();
  const res = await axios.get(`${BASE}${path}`, {
    params,
    headers: { 'x-amz-access-token': token },
    validateStatus: () => true,
  });
  if (res.status === 429) {
    // one polite retry after the throttle window
    await new Promise((r) => setTimeout(r, 2500));
    return spGet<T>(path, params);
  }
  if (res.status >= 400) {
    const msg = res.data?.errors?.map((e: any) => e.message).join(' | ') || JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Amazon SP-API ${path} failed (HTTP ${res.status}): ${msg}`);
  }
  return res.data as T;
}

async function spPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const res = await axios.post(`${BASE}${path}`, body, {
    headers: { 'x-amz-access-token': token, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  if (res.status >= 400) {
    const msg = res.data?.errors?.map((e: any) => e.message).join(' | ') || JSON.stringify(res.data).slice(0, 300);
    throw new Error(`Amazon SP-API ${path} failed (HTTP ${res.status}): ${msg}`);
  }
  return res.data as T;
}

// ---------------------------------------------------------------------------
// Sales API — aggregated order metrics
// ---------------------------------------------------------------------------
export interface OrderMetrics {
  interval: string;
  unitCount: number;
  orderItemCount: number;
  orderCount: number;
  averageUnitPrice: { amount: number; currencyCode: string };
  totalSales: { amount: number; currencyCode: string };
}

export async function getOrderMetrics(
  startIso: string, // e.g. 2026-07-01T00:00:00-07:00
  endIso: string,
  granularity: 'Hour' | 'Day' | 'Total' = 'Total'
): Promise<OrderMetrics[]> {
  const data = await spGet<{ payload: OrderMetrics[] }>('/sales/v1/orderMetrics', {
    marketplaceIds: US_MARKETPLACE_ID,
    interval: `${startIso}--${endIso}`,
    granularity,
    granularityTimeZone: 'America/Los_Angeles',
  });
  return data.payload || [];
}

// ---------------------------------------------------------------------------
// FBA Inventory API
// ---------------------------------------------------------------------------
export interface FbaInventorySummary {
  sellerSku: string;
  fnSku?: string;
  asin?: string;
  productName?: string;
  totalQuantity: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: { totalReservedQuantity?: number };
    unfulfillableQuantity?: { totalUnfulfillableQuantity?: number };
    researchingQuantity?: { totalResearchingQuantity?: number };
  };
}

export async function getFbaInventory(): Promise<FbaInventorySummary[]> {
  const out: FbaInventorySummary[] = [];
  let nextToken: string | undefined;
  do {
    const params: Record<string, string | boolean> = {
      granularityType: 'Marketplace',
      granularityId: US_MARKETPLACE_ID,
      marketplaceIds: US_MARKETPLACE_ID,
      details: true,
    };
    if (nextToken) params.nextToken = nextToken;
    const data = await spGet<{
      payload: { inventorySummaries: FbaInventorySummary[] };
      pagination?: { nextToken?: string };
    }>('/fba/inventory/v1/summaries', params);
    out.push(...(data.payload?.inventorySummaries || []));
    nextToken = data.pagination?.nextToken;
  } while (nextToken);
  return out;
}

// ---------------------------------------------------------------------------
// Finances API — financial events (paged)
// ---------------------------------------------------------------------------
export interface FinancialEvents {
  ShipmentEventList?: any[];
  RefundEventList?: any[];
  ServiceFeeEventList?: any[];
  AdjustmentEventList?: any[];
  [key: string]: any[] | undefined;
}

export async function getFinancialEvents(
  postedAfterIso: string,
  postedBeforeIso: string
): Promise<FinancialEvents> {
  // Amazon rejects PostedBefore later than ~2 minutes before now
  // ("Date is not valid, should be no later than 2 minutes from now") —
  // clamp so "this month up to today" queries work during the day.
  const cap = Date.now() - 3 * 60_000;
  const requested = new Date(postedBeforeIso).getTime();
  const effectiveBefore = new Date(Math.min(requested, cap)).toISOString();

  const merged: FinancialEvents = {};
  let nextToken: string | undefined;
  do {
    const params: Record<string, string | number> = nextToken
      ? { NextToken: nextToken }
      : { PostedAfter: postedAfterIso, PostedBefore: effectiveBefore, MaxResultsPerPage: 100 };
    const data = await spGet<{
      payload: { FinancialEvents: FinancialEvents; NextToken?: string };
    }>('/finances/v0/financialEvents', params);
    const events = data.payload?.FinancialEvents || {};
    for (const [key, list] of Object.entries(events)) {
      if (!Array.isArray(list) || list.length === 0) continue;
      merged[key] = [...(merged[key] || []), ...list];
    }
    nextToken = data.payload?.NextToken;
  } while (nextToken);
  return merged;
}

// ---------------------------------------------------------------------------
// Reports API — request / poll / download (TSV, possibly gzipped)
// ---------------------------------------------------------------------------
export const REPORT_TYPES = {
  fbaReturns: 'GET_FBA_FULFILLMENT_CUSTOMER_RETURNS_DATA',
  fbaReimbursements: 'GET_FBA_REIMBURSEMENTS_DATA',
} as const;

export async function createReport(
  reportType: string,
  dataStartIso: string,
  dataEndIso: string
): Promise<string> {
  const data = await spPost<{ reportId: string }>('/reports/2021-06-30/reports', {
    reportType,
    marketplaceIds: [US_MARKETPLACE_ID],
    dataStartTime: dataStartIso,
    dataEndTime: dataEndIso,
  });
  return data.reportId;
}

export interface ReportStatus {
  reportId: string;
  processingStatus: 'IN_QUEUE' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'FATAL';
  reportDocumentId?: string;
}

export async function getReportStatus(reportId: string): Promise<ReportStatus> {
  return spGet<ReportStatus>(`/reports/2021-06-30/reports/${reportId}`);
}

/** Download a finished report document and parse the TSV into row objects. */
export async function downloadReportRows(reportDocumentId: string): Promise<Record<string, string>[]> {
  const doc = await spGet<{ url: string; compressionAlgorithm?: string }>(
    `/reports/2021-06-30/documents/${reportDocumentId}`
  );
  const res = await axios.get(doc.url, { responseType: 'arraybuffer', validateStatus: () => true });
  if (res.status >= 400) throw new Error(`Report document download failed (HTTP ${res.status}).`);
  let buffer = Buffer.from(res.data);
  if (doc.compressionAlgorithm === 'GZIP') buffer = gunzipSync(buffer);
  return parseTsv(buffer.toString('utf-8'));
}

/** Parse tab-separated report text into objects keyed by header row. */
export function parseTsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split('\t').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = (cells[i] || '').trim()));
    return row;
  });
}

/** Strip the marketplace suffix Amazon seller SKUs carry (FPS0030-FBA → FPS0030). */
export function normalizeSellerSku(sellerSku: string): string {
  return (sellerSku || '').replace(/-FBA$/i, '').trim();
}
