'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Edit,
  ShoppingCart,
  StickyNote,
  History,
  Plus,
  Trash2,
} from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';

import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Badge } from '../../../components/qq/badge';
import { SupportFundBadge } from '../../../components/qq/support-fund-badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { Label } from '../../../components/qq/label';
import { Separator } from '../../../components/qq/separator';
import { EmptyState } from '../../../components/qq/empty-state';
import { useToast } from '../../../components/ui/ToastProvider';
import { useConfirm } from '../../../components/ui/ConfirmProvider';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  netsuite_internal_id?: string | null;
  ship_to?: string;
  company_address?: string;
  company_email?: string;
  company_phone?: string;
  company_tax_number?: string;
  ship_to_contact_name?: string;
  ship_to_contact_email?: string;
  ship_to_contact_phone?: string;
  ship_to_street_line_1?: string;
  ship_to_street_line_2?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  ship_to_postal_code?: string;
  ship_to_country?: string;
  contract_execution_date?: string;
  contract_duration_months?: number;
  contract_status?: string;
  support_fund?: { percent: number };
  subsidiary?: { name: string };
  class?: { name: string };
  location?: { location_name: string };
  incoterm?: { name: string };
  payment_term?: { name: string };
  territories?: Territory[];
  target_periods?: TargetPeriod[];
}
interface Territory {
  id: string;
  country_code: string;
  country_name: string;
}
interface TargetPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  target_amount: number;
  current_progress: number;
}
interface User {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
}

const CONTRACT_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  active: 'success',
  expired: 'destructive',
  suspended: 'warning',
  terminated: 'muted',
};

