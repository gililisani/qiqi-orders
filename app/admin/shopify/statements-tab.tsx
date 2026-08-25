'use client';

/**
 * Statements (OFX) tab — generate the NetSuite Banking Import statement
 * for any of the three clearing accounts and date range. The nightly
 * feed pulls these automatically; this is the manual/backfill path.
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

const ACCOUNTS = [
  { key: 'shopify-payments', label: 'Shopify Payments → 100501' },
  { key: 'paypal', label: 'PayPal → 100504' },
  { key: 'affirm', label: 'Affirm → 100503' },
];

export function StatementsTab() {
  const today = new Date().toISOString().slice(0, 10);
  const [account, setAccount] = useState('shopify-payments');
  const [from, setFrom] = useState(today.slice(0, 8) + '01');
  const [to, setTo] = useState(today);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetchWithAuth(`/api/shopify/statement?account=${account}&from=${from}&to=${to}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shopify-${account}-${from}_${to}.ofx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMsg(`${res.headers.get('X-Statement-Lines') ?? '?'} statement lines — import via NetSuite → Transactions → Bank → Banking Import, then Match Bank Data.`);
    } catch (e: any) {
      setMsg(`Failed: ${String(e?.message ?? e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate OFX statement</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          The &quot;bank statement&quot; for a clearing account, built from the provider&apos;s transactions — what NetSuite&apos;s
          Match Bank Data pairs against. The nightly feed imports these automatically; use this only for a manual backfill
          or a custom range.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Account" className="h-9 rounded-md border border-border bg-background px-2 text-sm">
            {ACCOUNTS.map((a) => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} aria-label="From" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} aria-label="To" className="h-9 rounded-md border border-border bg-background px-2 text-sm" />
          <Button size="sm" variant="outline" disabled={busy} onClick={download}>
            {busy ? 'Building…' : 'Download OFX'}
          </Button>
        </div>
        {msg && <div className="mt-3 rounded-md border border-border bg-secondary px-3 py-2 text-sm">{msg}</div>}
      </CardContent>
    </Card>
  );
}
