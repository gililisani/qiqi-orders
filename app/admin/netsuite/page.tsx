'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { RefreshCw, ArrowRight } from 'lucide-react';

import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';

type ConnectionStatus = 'checking' | 'connected' | 'disconnected';

const STATUS_COPY: Record<ConnectionStatus, string> = {
  checking: 'Checking connection…',
  connected: 'Connected to NetSuite',
  disconnected: 'Disconnected from NetSuite',
};

const STATUS_DOT: Record<ConnectionStatus, string> = {
  checking: 'bg-amber-500',
  connected: 'bg-green-500',
  disconnected: 'bg-destructive',
};

const ENV_VARS = [
  'NETSUITE_ACCOUNT_ID',
  'NETSUITE_CONSUMER_KEY',
  'NETSUITE_CONSUMER_SECRET',
  'NETSUITE_TOKEN_ID',
  'NETSUITE_TOKEN_SECRET',
  'NETSUITE_REALM',
];

export default function NetSuitePage() {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const checkConnection = async () => {
    setStatus('checking');
    setConnectionError(null);
    try {
      const { fetchWithAuth } = await import('../../../lib/fetchWithAuth');
      const response = await fetchWithAuth('/api/netsuite/test-connection');
      const data = await response.json();
      setStatus(data.connected ? 'connected' : 'disconnected');
      if (!data.connected && data.error) setConnectionError(data.error);
    } catch (err: any) {
      setStatus('disconnected');
      setConnectionError(err?.message || 'Network error');
    }
  };

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="NetSuite integration"
        description="Manage the connection to NetSuite and run data sync jobs."
      />

      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Connection status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS_DOT[status]}`} />
            <span className="text-sm font-medium">{STATUS_COPY[status]}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={checkConnection}
              disabled={status === 'checking'}
              className="ml-auto"
            >
              <RefreshCw className={`h-4 w-4 ${status === 'checking' ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          {connectionError && (
            <Alert variant="destructive">
              <AlertDescription>
                <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                  {connectionError}
                </pre>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Inventory Sync */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Inventory sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pull current inventory levels from NetSuite by location and view them in the Hub.
          </p>
          <Link href="/admin/inventory">
            <Button size="sm" variant="outline">
              Go to inventory sync <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Invoice refresh */}
      <RefreshInvoicesCard />


      {/* Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            To use NetSuite integration, the following environment variables must be set on the
            server:
          </p>

          <div className="bg-muted/50 border border-border rounded-md p-3 text-xs font-mono space-y-1">
            {ENV_VARS.map((v) => (
              <div key={v}>
                {v}=<span className="text-muted-foreground">your_value</span>
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Setup steps</p>
            <ol className="list-decimal pl-5 space-y-1 text-sm text-muted-foreground">
              <li>Create an Integration in NetSuite (Setup → Integrations → New Integration).</li>
              <li>Generate OAuth 1.0 (Token-Based Auth) credentials.</li>
              <li>Add the credentials to the environment variables in Vercel.</li>
              <li>Test the connection using the Refresh button above.</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk refresh of cached invoice amounts.
//
// Hits /api/netsuite/refresh-all-invoices which loops through every order
// with a netsuite_invoice_id and pulls amountRemaining + dueDate from NS.
// Designed for one-off use (after the migration that added the new
// columns), but safe to re-run any time you want fresh AR data without
// waiting on per-order Sync Invoice clicks.
// ---------------------------------------------------------------------------
interface RefreshResult {
  total: number;
  refreshed: number;
  failed: number;
  durationMs: number;
  failures: Array<{ orderId: string; poNumber: string | null; error: string }>;
  truncated?: boolean;
  message?: string;
}

function RefreshInvoicesCard() {
  const [running, setRunning] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const { fetchWithAuth } = await import('../../../lib/fetchWithAuth');
      const res = await fetchWithAuth('/api/netsuite/refresh-all-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlyMissing }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setResult(data);
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Refresh invoice balances</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Pulls amount remaining + due date from NetSuite for every order that
          has an invoice. Use this once after the invoice-amounts migration to
          backfill historical orders, or anytime you want fresh AR data without
          clicking Sync Invoice per order. Safe to re-run; takes ~30s per ~100
          invoices.
        </p>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="h-4 w-4 accent-foreground"
          />
          <span>
            Only refresh orders that are missing the cached fields (faster).
          </span>
        </label>
        <Button onClick={run} loading={running} size="sm">
          <RefreshCw className={`h-4 w-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Refreshing…' : 'Refresh now'}
        </Button>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result && (
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm space-y-1">
            <p className="font-medium">{result.message}</p>
            <p className="text-xs text-muted-foreground">
              {result.refreshed} succeeded · {result.failed} failed · ran in{' '}
              {(result.durationMs / 1000).toFixed(1)}s
            </p>
            {result.failures.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium">
                  {result.failures.length} failure
                  {result.failures.length === 1 ? '' : 's'} (
                  {result.truncated ? 'first 10 shown' : 'all'})
                </summary>
                <ul className="mt-2 space-y-1 text-xs font-mono">
                  {result.failures.map((f) => (
                    <li key={f.orderId} className="text-rose-700">
                      <span className="text-muted-foreground">
                        {f.poNumber ?? f.orderId.slice(0, 8)}
                      </span>
                      : {f.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
