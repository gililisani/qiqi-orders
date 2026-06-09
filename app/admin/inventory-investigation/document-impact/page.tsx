'use client';

import { useState, type FormEvent } from 'react';
import { Search, Trash2, CalendarClock, Scissors, Play } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/qq/card';
import { Input } from '../../../components/qq/input';
import { Button } from '../../../components/qq/button';
import { EmptyState } from '../../../components/qq/empty-state';
import { InvTabs } from '../../../components/inventory/InvTabs';

interface NegRef { itemCode: string; locationName: string; depth: number; since: string }
interface Adjustment { itemCode: string; locationName: string; date: string; addQty: number }
interface Reduction { itemCode: string; sourceLocation: string; destLocation: string; originalQty: number; newQty: number; reducedBy: number }
interface Comp { itemCode: string; destLocation: string; needQty: number; byDate: string }
interface Impact {
  change: { kind: string; newDate?: string };
  fixed: NegRef[]; created: NegRef[]; remaining: NegRef[];
  clean: boolean; adjustments: Adjustment[];
}
interface Rec {
  strategy: 'changeDate' | 'delete' | 'reduceQty';
  headline: string;
  impact: Impact;
  newDate?: string;
  reductions?: Reduction[];
  compensatingTransfers?: Comp[];
  rationale: string;
  score: number;
  sourceCleared?: boolean;
}
interface Leg { itemCode: string; locationName: string; signedQty: number }
interface DocInfo { docNumber: string; nsType: string | null; tranDate: string; itemCount: number; locationNames: string[]; legs: Leg[] }

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
const initialDoc = () => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('doc') ?? '');

