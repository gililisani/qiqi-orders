'use client';

import { useState } from 'react';
import Link from 'next/link';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../../components/qq/card';
import { Input } from '../../../components/qq/input';
import { Button } from '../../../components/qq/button';

/**
 * Disposable admin tool to verify the /api/netsuite/smoke-payments-test
 * endpoint returns the expected shape before we build Phase 2's client
 * UI on top of it. The Hub keeps session tokens in localStorage, so
 * hitting the API URL directly in a browser fails — this page uses
 * fetchWithAuth which attaches the Bearer header correctly.
 *
 * Delete this page (and the matching API route) once Phase 2 ships.
 */
export default function SmokePaymentsPage() {
  const [orderId, setOrderId] = useState(
    'a5d3bd73-f771-432c-8ac4-cba234422197',
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetchWithAuth(
        `/api/netsuite/smoke-payments-test?orderId=${encodeURIComponent(orderId.trim())}`,
      );
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        // Non-JSON response — show as-is
      }
      setResult(pretty);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
      }
    } catch (e: any) {
      setError(e?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Smoke test — invoice payments"
        description="Calls the NetSuite payment helper for one order and dumps the raw response. Disposable, delete once Phase 2 ships."
        breadcrumbs={
          <Link
            href="/admin/netsuite"
            className="text-muted-foreground hover:text-foreground"
          >
            ← NetSuite
          </Link>
        }
      />

      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle>Run</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                Order ID (UUID)
              </label>
              <Input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                placeholder="a5d3bd73-…"
                className="font-mono text-sm"
              />
            </div>
            <Button onClick={run} loading={loading}>
              {loading ? 'Calling NetSuite…' : 'Run smoke test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {result && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Response</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-secondary/40 rounded-md p-4 overflow-auto max-h-[600px] whitespace-pre-wrap break-words font-mono">
              {result}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
