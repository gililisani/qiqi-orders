import { describe, it, expect } from 'vitest';
import { applyResolutions } from '@/lib/amazonFba/applyResolutions';
import { parseReportRows, buildMonthPreviews, type AmazonItemMapping } from '@/lib/amazonFba/parseReport';

const HEADER =
  '"Date","Transaction Status","Transaction type","Order ID","Product Details","Total product charges","Total promotional rebates","Amazon fees","Other","Total (USD)"';

const MAPPINGS: AmazonItemMapping[] = [
  { amazon_name: 'QIQI All Out Blowout Blow Dry Cream | Ha...', ns_item_id: '101', ns_item_name: 'Blowout', unit_price: 48 },
  { amazon_name: 'QIQI Smooth Service Shampoo - Moisturizi...', ns_item_id: '102', ns_item_name: 'Shampoo', unit_price: 40 },
];

function previewWith(rows: string[]) {
  const { rows: parsed } = parseReportRows([HEADER, ...rows].join('\n'));
  return buildMonthPreviews(parsed, MAPPINGS)[0];
}

describe('applyResolutions', () => {
  it('resolves a multi-product row into explicit lines and turns the month green', () => {
    const preview = previewWith([
      '"2/01/2026","Released","Order Payment","112-A","QIQI Blowout and Shampoo bundle,...","88","0","-20","0","68"',
      '"2/02/2026","Released","Order Payment","112-B","QIQI All Out Blowout Blow Dry Cream | Ha...","48","0","-11","0","37"',
    ]);
    expect(preview.reconciles).toBe(false);

    const { preview: resolved, errors } = applyResolutions(preview, [
      {
        attentionIndex: 0,
        lines: [
          { nsItemId: '101', nsItemName: 'Blowout', quantity: 1, unitPrice: 48 },
          { nsItemId: '102', nsItemName: 'Shampoo', quantity: 1, unitPrice: 40 },
        ],
      },
    ]);
    expect(errors).toEqual([]);
    expect(resolved.saleLines).toHaveLength(3);
    expect(resolved.grossSales).toBe(136);
    expect(resolved.needsAttention).toHaveLength(0);
    expect(resolved.computedNet).toBe(resolved.reportNet);
    expect(resolved.reconciles).toBe(true);
  });

  it('rejects lines that do not sum to the row charge', () => {
    const preview = previewWith([
      '"2/01/2026","Released","Order Payment","112-A","QIQI Bundle,...","88","0","-20","0","68"',
    ]);
    const { preview: resolved, errors } = applyResolutions(preview, [
      { attentionIndex: 0, lines: [{ nsItemId: '101', nsItemName: 'Blowout', quantity: 1, unitPrice: 48 }] },
    ]);
    expect(errors[0]).toContain('$48.00');
    expect(resolved.reconciles).toBe(false);
    expect(resolved.needsAttention).toHaveLength(1);
  });

  it('lets unknown-type rows be acknowledged but never sale rows', () => {
    const preview = previewWith([
      '"4/01/2026","Released","Mystery Adjustment","---","Weird thing","0","0","0","-12","-12"',
      '"4/02/2026","Released","Order Payment","114-A","QIQI Unmapped Product","30","0","-8","0","22"',
    ]);
    const { preview: afterIgnoreUnknown } = applyResolutions(preview, [
      { attentionIndex: preview.needsAttention.findIndex((a) => a.reason === 'unknown-type'), ignored: true },
    ]);
    expect(afterIgnoreUnknown.needsAttention).toHaveLength(1); // the sale row remains
    // The ignored row's -12 stays in the math
    expect(afterIgnoreUnknown.computedNet).toBe(afterIgnoreUnknown.reportNet);

    const saleIdx = preview.needsAttention.findIndex((a) => a.reason === 'unmapped-product');
    const { errors } = applyResolutions(preview, [{ attentionIndex: saleIdx, ignored: true }]);
    expect(errors[0]).toContain('cannot be ignored');
  });
});
