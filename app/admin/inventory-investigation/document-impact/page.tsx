'use client';

import { useState, type FormEvent } from 'react';
import { Search, Trash2, CalendarClock, Play } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/qq/card';
import { Input } from '../../../components/qq/input';
import { Button } from '../../../components/qq/button';
import { EmptyState } from '../../../components/qq/empty-state';
import { InvTabs } from '../../../components/inventory/InvTabs';

interface NegRef { itemCode: string; locationName: string; depth: number; since: string }
interface Adjustment { itemCode: string; locationName: string; date: string; addQty: number }
interface Impact {
  change: { kind: string; newDate?: string };
  fixed: NegRef[];
  created: NegRef[];
  remaining: NegRef[];
  netResolved: number;
  clean: boolean;
  adjustments: Adjustment[];
}
interface Leg { itemCode: string; locationName: string; signedQty: number }
interface DocInfo {
  docNumber: string;
  nsType: string | null;
  tranDate: string;
  itemCount: number;
  locationNames: string[];
  legs: Leg[];
}

const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });

function initialDoc(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('doc') ?? '';
}

export default function DocumentImpactPage() {
  const [docInput, setDocInput] = useState(initialDoc);
  const [doc, setDoc] = useState<DocInfo | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<Impact | null>(null);
  const [bestDate, setBestDate] = useState<Impact | null>(null);
  const [cleanDate, setCleanDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [tryDate, setTryDate] = useState('');
  const [tryImpact, setTryImpact] = useState<Impact | null>(null);
  const [trying, setTrying] = useState(false);

  const analyze = async (docNumber: string) => {
    if (!docNumber.trim()) return;
    setLoading(true);
    setError(null);
    setDoc(null);
    setTryImpact(null);
    try {
      const res = await fetchWithAuth(`/api/inventory-investigation/document-impact?doc=${encodeURIComponent(docNumber.trim())}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Analysis failed');
      setDoc(json.document);
      setDeleteImpact(json.deleteImpact);
      setBestDate(json.bestDate);
      setCleanDate(json.cleanDate);
      if (json.cleanDate) setTryDate(json.cleanDate);
    } catch (e: any) {
      setError(e?.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    analyze(docInput);
  };

  const evaluate = async (change: { kind: 'delete' } | { kind: 'changeDate'; newDate: string }) => {
    if (!doc) return;
    setTrying(true);
    try {
      const res = await fetchWithAuth('/api/inventory-investigation/document-impact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: doc.docNumber, change }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setTryImpact(json.impact);
    } finally {
      setTrying(false);
    }
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Document Impact Analyzer"
        description="A multi-item document (e.g. a transfer carrying 13 items across 2 locations) can only be edited as a whole. Enter a document number to see the full consequence of deleting it or moving its date — across every item and location it touches — before you touch NetSuite."
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

      {error && (
        <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {!doc && !loading && !error && (
        <EmptyState icon={<Search />} title="Enter a document number" description="Paste a transfer / receipt / build document number to analyze its full multi-item impact." />
      )}

      {doc && (
        <div className="space-y-4">
          {/* Document summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{doc.docNumber} <span className="text-sm font-normal text-muted-foreground">· {doc.nsType} · {doc.tranDate}</span></span>
                <span className="text-xs font-normal text-muted-foreground">{doc.itemCount} items · {doc.locationNames.join(' ↔ ')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                {doc.legs.filter((l) => l.signedQty < 0).map((l, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-border/50 py-0.5">
                    <span className="font-mono">{l.itemCode}</span>
                    <span className="text-muted-foreground">{fmt(Math.abs(l.signedQty))}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* The two pre-computed options, side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ImpactCard
              title="If you DELETE this document"
              icon={<Trash2 className="h-4 w-4" />}
              impact={deleteImpact}
            />
            <ImpactCard
              title={cleanDate ? `Best fix — move to ${cleanDate}` : 'Best date found (not fully clean)'}
              icon={<CalendarClock className="h-4 w-4" />}
              impact={bestDate}
              highlight={!!cleanDate}
            />
          </div>

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

function ImpactCard({ title, icon, impact, highlight }: { title: string; icon: React.ReactNode; impact: Impact | null; highlight?: boolean }) {
  return (
    <Card className={highlight ? 'border-green-300' : ''}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">{icon}{title}</CardTitle>
      </CardHeader>
      <CardContent>{impact ? <ImpactBody impact={impact} /> : <p className="text-sm text-muted-foreground">No result.</p>}</CardContent>
    </Card>
  );
}

function ImpactBody({ impact }: { impact: Impact }) {
  const verdict = impact.clean
    ? { cls: 'bg-green-50 text-green-800 border-green-300', text: `✓ Clean — fixes ${impact.fixed.length}, creates 0` }
    : impact.created.length > 0
    ? { cls: 'bg-destructive/10 text-destructive border-destructive/40', text: `⚠ Creates ${impact.created.length} new negative${impact.created.length > 1 ? 's' : ''} (fixes ${impact.fixed.length})` }
    : { cls: 'bg-secondary text-foreground', text: `Fixes ${impact.fixed.length}, no new problems` };

  return (
    <div className="space-y-2 text-sm">
      <div className={`rounded-md border px-3 py-1.5 font-medium ${verdict.cls}`}>{verdict.text}</div>

      {impact.created.length > 0 && (
        <Section label="NEW PROBLEMS" tone="bad" rows={impact.created} />
      )}
      {impact.fixed.length > 0 && <Section label="FIXED" tone="good" rows={impact.fixed} />}
      {impact.remaining.length > 0 && <Section label="STILL NEGATIVE" tone="warn" rows={impact.remaining} />}

      {impact.adjustments.length > 0 && (
        <div className="pt-1">
          <div className="text-[11px] font-semibold text-muted-foreground mb-1">
            To make fully clean, these adjustments would be needed (last resort):
          </div>
          <ul className="space-y-0.5">
            {impact.adjustments.map((a, i) => (
              <li key={i} className="text-[11px] font-mono flex justify-between gap-2">
                <span>{a.itemCode} @ {a.locationName}</span>
                <span className="text-amber-700">+{fmt(a.addQty)} on {a.date}</span>
              </li>
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
          <li key={i} className="text-[11px] font-mono flex justify-between gap-2">
            <span>{r.itemCode} @ {r.locationName}</span>
            <span className={cls}>{fmt(r.depth)} · since {r.since}</span>
          </li>
        ))}
        {rows.length > 30 && <li className="text-[11px] text-muted-foreground">…and {rows.length - 30} more</li>}
      </ul>
    </div>
  );
}
