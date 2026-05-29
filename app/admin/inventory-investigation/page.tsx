'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PackageSearch, ArrowRight } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { EmptyState } from '../../components/qq/empty-state';

interface CachedItem {
  item_code: string;
  item_name: string | null;
  item_type: string | null;
  last_refreshed_at: string | null;
}

export default function InventoryInvestigationLanding() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [items, setItems] = useState<CachedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/inventory-investigation');
        const json = await res.json().catch(() => ({}));
        if (res.ok) setItems(json.items ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const go = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/admin/inventory-investigation/${encodeURIComponent(c)}`);
  };

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Inventory Investigation"
        description="Diagnose negative-inventory problems across all locations and simulate fixes before touching NetSuite."
      />

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={go} className="flex items-end gap-2 max-w-md">
            <div className="flex-1">
              <label className="text-sm font-medium mb-1 block">Item code (SKU)</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. COM0067"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={!code.trim()}>
              Investigate <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
          <p className="mt-2 text-xs text-muted-foreground">
            Enter any inventory item or assembly SKU. On first open it pulls fresh from NetSuite.
          </p>
        </CardContent>
      </Card>

      <h2 className="text-sm font-semibold text-muted-foreground mb-2">Recently investigated</h2>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<PackageSearch />}
          title="No items investigated yet"
          description="Search for an item code above to pull its history from NetSuite."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((it) => (
            <button
              key={it.item_code}
              onClick={() => router.push(`/admin/inventory-investigation/${encodeURIComponent(it.item_code)}`)}
              className="text-left rounded-md border border-border bg-card hover:bg-secondary transition-colors px-4 py-3"
            >
              <div className="font-medium flex items-center gap-2">
                <PackageSearch className="h-4 w-4 text-muted-foreground" />
                {it.item_code}
              </div>
              <div className="text-xs text-muted-foreground truncate">{it.item_name || '—'}</div>
              {it.last_refreshed_at && (
                <div className="text-[11px] text-muted-foreground mt-1">
                  refreshed {new Date(it.last_refreshed_at).toLocaleDateString()}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