export default function DocumentImpactPage() {
  const [docInput, setDocInput] = useState(initialDoc);
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [rec, setRec] = useState<Rec | null>(null);
  const [alts, setAlts] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tryDate, setTryDate] = useState('');
  const [tryImpact, setTryImpact] = useState<Impact | null>(null);
  const [trying, setTrying] = useState(false);

  const analyze = async (docNumber: string) => {
    if (!docNumber.trim()) return;
    setLoading(true); setError(null); setDoc(null); setTryImpact(null);
    try {
      const res = await fetchWithAuth(`/api/inventory-investigation/document-impact?doc=${encodeURIComponent(docNumber.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setDoc(json.document); setRec(json.recommendation); setAlts(json.alternatives ?? []);
    } catch (e: any) {
      setError(e?.message || 'Analysis failed');
    } finally { setLoading(false); }
  };

  const onSubmit = (e: FormEvent) => { e.preventDefault(); analyze(docInput); };

  const evaluate = async (change: { kind: 'delete' } | { kind: 'changeDate'; newDate: string }) => {
    if (!doc) return;
    setTrying(true);
    try {
      const res = await fetchWithAuth('/api/inventory-investigation/document-impact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: doc.docNumber, change }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setTryImpact(json.impact);
    } finally { setTrying(false); }
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Document Impact Analyzer"
        description="A multi-item document (e.g. a transfer of 13 items across 2 locations) can only be edited as a whole. Enter a document number for a ranked recommendation — change date, reduce quantities, or delete — with the full consequence across every item and location."
      />
      <InvTabs />

      <Card className="mb-4">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="flex items-end gap-2 max-w-md">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Document number</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={docInput} onChange={(e) => setDocInput(e.target.value)} placeholder="e.g. IT10186" className="pl-8" autoFocus />
              </div>
            </div>
            <Button type="submit" loading={loading} disabled={!docInput.trim()}>Analyze</Button>
          </form>
        </CardContent>
      </Card>

      {error && <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}
      {!doc && !loading && !error && (
        <EmptyState icon={<Search />} title="Enter a document number" description="Paste a transfer / receipt / build number to get a ranked fix recommendation." />
      )}

      {doc && rec && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{doc.docNumber} <span className="text-sm font-normal text-muted-foreground">· {doc.nsType} · {doc.tranDate}</span></span>
                <span className="text-xs font-normal text-muted-foreground">{doc.itemCount} items · {doc.locationNames.join(' → ')}</span>
              </CardTitle>
            </CardHeader>
          </Card>

          {/* RECOMMENDED */}
          <Card className="border-accent/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">RECOMMENDED</span>
                <StrategyIcon s={rec.strategy} /> {rec.headline}
              </CardTitle>
            </CardHeader>
            <CardContent><RecBody rec={rec} /></CardContent>
          </Card>

          {/* ALTERNATIVES */}
          {alts.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {alts.map((a, i) => (
                <Card key={i}>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><StrategyIcon s={a.strategy} /> Alternative · {a.headline}</CardTitle></CardHeader>
                  <CardContent><RecBody rec={a} compact /></CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Try a specific date */}
          <Card>
            <CardHeader><CardTitle>Try a specific date</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">New date</label>
                  <input type="date" value={tryDate} onChange={(e) => setTryDate(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
                </div>
                <Button size="sm" onClick={() => tryDate && evaluate({ kind: 'changeDate', newDate: tryDate })} loading={trying} disabled={!tryDate}>
                  <Play className="h-3.5 w-3.5" /> Simulate date
                </Button>
                <Button size="sm" variant="outline" onClick={() => evaluate({ kind: 'delete' })} loading={trying}>
                  <Trash2 className="h-3.5 w-3.5" /> Simulate delete
                </Button>
              </div>
              {tryImpact && <div className="mt-3"><ImpactBody impact={tryImpact} /></div>}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function StrategyIcon({ s }: { s: string }) {
  if (s === 'reduceQty') return <Scissors className="h-4 w-4" />;
  if (s === 'delete') return <Trash2 className="h-4 w-4" />;
  return <CalendarClock className="h-4 w-4" />;
}

function RecBody({ rec, compact }: { rec: Rec; compact?: boolean }) {
  const ok = rec.impact.clean || (rec.strategy === 'reduceQty' && rec.sourceCleared);
  return (
    <div className="space-y-2 text-sm">
      <div className={`rounded-md border px-3 py-1.5 ${ok ? 'bg-green-50 text-green-800 border-green-300' : 'bg-amber-50 text-amber-900 border-amber-300'}`}>
        {rec.strategy === 'reduceQty' && rec.sourceCleared
          ? '✓ Source never goes negative. Destination top-ups listed below.'
          : rec.impact.clean
          ? '✓ Clean — no new negatives anywhere.'
          : `Reduces the problem but isn't fully clean (see below).`}
      </div>
      <p className="text-[11px] text-muted-foreground">{rec.rationale}</p>

      {/* Reduce: per-item new quantities */}
      {rec.reductions && rec.reductions.filter((r) => r.reducedBy > 0).length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-foreground mb-0.5">1. Edit {rec.reductions[0].sourceLocation} → {rec.reductions[0].destLocation} line quantities:</div>
          <ul className="space-y-0.5">
            {rec.reductions.filter((r) => r.reducedBy > 0).map((r) => (
              <li key={r.itemCode} className="text-[11px] font-mono flex justify-between gap-2">
                <span>{r.itemCode}</span>
                <span>{fmt(r.originalQty)} → <span className="font-semibold">{fmt(r.newQty)}</span> <span className="text-muted-foreground">(−{fmt(r.reducedBy)})</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Reduce: compensating transfers */}
      {rec.compensatingTransfers && rec.compensatingTransfers.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-foreground mb-0.5">2. Then bring into {rec.compensatingTransfers[0].destLocation} (from other locations):</div>
          <ul className="space-y-0.5">
            {rec.compensatingTransfers.map((c, i) => (
              <li key={i} className="text-[11px] font-mono flex justify-between gap-2">
                <span>{c.itemCode}</span>
                <span className="text-amber-700">+{fmt(c.needQty)} by {c.byDate}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rec.newDate && <div className="text-[11px]">Move document date to <span className="font-mono font-semibold">{rec.newDate}</span></div>}

      {!compact && <ImpactBody impact={rec.impact} hideAdjustments={rec.strategy === 'reduceQty'} />}
      {compact && (
        <div className="text-[11px] text-muted-foreground">
          fixes {rec.impact.fixed.length} · {rec.strategy === 'reduceQty' ? `source damage ${fmt(rec.score)}` : `new negatives ${rec.impact.created.length}`}
        </div>
      )}
    </div>
  );
}

function ImpactBody({ impact, hideAdjustments }: { impact: Impact; hideAdjustments?: boolean }) {
  return (
    <div className="space-y-2 text-sm">
      {impact.created.length > 0 && <Section label="NEW / DEEPENED NEGATIVES" tone="bad" rows={impact.created} />}
      {impact.fixed.length > 0 && <Section label="FIXED" tone="good" rows={impact.fixed} />}
      {impact.remaining.length > 0 && <Section label="STILL NEGATIVE (unchanged)" tone="warn" rows={impact.remaining} />}
      {!hideAdjustments && impact.adjustments.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] font-semibold text-muted-foreground mb-1">To make fully clean, these adjustments would be needed (last resort):</div>
          <ul className="space-y-0.5">
            {impact.adjustments.slice(0, 30).map((a, i) => (
              <li key={i} className="text-[11px] font-mono flex justify-between gap-2"><span>{a.itemCode} @ {a.locationName}</span><span className="text-amber-700">+{fmt(a.addQty)} on {a.date}</span></li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({ label, tone, rows }: { label: string; tone: 'good' | 'bad' | 'warn'; rows: NegRef[] }) {
  const cls = tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-destructive' : 'text-amber-700';
  return (
    <div>
      <div className={`text-[11px] font-semibold ${cls}`}>{label} ({rows.length})</div>
      <ul className="mt-0.5 space-y-0.5">
        {rows.slice(0, 30).map((r, i) => (
          <li key={i} className="text-[11px] font-mono flex justify-between gap-2"><span>{r.itemCode} @ {r.locationName}</span><span className={cls}>{fmt(r.depth)} · since {r.since}</span></li>
        ))}
        {rows.length > 30 && <li className="text-[11px] text-muted-foreground">…and {rows.length - 30} more</li>}
      </ul>
    </div>
  );
}
