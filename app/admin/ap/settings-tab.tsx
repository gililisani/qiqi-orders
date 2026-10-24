'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatDateTime } from '../../../lib/formatters';
import { useToast } from '../../components/ui/ToastProvider';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Badge } from '../../components/qq/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/qq/table';

interface PaymentAccount {
  ns_account_id: string;
  name: string;
  type: 'card' | 'bank';
  last4: string | null;
  currency: string | null;
  uses: number;
}

interface Settings {
  ns_target: 'sandbox' | 'production';
  mailbox: string | null;
  approver_ids: string[];
  payment_accounts: PaymentAccount[];
  learned_at: string | null;
  learn_summary: { since: string; bills: number; vendors: number; consistentVendors: number; cards: number } | null;
}

interface Admin {
  id: string;
  name: string | null;
  email: string;
}

async function patch(body: Record<string, unknown>): Promise<Settings> {
  const res = await fetchWithAuth('/api/ap/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to save.');
  return json.settings;
}

export function SettingsTab() {
  const toast = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<string[]>([]);
  const [mailbox, setMailbox] = useState('');
  const [learning, setLearning] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [last4, setLast4] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const res = await fetchWithAuth('/api/ap/settings');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load.');
      setSettings(json.settings);
      setAdmins(json.admins);
      setApprovers(json.settings.approver_ids);
      setMailbox(json.settings.mailbox ?? '');
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string, body: Record<string, unknown>, done: string) => {
    setSaving(key);
    try {
      setSettings(await patch(body));
      toast.success(done);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(null);
    }
  };

  const learn = async () => {
    setLearning(true);
    try {
      const res = await fetchWithAuth('/api/ap/learn', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Learning failed.');
      toast.success(`Learned ${json.summary.vendors} vendors from ${json.summary.bills} bills.`);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLearning(false);
    }
  };

  if (error) return <p className="mt-6 text-sm text-muted-foreground">Unavailable right now: {error}</p>;
  if (!settings) return <p className="mt-6 text-sm text-muted-foreground">Loading…</p>;

  const s = settings.learn_summary;
  const approversChanged = [...approvers].sort().join() !== [...settings.approver_ids].sort().join();

  return (
    <div className="mt-6 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Learn from NetSuite</CardTitle>
            <Badge variant={settings.ns_target === 'production' ? 'success' : 'warning'}>
              Posting to NetSuite {settings.ns_target === 'production' ? 'production' : 'sandbox (testing)'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Reads your vendor bills and payments from the last 18 months and learns how each vendor is booked — account,
            department, class, VAT code, which card or bank pays it. Nothing in NetSuite changes.
          </p>
          {s && settings.learned_at ? (
            <p>
              Last learned {formatDateTime(settings.learned_at)}: <strong>{s.bills}</strong> bills from{' '}
              <strong>{s.vendors}</strong> vendors since {s.since}; <strong>{s.consistentVendors}</strong> vendors are booked
              the same way every time; <strong>{s.cards}</strong> cards found.
            </p>
          ) : (
            <p>Not learned yet.</p>
          )}
          <Button size="sm" onClick={learn} disabled={learning}>
            <RefreshCw className={learning ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            {learning ? 'Learning…' : settings.learned_at ? 'Learn again' : 'Learn from NetSuite'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approvers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Only these admins can approve bills. They get an email when invoices are waiting.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {admins.map((a) => (
              <label key={a.id} className="flex cursor-pointer select-none items-center gap-2">
                <input
                  type="checkbox"
                  checked={approvers.includes(a.id)}
                  onChange={(e) =>
                    setApprovers((prev) => (e.target.checked ? [...prev, a.id] : prev.filter((id) => id !== a.id)))
                  }
                  className="h-4 w-4 accent-foreground"
                />
                <span>{a.name || a.email}</span>
                {a.name && <span className="text-xs text-muted-foreground">{a.email}</span>}
              </label>
            ))}
          </div>
          <Button
            size="sm"
            disabled={!approversChanged || saving === 'approvers'}
            onClick={() => save('approvers', { approver_ids: approvers }, 'Approvers saved.')}
          >
            Save approvers
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AP mailbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">Invoices sent or forwarded to this address come into the inbox.</p>
          <div className="flex max-w-md gap-2">
            <Input value={mailbox} onChange={(e) => setMailbox(e.target.value)} placeholder="ap@yourcompany.com" type="email" className="h-9" />
            <Button
              size="sm"
              disabled={mailbox.trim().toLowerCase() === (settings.mailbox ?? '') || saving === 'mailbox'}
              onClick={() => save('mailbox', { mailbox: mailbox.trim() || null }, 'Mailbox saved.')}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Cards and bank accounts that pay vendor bills, from NetSuite. When an invoice says “paid with card ending 5335”,
            the payment is recorded from the card with those digits.
          </p>
          {settings.payment_accounts.length === 0 ? (
            <p>None yet — run “Learn from NetSuite”.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Card last 4</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Bill payments (18 mo.)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.payment_accounts.map((a) => (
                  <TableRow key={a.ns_account_id}>
                    <TableCell>{a.name}</TableCell>
                    <TableCell>{a.type === 'card' ? 'Card' : 'Bank'}</TableCell>
                    <TableCell>
                      {a.type !== 'card' ? (
                        <span className="text-muted-foreground">—</span>
                      ) : a.last4 && last4[a.ns_account_id] === undefined ? (
                        <button
                          type="button"
                          className="tabular-nums hover:underline"
                          onClick={() => setLast4((m) => ({ ...m, [a.ns_account_id]: a.last4 ?? '' }))}
                          title="Change"
                        >
                          •••• {a.last4}
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Input
                            value={last4[a.ns_account_id] ?? ''}
                            onChange={(e) => setLast4((m) => ({ ...m, [a.ns_account_id]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                            placeholder="1234"
                            inputMode="numeric"
                            className="h-8 w-20"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!/^\d{4}$/.test(last4[a.ns_account_id] ?? '') || saving === a.ns_account_id}
                            onClick={async () => {
                              await save(a.ns_account_id, { card_last4: { ns_account_id: a.ns_account_id, last4: last4[a.ns_account_id] } }, 'Card saved.');
                              setLast4((m) => {
                                const { [a.ns_account_id]: _, ...rest } = m;
                                return rest;
                              });
                            }}
                          >
                            Save
                          </Button>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{a.currency ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.uses}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
