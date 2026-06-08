import { describe, expect, it } from 'vitest';
import {
  computeWorklistForItem,
  validateWorklist,
  type ItemMeta,
  type CatalogContext,
  type ItemContext,
} from '@/lib/inventory/worklist';
import { computeLedger, type LedgerTxn, type OpeningBalance } from '@/lib/inventory/balanceEngine';
import { computeItemWindows } from '@/lib/inventory/negativeWindows';
import { buildItemChains, linkChains, type TOrdCostPair } from '@/lib/inventory/chains';

const META: ItemMeta = { itemCode: 'TEST', nsItemId: '1', itemName: 'Test item' };
const open = (loc: string, qty: number): OpeningBalance => ({ locationNsId: loc, locationName: `Loc-${loc}`, openingQty: qty });

let seq = 0;
function tx(p: {
  tx?: string;
  loc: string;
  date: string;
  qty: number;
  code: string;
  sub?: string;
}): LedgerTxn {
  seq += 1;
  const enumByCode: Record<string, LedgerTxn['tranType']> = {
    InvTrnfr: 'IT', ItemRcpt: 'IR', InvAdjst: 'ADJ', VendBill: 'BILL', Build: 'BUILD', ItemShip: 'IF',
  };
  return {
    id: `r${seq}`,
    nsTransactionId: p.tx ?? `t${seq}`,
    lineId: String(seq),
    docNumber: p.tx ?? `DOC${seq}`,
    tranDate: p.date,
    tranType: enumByCode[p.code] ?? 'ADJ',
    nsType: p.code,
    nsTypeCode: p.code,
    locationNsId: p.loc,
    locationName: `Loc-${p.loc}`,
    signedQty: p.qty,
    subsidiaryName: p.sub ?? 'SubA',
    transferGroup: p.code === 'InvTrnfr' ? (p.tx ?? null) : null,
    transferLeg: p.code === 'InvTrnfr' ? (p.qty < 0 ? 'source' : 'dest') : null,
  };
}

// Build a single-item catalog context (no cross-item components needed).
function ctxFor(txns: LedgerTxn[], openings: OpeningBalance[], pairs: TOrdCostPair[] = []): {
  ctx: CatalogContext;
  txns: LedgerTxn[];
  ledger: ReturnType<typeof computeLedger>;
} {
  const linked = linkChains(txns, pairs);
  const ledger = computeLedger(linked, openings);
  const ic: ItemContext = { meta: META, txns: linked, openings, ledger, chains: buildItemChains(linked) };
  const ctx: CatalogContext = { byItemId: new Map([['1', ic]]), componentsByBuildTxId: new Map() };
  return { ctx, txns: linked, ledger };
}

function run(txns: LedgerTxn[], openings: OpeningBalance[], pairs: TOrdCostPair[] = []) {
  const { ctx, txns: linked, ledger } = ctxFor(txns, openings, pairs);
  const windows = computeItemWindows(META, ledger);
  return computeWorklistForItem(META, linked, openings, ledger, windows, ctx);
}

