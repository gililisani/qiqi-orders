/**
 * Inventory Check — NetSuite vs the warehouse system (ShipHero at BrandFox),
 * per SKU, for each ships-from location. Pure.
 *
 * The comparison is on hand vs on hand. ShipHero's on hand excludes units in
 * non-sellable bins (damaged / on hold), so those are carried separately and
 * shown, never folded into the difference. NetSuite committed and ShipHero
 * allocated are context: they explain timing (an order BrandFox shipped but
 * NetSuite has not fulfilled yet), they are not part of the difference.
 */

export interface NsStock {
  sku: string;
  name: string | null;
  onHand: number;
  available: number;
  committed: number;
}

export interface WmsStock {
  sku: string;
  name: string | null;
  onHand: number;
  available: number;
  allocated: number;
  nonSellable: number;
  kit: boolean;
}

export interface CheckLine {
  sku: string;
  name: string | null;
  in_catalog: boolean;
  ns_on_hand: number | null;
  ns_available: number | null;
  ns_committed: number | null;
  wms_on_hand: number | null;
  wms_available: number | null;
  wms_allocated: number | null;
  wms_non_sellable: number | null;
  wms_kit: boolean;
}

export type LineStatus = 'match' | 'different' | 'ns_only' | 'wms_only';

/** SKU key: tolerant of case and stray spaces (never strict-equal domain text). */
export const skuKey = (sku: string) => sku.trim().toUpperCase();

/** Sum rows per SKU (ShipHero has a row per warehouse). */
export function sumWmsBySku(rows: WmsStock[]): WmsStock[] {
  const by = new Map<string, WmsStock>();
  for (const r of rows) {
    const k = skuKey(r.sku);
    const e = by.get(k);
    if (!e) by.set(k, { ...r, sku: r.sku.trim() });
    else {
      e.onHand += r.onHand;
      e.available += r.available;
      e.allocated += r.allocated;
      e.nonSellable += r.nonSellable;
      e.kit = e.kit || r.kit;
      e.name = e.name ?? r.name;
    }
  }
  return [...by.values()];
}

const hasStock = (n: number | null | undefined) => !!n && n !== 0;

/**
 * One line per SKU that either system holds or has spoken for. Name comes
 * from the Hub catalog first, then ShipHero, then NetSuite.
 */
export function buildCheckLines(
  ns: NsStock[],
  wms: WmsStock[],
  catalog: Map<string, string | null>, // skuKey → Hub product name
): CheckLine[] {
  const nsBy = new Map(ns.map((r) => [skuKey(r.sku), r]));
  const wmsBy = new Map(sumWmsBySku(wms).map((r) => [skuKey(r.sku), r]));
  const keys = new Set<string>();
  for (const [k, r] of nsBy) if (hasStock(r.onHand) || hasStock(r.committed)) keys.add(k);
  for (const [k, r] of wmsBy) if (hasStock(r.onHand) || hasStock(r.nonSellable) || hasStock(r.allocated)) keys.add(k);

  const lines: CheckLine[] = [];
  for (const k of keys) {
    const n = nsBy.get(k);
    const w = wmsBy.get(k);
    const inCatalog = catalog.has(k);
    lines.push({
      sku: n?.sku.trim() ?? w!.sku,
      name: (inCatalog ? catalog.get(k) : null) || w?.name || n?.name || null,
      in_catalog: inCatalog,
      ns_on_hand: n ? n.onHand : null,
      ns_available: n ? n.available : null,
      ns_committed: n ? n.committed : null,
      wms_on_hand: w ? w.onHand : null,
      wms_available: w ? w.available : null,
      wms_allocated: w ? w.allocated : null,
      wms_non_sellable: w ? w.nonSellable : null,
      wms_kit: w?.kit ?? false,
    });
  }
  return lines.sort((a, b) => Number(b.in_catalog) - Number(a.in_catalog) || a.sku.localeCompare(b.sku));
}

/** NetSuite on hand minus ShipHero on hand (a missing side counts as 0). */
export function lineDifference(l: Pick<CheckLine, 'ns_on_hand' | 'wms_on_hand'>): number {
  return (l.ns_on_hand ?? 0) - (l.wms_on_hand ?? 0);
}

export function lineStatus(l: Pick<CheckLine, 'ns_on_hand' | 'wms_on_hand'>): LineStatus {
  if (l.wms_on_hand === null) return 'ns_only';
  if (l.ns_on_hand === null) return 'wms_only';
  return lineDifference(l) === 0 ? 'match' : 'different';
}

export interface CheckSummary {
  skus: number;
  matching: number;
  different: number;
  onlyOneSide: number;
  /** Sum of |difference| over catalog products. */
  productUnitsOff: number;
}

export function summarize(lines: CheckLine[]): CheckSummary {
  const s: CheckSummary = { skus: lines.length, matching: 0, different: 0, onlyOneSide: 0, productUnitsOff: 0 };
  for (const l of lines) {
    const st = lineStatus(l);
    if (st === 'match') s.matching += 1;
    else if (st === 'different') s.different += 1;
    else s.onlyOneSide += 1;
    if (l.in_catalog) s.productUnitsOff += Math.abs(lineDifference(l));
  }
  return s;
}
