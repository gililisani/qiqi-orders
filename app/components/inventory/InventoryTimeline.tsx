'use client';

import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import type { Ledger, NegativeSummary, AnnotatedTxn } from '@/lib/inventory/balanceEngine';
import { TYPE_META, TRANSFER_COLOR, fmtQty } from './inventoryView';

interface Props {
  ledger: Ledger;
  negatives: NegativeSummary;
  selectedTxnId: string | null;
  onSelectTxn: (nsTransactionId: string) => void;
  plannedTxnIds?: Set<string>;
}

const LANE_H = 58;
const AXIS_H = 26;
const GUTTER = 188; // left label column
const PAD_R = 28;
const MARKER = 7;

const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);


interface Hover {
  left: number;
  top: number;
  lines: string[];
  suspect: boolean;
}

export function InventoryTimeline({ ledger, negatives, selectedTxnId, onSelectTxn, plannedTxnIds }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<Hover | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.max(640, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const lanes = useMemo(
    () => Object.values(ledger.byLocation).sort((a, b) => a.locationName.localeCompare(b.locationName)),
    [ledger],
  );

  // Full date domain.
  const { fullMin, fullMax, years } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const lane of lanes)
      for (const r of lane.rows) {
        const t = dayMs(r.tranDate);
        if (t < lo) lo = t;
        if (t > hi) hi = t;
      }
    if (!Number.isFinite(lo)) {
      lo = Date.parse('2024-01-01T00:00:00Z');
      hi = lo;
    }
    const y0 = new Date(lo).getUTCFullYear();
    const y1 = new Date(hi).getUTCFullYear();
    const ys: number[] = [];
    for (let y = y0; y <= y1; y++) ys.push(y);
    return { fullMin: lo, fullMax: hi, years: ys };
  }, [lanes]);

  const [zoom, setZoom] = useState<'all' | number>('all');
  const [d0, d1] = useMemo(() => {
    if (zoom === 'all') return [fullMin, fullMax];
    return [Date.parse(`${zoom}-01-01T00:00:00Z`), Date.parse(`${zoom}-12-31T00:00:00Z`)];
  }, [zoom, fullMin, fullMax]);

  const plotW = width - GUTTER - PAD_R;
  const span = Math.max(1, d1 - d0);
  const xOf = (d: string) => {
    const x = GUTTER + ((dayMs(d) - d0) / span) * plotW;
    return Math.max(GUTTER, Math.min(GUTTER + plotW, x));
  };
  const inRange = (d: string) => dayMs(d) >= d0 - 86400000 && dayMs(d) <= d1 + 86400000;
  const laneTop = (i: number) => AXIS_H + i * LANE_H;
  const laneCy = (i: number) => laneTop(i) + LANE_H / 2;
  const height = AXIS_H + lanes.length * LANE_H + 12;

  const laneIndex = new Map<string, number>();
  lanes.forEach((l, i) => laneIndex.set(l.locationNsId, i));

  const showHover = (e: MouseEvent, r: AnnotatedTxn, extra?: string[]) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    const lines = [
      `${r.tranDate}  ·  ${TYPE_META[r.tranType].label}`,
      `Doc ${r.docNumber || '—'}`,
      `Qty ${fmtQty(r.signedQty)}   ·   Balance ${fmtQty(r.runningBalance)}`,
      ...(extra ?? []),
      ...(r.memo ? [`“${r.memo.slice(0, 80)}”`] : []),
    ];
    setHover({
      left: e.clientX - (rect?.left ?? 0) + 12,
      top: e.clientY - (rect?.top ?? 0) + 12,
      lines,
      suspect: r.suspect,
    });
  };

  // Transfer pairs (grouped by ns transaction id, both legs present).
  const transfers = useMemo(() => {
    const byTx = new Map<string, AnnotatedTxn[]>();
    for (const lane of lanes)
      for (const r of lane.rows)
        if (r.tranType === 'IT') {
          const a = byTx.get(r.nsTransactionId);
          if (a) a.push(r);
          else byTx.set(r.nsTransactionId, [r]);
        }
    const out: { id: string; src: AnnotatedTxn; dst: AnnotatedTxn }[] = [];
    for (const [id, legs] of byTx) {
      const src = legs.find((l) => l.signedQty < 0);
      const dst = legs.find((l) => l.signedQty > 0);
      if (src && dst) out.push({ id, src, dst });
    }
    return out;
  }, [lanes]);

  function marker(r: AnnotatedTxn, cx: number, cy: number) {
    const meta = TYPE_META[r.tranType];
    const selected = selectedTxnId === r.nsTransactionId;
    const planned = plannedTxnIds?.has(r.nsTransactionId);
    const s = MARKER;
    const common = {
      onMouseEnter: (e: MouseEvent) => showHover(e, r),
      onMouseLeave: () => setHover(null),
      onClick: () => onSelectTxn(r.nsTransactionId),
      style: { cursor: 'pointer' as const },
    };
    let shape: JSX.Element;
    switch (meta.shape) {
      case 'up':
        shape = <polygon points={`${cx},${cy - s} ${cx - s},${cy + s} ${cx + s},${cy + s}`} fill={meta.color} {...common} />;
        break;
      case 'down':
        shape = <polygon points={`${cx},${cy + s} ${cx - s},${cy - s} ${cx + s},${cy - s}`} fill={meta.color} {...common} />;
        break;
      case 'diamond':
        shape = <polygon points={`${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`} fill={meta.color} {...common} />;
        break;
      case 'square':
        shape = <rect x={cx - s} y={cy - s} width={s * 2} height={s * 2} rx={1.5} fill={meta.color} {...common} />;
        break;
      default:
        shape = <circle cx={cx} cy={cy} r={s} fill={meta.color} {...common} />;
    }
    return (
      <g key={r.id}>
        {(selected || r.suspect) && (
          <circle cx={cx} cy={cy} r={s + 4} fill="none" stroke={selected ? '#111827' : '#dc2626'} strokeWidth={selected ? 2 : 1.5} strokeDasharray={r.suspect && !selected ? '2 2' : undefined} />
        )}
        {shape}
        {planned && <text x={cx} y={cy - s - 6} textAnchor="middle" fontSize={11} fill="#b45309">★</text>}
      </g>
    );
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* Zoom control */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-muted-foreground">Zoom:</span>
        <div className="flex gap-1">
          <ZoomBtn active={zoom === 'all'} onClick={() => setZoom('all')}>All</ZoomBtn>
          {years.map((y) => (
            <ZoomBtn key={y} active={zoom === y} onClick={() => setZoom(y)}>
              {y}
            </ZoomBtn>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <svg width={width} height={height} className="block" role="img">
          {/* Year gridlines */}
          {years
            .filter((y) => inRange(`${y}-01-01`) || zoom === 'all')
            .map((y) => {
              const x = xOf(`${y}-01-01`);
              return (
                <g key={y}>
                  <line x1={x} y1={AXIS_H - 6} x2={x} y2={height - 8} stroke="#e5e7eb" strokeWidth={1} />
                  <text x={x + 3} y={14} fontSize={11} fill="#6b7280">
                    {y}
                  </text>
                </g>
              );
            })}

          {/* Lanes */}
          {lanes.map((lane, i) => {
            const top = laneTop(i);
            const cy = laneCy(i);
            const neg = negatives[lane.locationNsId];
            const finalNeg = lane.final < 0;
            return (
              <g key={lane.locationNsId}>
                {/* alternating lane bg */}
                {i % 2 === 1 && <rect x={GUTTER} y={top} width={plotW} height={LANE_H} fill="#fafafa" />}
                {/* negative end-of-day shading */}
                {neg?.spans.map((sp, k) => {
                  const x1 = xOf(sp.from);
                  const x2 = xOf(sp.to ?? new Date(d1).toISOString().slice(0, 10));
                  return <rect key={k} x={x1} y={top + 3} width={Math.max(2, x2 - x1)} height={LANE_H - 6} fill="#dc2626" opacity={0.12} />;
                })}
                {/* baseline */}
                <line x1={GUTTER} y1={cy} x2={GUTTER + plotW} y2={cy} stroke="#e5e7eb" strokeWidth={1} />
                {/* left label */}
                <text x={10} y={cy - 4} fontSize={12} fontWeight={600} fill="#111827">
                  {lane.locationName.length > 24 ? lane.locationName.slice(0, 23) + '…' : lane.locationName}
                </text>
                <text x={10} y={cy + 12} fontSize={11} fill={finalNeg ? '#dc2626' : '#6b7280'}>
                  bal {fmtQty(lane.final)}
                  {neg ? `  ·  low ${fmtQty(neg.deepestBalance)}` : ''}
                </text>
                {/* non-transfer markers */}
                {lane.rows
                  .filter((r) => r.tranType !== 'IT' && inRange(r.tranDate))
                  .map((r) => marker(r, xOf(r.tranDate), cy))}
              </g>
            );
          })}

          {/* Transfer arrows (drawn above lanes) */}
          <defs>
            <marker id="invArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={TRANSFER_COLOR} />
            </marker>
          </defs>
          {transfers.map(({ id, src, dst }) => {
            if (!inRange(src.tranDate)) return null;
            const si = laneIndex.get(src.locationNsId);
            const di = laneIndex.get(dst.locationNsId);
            if (si == null || di == null) return null;
            const x = xOf(src.tranDate);
            const y1 = laneCy(si);
            const y2 = laneCy(di);
            const bulge = 26 + Math.min(40, Math.abs(di - si) * 6);
            const midY = (y1 + y2) / 2;
            const path = `M ${x} ${y1} Q ${x + bulge} ${midY} ${x} ${y2}`;
            const selected = selectedTxnId === id;
            const planned = plannedTxnIds?.has(id);
            return (
              <g key={id}>
                <path
                  d={path}
                  fill="none"
                  stroke={TRANSFER_COLOR}
                  strokeWidth={selected ? 2.5 : 1.5}
                  markerEnd="url(#invArrow)"
                  opacity={0.9}
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={(e) =>
                    showHover(e, src, [
                      `Transfer ${fmtQty(Math.abs(src.signedQty))}`,
                      `${src.locationName} → ${dst.locationName}`,
                      `From bal ${fmtQty(src.runningBalance)} · To bal ${fmtQty(dst.runningBalance)}`,
                    ])
                  }
                  onMouseLeave={() => setHover(null)}
                  onClick={() => onSelectTxn(id)}
                />
                <circle cx={x} cy={y1} r={3} fill={TRANSFER_COLOR} />
                {planned && <text x={x + bulge} y={midY} fontSize={11} fill="#b45309">★</text>}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend color={TYPE_META.IR.color} shape="up">Receipt</Legend>
        <Legend color={TYPE_META.IF.color} shape="down">Fulfillment</Legend>
        <Legend color={TYPE_META.BUILD.color} shape="diamond">Build</Legend>
        <Legend color={TYPE_META.ADJ.color} shape="dot">Adjustment</Legend>
        <Legend color={TYPE_META.BILL.color} shape="square">Bill</Legend>
        <Legend color={TRANSFER_COLOR} shape="arrow">Transfer</Legend>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: '#dc2626', opacity: 0.2 }} />negative period</span>
      </div>

      {hover && (
        <div
          className="pointer-events-none absolute z-50 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md max-w-xs"
          style={{ left: hover.left, top: hover.top }}
        >
          {hover.suspect && <div className="mb-1 font-semibold text-destructive">⚠ Suspect</div>}
          {hover.lines.map((l, i) => (
            <div key={i} className={i === 0 ? 'font-medium text-foreground' : 'text-muted-foreground'}>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ZoomBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-xs border ${active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-foreground hover:bg-secondary'}`}
    >
      {children}
    </button>
  );
}

function Legend({ color, shape, children }: { color: string; shape: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <svg width="14" height="14" viewBox="0 0 14 14">
        {shape === 'up' && <polygon points="7,2 2,12 12,12" fill={color} />}
        {shape === 'down' && <polygon points="7,12 2,2 12,2" fill={color} />}
        {shape === 'diamond' && <polygon points="7,1 13,7 7,13 1,7" fill={color} />}
        {shape === 'dot' && <circle cx="7" cy="7" r="5" fill={color} />}
        {shape === 'square' && <rect x="2" y="2" width="10" height="10" rx="1.5" fill={color} />}
        {shape === 'arrow' && <line x1="2" y1="7" x2="12" y2="7" stroke={color} strokeWidth="2" markerEnd="" />}
      </svg>
      {children}
    </span>
  );
}