// ============================================================================
// Component
// ============================================================================
export default function CompanyViewPage() {
  const params = useParams();
  const companyId = params?.id as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const [companyRes, territoriesRes, periodsRes, usersRes] = await Promise.all([
          supabase
            .from('companies')
            .select(`
              *,
              support_fund:support_fund_levels(percent),
              subsidiary:subsidiaries(name),
              class:classes(name),
              location:Locations(location_name),
              incoterm:incoterms(name),
              payment_term:payment_terms(name)
            `)
            .eq('id', companyId)
            .single(),
          supabase.from('company_territories').select('*').eq('company_id', companyId),
          supabase
            .from('target_periods')
            .select('*')
            .eq('company_id', companyId)
            .order('start_date', { ascending: true }),
          supabase.from('clients').select('id, name, email, enabled').eq('company_id', companyId).order('name'),
        ]);

        if (cancelled) return;
        if (companyRes.error) throw companyRes.error;

        const { calculateTargetPeriodProgress } = await import('../../../../lib/targetPeriods');
        const periodsWithProgress = await Promise.all(
          (periodsRes.data || []).map(async (p) => {
            const progress = await calculateTargetPeriodProgress(supabase, companyId, p.start_date, p.end_date);
            return { ...p, current_progress: progress };
          })
        );

        if (cancelled) return;
        setCompany({
          ...(companyRes.data as any),
          territories: territoriesRes.data || [],
          target_periods: periodsWithProgress,
        });
        setUsers(usersRes.data || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load company.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const handleDeleteUser = async (user: User) => {
    const ok = await confirm({
      title: 'Delete user?',
      description: `Permanently delete ${user.name || user.email}. This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete user',
      requireExplicitConfirm: true,
    });
    if (!ok) return;
    try {
      const res = await fetchWithAuth('/api/users/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user.');
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success('User deleted.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user.');
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading company…</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="px-6 py-8 max-w-6xl mx-auto">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || 'Company not found.'}</AlertDescription>
        </Alert>
        <Link href="/admin/companies">
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to companies
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/companies"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to companies
        </Link>
      </div>

      <PageHeader
        title={company.company_name}
        description={company.netsuite_number ? `NetSuite #${company.netsuite_number}` : undefined}
        actions={
          <>
            <Link href={`/admin/orders?company_id=${company.id}`}>
              <Button variant="outline" size="sm">
                <ShoppingCart className="h-4 w-4" /> Orders
              </Button>
            </Link>
            <Link href={`/admin/companies/${company.id}/notes`}>
              <Button variant="outline" size="sm">
                <StickyNote className="h-4 w-4" /> Notes
              </Button>
            </Link>
            <Link href={`/admin/companies/${company.id}/historical-sales`}>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4" /> Historical sales
              </Button>
            </Link>
            <Link href={`/admin/companies/${company.id}/edit`}>
              <Button size="sm">
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </Link>
          </>
        }
      />

      {/* Top: Company details + Contact/Shipping */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Company details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <View label="Company name" value={company.company_name} />
            <View label="NetSuite number" value={company.netsuite_number} mono />
            <View label="NetSuite Internal ID" value={company.netsuite_internal_id || '—'} mono />
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
                Support fund
              </Label>
              <div className="mt-1">
                {company.support_fund?.percent ? (
                  <SupportFundBadge percent={company.support_fund.percent} />
                ) : (
                  <Badge variant="muted">0%</Badge>
                )}
              </div>
            </div>
            <View label="Subsidiary" value={company.subsidiary?.name || '—'} />
            <View label="Class" value={company.class?.name || '—'} />
            <View label="Location" value={company.location?.location_name || '—'} />
            {company.incoterm?.name && <View label="Incoterm" value={company.incoterm.name} />}
            {company.payment_term?.name && (
              <View label="Payment terms" value={company.payment_term.name} />
            )}
            {company.company_tax_number && (
              <View label="Tax / VAT number" value={company.company_tax_number} mono />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Contact &amp; shipping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {/* Company contact */}
            {(company.company_address || company.company_email || company.company_phone) && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Company contact
                </h4>
                {company.company_address && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Address</Label>
                    <div className="text-sm whitespace-pre-line mt-0.5">{company.company_address}</div>
                  </div>
                )}
                {company.company_email && <View label="Email" value={company.company_email} />}
                {company.company_phone && <View label="Phone" value={company.company_phone} />}
                <Separator className="mt-2" />
              </div>
            )}

            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ship to
              </h4>
              {company.ship_to && (
                <div>
                  <Label className="text-xs text-muted-foreground">Address</Label>
                  <div className="text-sm whitespace-pre-line mt-0.5">{company.ship_to}</div>
                </div>
              )}
              {company.ship_to_contact_name && (
                <View label="Contact name" value={company.ship_to_contact_name} />
              )}
              {company.ship_to_contact_email && (
                <View label="Contact email" value={company.ship_to_contact_email} />
              )}
              {company.ship_to_contact_phone && (
                <View label="Contact phone" value={company.ship_to_contact_phone} />
              )}

              {/* Structured address */}
              {(company.ship_to_street_line_1 ||
                company.ship_to_city ||
                company.ship_to_country) && (
                <div className="pt-2 mt-2 border-t border-border">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Structured address (3PL export)
                  </h4>
                  <div className="text-sm space-y-0.5">
                    {company.ship_to_street_line_1 && <div>{company.ship_to_street_line_1}</div>}
                    {company.ship_to_street_line_2 && <div>{company.ship_to_street_line_2}</div>}
                    <div>
                      {[
                        company.ship_to_city,
                        company.ship_to_state,
                        company.ship_to_postal_code,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                    {company.ship_to_country && <div>{company.ship_to_country}</div>}
                  </div>
                </div>
              )}

              {!company.ship_to &&
                !company.ship_to_contact_name &&
                !company.ship_to_street_line_1 && (
                  <p className="text-sm text-muted-foreground italic">No shipping info on file.</p>
                )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contract info */}
      {(company.contract_execution_date ||
        company.contract_duration_months ||
        company.contract_status) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Contract</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {company.contract_execution_date && (
                <View label="Execution date" value={company.contract_execution_date} />
              )}
              {company.contract_duration_months && (
                <View
                  label="Duration"
                  value={`${company.contract_duration_months} months (${Math.round(
                    company.contract_duration_months / 12
                  )} years)`}
                />
              )}
              {company.contract_status && (
                <div>
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
                    Status
                  </Label>
                  <div className="mt-1">
                    <Badge variant={CONTRACT_VARIANT[company.contract_status] || 'muted'}>
                      {company.contract_status.charAt(0).toUpperCase() +
                        company.contract_status.slice(1)}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Target periods */}
      {company.target_periods && company.target_periods.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Annual targets &amp; progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {company.target_periods.map((p) => {
                const pct = p.target_amount > 0 ? Math.round((p.current_progress / p.target_amount) * 100) : 0;
                const endDate = new Date(p.end_date);
                endDate.setHours(23, 59, 59, 999);
                const now = new Date();
                const isEnded = now > endDate;
                const daysRemaining = isEnded
                  ? 0
                  : Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={p.id} className="border border-border rounded-md p-3">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center flex-wrap gap-2">
                          <h3 className="text-sm font-medium">{p.period_name}</h3>
                          {isEnded ? (
                            <Badge variant="muted" className="text-[10px]">Ended</Badge>
                          ) : (
                            <Badge variant="accent" className="text-[10px]">
                              {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} to go
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(p.start_date).toLocaleDateString()} —{' '}
                          {new Date(p.end_date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-sm font-mono">
                          ${p.current_progress.toLocaleString()} / ${p.target_amount.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">{pct}%</div>
                      </div>
                    </div>
                    <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-1.5 bg-foreground"
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Territories */}
      {company.territories && company.territories.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Exclusive territories</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {company.territories.map((t) => (
                <Badge key={t.id} variant="secondary">
                  {t.country_name}
                  <span className="ml-1.5 text-muted-foreground">{t.country_code}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users — title outside the card, like Items section on order detail */}
      <div className="flex items-center justify-between gap-3 mt-2 mb-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Users <span className="text-muted-foreground font-normal">({users.length})</span>
        </h2>
        <Link href={`/admin/companies/${company.id}/users/new`}>
          <Button size="sm">
            <Plus className="h-4 w-4" /> Add user
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          {users.length === 0 ? (
            <EmptyState
              title="No users yet"
              description="Add a client user so they can place orders."
              action={
                <Link href={`/admin/companies/${company.id}/users/new`}>
                  <Button size="sm">
                    <Plus className="h-4 w-4" /> Add user
                  </Button>
                </Link>
              }
              className="border-0 shadow-none"
            />
          ) : (
            <ul className="divide-y divide-border">
              {users.map((user) => (
                <li
                  key={user.id}
                  className="py-3 flex items-center justify-between gap-3 flex-wrap"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{user.name || '—'}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {user.enabled ? (
                      <Badge variant="success">Enabled</Badge>
                    ) : (
                      <Badge variant="muted">Disabled</Badge>
                    )}
                    <Link
                      href={`/admin/companies/${company.id}/users/${user.id}/edit`}
                    >
                      <Button variant="outline" size="sm">
                        <Edit className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteUser(user)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function View({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
        {label}
      </Label>
      <p className={`mt-1 text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
