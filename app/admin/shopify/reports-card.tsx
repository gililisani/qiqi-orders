'use client';

/**
 * Finance reports card (CPA verification layer): the raw Shopify / PayPal /
 * Affirm reports, monthly-archived (immutable, auto via the 1st-of-month
 * cron) + any custom range on demand. Data comes from each provider's
 * official API; the bookkeeper uses these for Reconcile Account Statement
 * and as audit evidence.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

const PROVIDERS = ['shopify', 'paypal', 'affirm'] as const;
const LABEL: Record<string, string> = { shopify: 'Shopify', paypal: 'PayPal', affirm: 'Affirm' };

interface ArchiveFile { path: string; month: string; name: string; bytes: number; provider: string }

function closedMonths(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let d = new Date(Date.UTC(2026, 0, 1)); ; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const m = d.toISOString().slice(0, 7);
    if (m >= now.toISOString().slice(0, 7)) break;
    out.push(m);
  }
  return out.reverse();
}

async function saveBlob(res: Response, fallbackName: string) {
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function ReportsCard() {
  const [files, setFiles] = useState<ArchiveFile[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
  const [provider, setProvider] = useState<string>('shopify');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/shopify/reports/archive');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setFiles(j.files);
    } catch (e: any) {
      setMsg(`Archive list failed: ${String(e?.message ?? e)}`);
      setFiles([]);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const download = async (label: string, url: string, name: string) => {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetchWithAuth(url);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      await saveBlob(res, name);
    } catch (e: any) {
      setMsg(`Download failed: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(null);
    }
  };

  const backfill = async () => {
    setBusy('backfill');
    setMsg(null);
    try {
      const have = new Set((files ?? []).map((f) => `${f.month}:${f.provider}`));
      const missing = closedMonths().filter((m) => PROVIDERS.some((p) => !have.has(`${m}:${p}`)));
      let done = 0;
      for (const month of missing.slice().reverse()) {
        setMsg(`Archiving ${month}… (${++done}/${missing.length})`);
        const res = await fetchWithAuth('/api/shopify/reports/archive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      }
      setMsg(missing.length ? `Archived ${missing.length} month(s).` : 'Archive already complete.');
      await load();
    } catch (e: any) {
      setMsg(`Backfill stopped: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(null);
    }
  };

  const byMonth = new Map<string, Map<string, ArchiveFile>>();
  for (const f of files ?? []) {
    (byMonth.get(f.month) ?? byMonth.set(f.month, new Map()).get(f.month)!).set(f.provider, f);
  }
  const months = closedMonths();
  const missingCount = months.reduce((n, m) => n + PROVIDERS.filter((p) => !byMonth.get(m)?.has(p)).length, 0);

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>Finance reports</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider" className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{LABEL[p]}</option>
            ))}
          </select>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => download('range', `/api/shopify/reports?provider=${provider}&from=${from}&to=${to}`, `${provider}-${from}_${to}.csv`)}>
            {busy === 'range' ? 'Building…' : 'Download range'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {msg && <div className="mb-3 rounded-md border border-border bg-secondary px-3 py-2 text-sm">{msg}</div>}
        {files === null ? (
          <div className="text-sm text-muted-foreground">Loading archive…</div>
        ) : (
          <>
            {missingCount > 0 && (
              <div className="mb-3 flex items-center gap-3 text-sm">
                <span>{missingCount} monthly file(s) not archived yet.</span>
                <Button size="sm" variant="outline" disabled={busy !== null} onClick={backfill}>
                  {busy === 'backfill' ? 'Archiving…' : 'Backfill archive'}
                </Button>
              </div>
            )}
            <div className="grid gap-1 text-sm">
              {months.map((m) => (
                <div key={m} className="flex items-center gap-3 border-b border-border py-1.5 last:border-0">
                  <span className="w-20 font-medium">{m}</span>
                  {PROVIDERS.map((p) => {
                    const f = byMonth.get(m)?.get(p);
                    return f ? (
                      <button
                        key={p}
                        className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
                        disabled={busy !== null}
                        onClick={() => download(f.path, `/api/shopify/reports/archive/download?path=${encodeURIComponent(f.path)}`, f.name)}
                      >
                        {LABEL[p]} ↓
                      </button>
                    ) : (
                      <span key={p} className="text-muted-foreground">{LABEL[p]} —</span>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Monthly files are generated from each provider&apos;s official API, archived immutably on the 1st (07:00 UTC), and never overwritten — the bookkeeper&apos;s evidence set for Reconcile Account Statement.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