describe('chain-aware worklist', () => {
  it('BUG-1: an ongoing negative with no clean fix still produces a MANUAL row (never dropped)', () => {
    // Driven only by a non-editable Build; no surplus elsewhere to create a transfer.
    const txns = [
      tx({ loc: 'A', date: '2024-02-01', qty: 50, code: 'ItemRcpt' }),
      tx({ loc: 'A', date: '2024-03-01', qty: -120, code: 'Build', tx: 'ASBIL1' }),
    ];
    const rows = run(txns, [open('A', 0)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('MANUAL');
    expect(rows[0].recommendationType).toBe('Manual review');
  });

  it('BUG-2: pre-2024 originating negative is CLOSED, not dropped', () => {
    const txns = [
      tx({ loc: 'A', date: '2023-06-01', qty: 50, code: 'ItemRcpt' }),
      tx({ loc: 'A', date: '2023-09-01', qty: -120, code: 'InvTrnfr', tx: 'IT0' }),
    ];
    const rows = run(txns, [open('A', 0)]);
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe('CLOSED');
  });

  it('REDUCE_QTY clean: reduce an in-scope transfer to zero the suspect-day EOD', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-08-01', qty: 11925, code: 'ItemRcpt' }),
      tx({ tx: 'IT1', loc: 'A', date: '2024-08-06', qty: -25970, code: 'InvTrnfr' }),
      tx({ tx: 'IT1', loc: 'B', date: '2024-08-06', qty: 25970, code: 'InvTrnfr' }),
    ];
    const rows = run(txns, [open('A', 0), open('B', 0)]);
    const a = rows.find((r) => r.locationNsId === 'A')!;
    expect(a.category).toBe('CLEAN');
    expect(a.recommendationType).toBe('Reduce quantity');
    expect(a.editsRequired[0].action).toMatch(/reduce quantity/);
  });

  it('intercompany backdate lists IF + IR + the manual TO step', () => {
    // B (Square1) goes negative; an intercompany IF(DHL)→IR(B) later brings stock.
    // Backdate the chain earlier to cover the shortage. Source DHL has surplus.
    const txns = [
      tx({ loc: 'DHL', date: '2024-01-01', qty: 500, code: 'ItemRcpt', sub: 'SubA' }),
      tx({ loc: 'B', date: '2024-02-01', qty: -72, code: 'Build', tx: 'BUILD1' }), // drives B negative
      tx({ tx: 'IFX', loc: 'DHL', date: '2024-05-01', qty: -72, code: 'ItemShip', sub: 'SubA' }),
      tx({ tx: 'IRX', loc: 'B', date: '2024-05-10', qty: 72, code: 'ItemRcpt', sub: 'SubB' }),
    ];
    const pairs: TOrdCostPair[] = [{ ifTxId: 'IFX', irTxId: 'IRX' }];
    const rows = run(txns, [open('DHL', 0), open('B', 0)], pairs);
    const b = rows.find((r) => r.locationNsId === 'B' && r.recommendationType === 'Change date');
    expect(b).toBeTruthy();
    const docTypes = b!.editsRequired.map((e) => e.docType);
    expect(docTypes).toContain('TransferOrder'); // manual UI step
    expect(docTypes).toContain('ItemShip'); // IF
    expect(docTypes).toContain('ItemRcpt'); // IR
    expect(b!.editsRequired.find((e) => e.docType === 'TransferOrder')!.manual).toBe(true);
  });

  it('boundary warning: a CLEAN fix backdating >14d to the 2024-01-01 cutoff carries the amber caveat', () => {
    // B goes negative on 2024-01-01 driven by a NON-editable Build (so reduce/
    // delete aren't available); a later receipt (2024-02-23, 53 days on) backdated
    // to the cutoff resolves it cleanly — must carry the boundary warning.
    const txns = [
      tx({ loc: 'B', date: '2024-01-01', qty: 30, code: 'ItemRcpt' }),
      tx({ loc: 'B', date: '2024-01-01', qty: -40, code: 'Build', tx: 'ASBILx' }), // drives B to -10
      tx({ loc: 'B', date: '2024-02-23', qty: 40, code: 'ItemRcpt', tx: 'LATE' }), // recovers; backdate target
    ];
    const rows = run(txns, [open('B', 0)]);
    const b = rows.find((r) => r.locationNsId === 'B' && r.category === 'CLEAN' && r.notes.includes('CLOSED-PERIOD BOUNDARY'));
    expect(b).toBeTruthy();
    expect(b!.recommendationType).toBe('Change date');
  });

  it('broken chain (IF/IR >60d apart) is flagged and not auto-fixed', () => {
    const txns = [
      tx({ loc: 'DHL', date: '2024-01-01', qty: 500, code: 'ItemRcpt', sub: 'SubA' }),
      tx({ tx: 'IFB', loc: 'DHL', date: '2024-03-01', qty: -50, code: 'ItemShip', sub: 'SubA' }),
      tx({ tx: 'IRB', loc: 'B', date: '2024-06-15', qty: 50, code: 'ItemRcpt', sub: 'SubB' }), // 106 days later
    ];
    const pairs: TOrdCostPair[] = [{ ifTxId: 'IFB', irTxId: 'IRB' }];
    const rows = run(txns, [open('DHL', 0), open('B', 0)], pairs);
    const broken = rows.find((r) => r.isBrokenChain);
    expect(broken).toBeTruthy();
    expect(broken!.recommendationType).toBe('Broken chain');
    expect(broken!.notes).toMatch(/106 days apart|days apart/);
  });
});

describe('validateWorklist', () => {
  it('passes for rule-compliant rows', () => {
    const txns = [
      tx({ loc: 'A', date: '2024-08-01', qty: 100, code: 'ItemRcpt' }),
      tx({ tx: 'IT3', loc: 'A', date: '2024-08-06', qty: -130, code: 'InvTrnfr' }),
      tx({ tx: 'IT3', loc: 'B', date: '2024-08-06', qty: 130, code: 'InvTrnfr' }),
    ];
    const rows = run(txns, [open('A', 0), open('B', 0)]);
    const v = validateWorklist(rows);
    expect(v.nonEditable).toHaveLength(0);
    expect(v.closedPeriod).toHaveLength(0);
    expect(v.prereqPreCutoff).toHaveLength(0);
    expect(v.incompleteChain).toHaveLength(0);
  });

  it('flags an IF edit with no paired IR as an incomplete chain', () => {
    const bad = [
      {
        ...run([tx({ loc: 'A', date: '2024-02-01', qty: -5, code: 'InvTrnfr', tx: 'X' })], [open('A', 0)])[0],
        editsRequired: [{ order: 1, doc: 'IFZ', docType: 'ItemShip', action: 'change date to 2024-05-01' }],
      },
    ];
    const v = validateWorklist(bad as any);
    expect(v.incompleteChain.length).toBeGreaterThan(0);
  });
});
