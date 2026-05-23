'use client';

import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../lib/formatters';
import TerritoryList from '../../components/shared/TerritoryList';

import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Badge } from '../../components/qq/badge';
import { Separator } from '../../components/qq/separator';
import { Alert, AlertDescription } from '../../components/qq/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/qq/table';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  company_address?: string;
  company_email?: string;
  company_phone?: string;
  company_tax_number?: string;
  ship_to_street_line_1?: string;
  ship_to_street_line_2?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  ship_to_postal_code?: string;
  ship_to_country?: string;
  contract_execution_date?: string;
  contract_duration_months?: number;
  contract_status?: string;
  support_fund?: { percent: number } | { percent: number }[];
  incoterm?: { name: string };
  payment_term?: { name: string };
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
  created_at: string;
}

interface Stats {
  ordersThisYear: number;
  openOrders: number;
  totalValueThisYear: number;
}

export default function YourCompanyPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [targetPeriods, setTargetPeriods] = useState<TargetPeriod[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({
    ordersThisYear: 0,
    openOrders: 0,
    totalValueThisYear: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select('company_id')
          .eq('id', user.id)
          .single();
        if (clientError) throw clientError;
        if (!clientData?.company_id) throw new Error('User not associated with a company.');
        await Promise.all([
          fetchCompany(clientData.company_id),
          fetchTerritories(clientData.company_id),
          fetchTargetPeriods(clientData.company_id),
          fetchUsers(clientData.company_id),
          fetchStats(clientData.company_id),
        ]);
      } catch (err: any) {
        setError(err.message || 'Failed to load company.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const fetchCompany = async (companyId: string) => {
    const { data, error } = await supabase
      .from('companies')
      .select(`*, support_fund:support_fund_levels(percent), incoterm:incoterms(name), payment_term:payment_terms(name)`)
      .eq('id', companyId)
      .single();
    if (error) throw error;
    setCompany(data);
  };

  const fetchTerritories = async (companyId: string) => {
    const { data, error } = await supabase
      .from('company_territories')
      .select('*')
      .eq('company_id', companyId);
    if (error) throw error;
    setTerritories(data || []);
  };

  const fetchTargetPeriods = async (companyId: string) => {
    const { data, error } = await supabase
      .from('target_periods')
      .select('*')
      .eq('company_id', companyId)
      .order('start_date', { ascending: true });
    if (error) throw error;
    const { calculateTargetPeriodProgress } = await import('../../../lib/targetPeriods');
    const withProgress = await Promise.all(
      (data || []).map(async (p) => ({
        ...p,
        current_progress: await calculateTargetPeriodProgress(
          supabase,
          companyId,
          p.start_date,
          p.end_date
        ),
      }))
    );
    setTargetPeriods(withProgress);
  };

  const fetchUsers = async (companyId: string) => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, email, enabled, created_at')
      .eq('company_id', companyId)
      .order('name', { ascending: true });
    if (error) throw error;
    setUsers(data || []);
  };

  const fetchStats = async (companyId: string) => {
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const yearEnd = `${new Date().getFullYear()}-12-31`;
    const { data: allOrders, error } = await supabase
      .from('orders')
      .select('id, created_at, status, total_value')
      .eq('company_id', companyId);
    if (error) throw error;
    const inYear = (allOrders || []).filter(
      (o) =>
        new Date(o.created_at) >= new Date(yearStart) &&
        new Date(o.created_at) <= new Date(yearEnd)
    );
    setStats({
      ordersThisYear: inYear.length,
      openOrders: (allOrders || []).filter(
        (o) => !['Done', 'Cancelled', 'Draft'].includes(o.status)
      ).length,
      totalValueThisYear: inYear.reduce((sum, o) => sum + (o.total_value || 0), 0),
    });
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading company…</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error || 'Company information not found.'}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const supportFundPercent = Array.isArray(company.support_fund)
    ? company.support_fund[0]?.percent || 0
    : company.support_fund?.percent || 0;

  const shipTo = [
    company.ship_to_street_line_1,
    company.ship_to_street_line_2,
    [company.ship_to_city, company.ship_to_state].filter(Boolean).join(', '),
    company.ship_to_postal_code,
    company.ship_to_country,
  ].filter(Boolean);

  const expirationDate = (() => {
    if (!company.contract_execution_date || !company.contract_duration_months) return null;
    const d = new Date(company.contract_execution_date);
    d.setMonth(d.getMonth() + company.contract_duration_months);
    return d;
  })();

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title={company.company_name}
        description={
          company.netsuite_number
            ? `NetSuite customer ${company.netsuite_number}`
            : undefined
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          label="Orders this year"
          value={stats.ordersThisYear}
          sub={`Calendar year ${new Date().getFullYear()}`}
        />
        <StatCard label="Open orders" value={stats.openOrders} sub="Orders in progress" />
        <StatCard
          label="Total orders value"
          value={formatCurrency(stats.totalValueThisYear)}
          sub="This year"
        />
      </div>

      {/* Company details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <Field label="Company name" value={company.company_name} />
              {company.company_email && <Field label="Email" value={company.company_email} />}
              {company.company_phone && <Field label="Phone" value={company.company_phone} />}
              {company.company_address && (
                <Field label="Address" value={company.company_address} multiline />
              )}
              {shipTo.length > 0 && (
                <Field label="Ship-to address" value={shipTo.join(', ')} />
              )}
              {company.company_tax_number && (
                <Field label="Tax / VAT number" value={company.company_tax_number} />
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Financial terms</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              {company.incoterm?.name && (
                <Field label="Incoterm" value={company.incoterm.name} />
              )}
              {company.payment_term?.name && (
                <Field label="Payment terms" value={company.payment_term.name} />
              )}
              {supportFundPercent > 0 && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Support fund</dt>
                  <dd>
                    <Badge variant="success">{supportFundPercent}% credit</Badge>
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Contract */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Contract</CardTitle>
        </CardHeader>
        <CardContent>
          {company.contract_execution_date ||
          company.contract_duration_months ||
          targetPeriods.length > 0 ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                {company.contract_execution_date && (
                  <Field
                    label="Execution date"
                    value={new Date(company.contract_execution_date).toLocaleDateString()}
                  />
                )}
                {company.contract_duration_months && (
                  <Field
                    label="Duration"
                    value={`${company.contract_duration_months} months`}
                  />
                )}
                {expirationDate && (
                  <Field label="Expiration date" value={expirationDate.toLocaleDateString()} />
                )}
              </div>

              {targetPeriods.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm font-medium mb-3">Annual targets</p>
                    <div className="space-y-3">
                      {targetPeriods.map((p) => {
                        const endDate = new Date(p.end_date);
                        endDate.setHours(23, 59, 59, 999);
                        const startDate = new Date(p.start_date);
                        const now = new Date();
                        const isEnded = now > endDate;
                        const hasStarted = now >= startDate;
                        const daysRemaining = isEnded
                          ? 0
                          : Math.ceil(
                              (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
                            );
                        const progressPct =
                          p.target_amount > 0
                            ? Math.min(
                                100,
                                ((p.current_progress || 0) / p.target_amount) * 100
                              )
                            : 0;
                        return (
                          <div
                            key={p.id}
                            className="border border-border rounded-md p-4"
                          >
                            <div className="flex justify-between items-start mb-2 gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-sm font-medium">{p.period_name}</p>
                                  {isEnded && <Badge variant="muted">Ended</Badge>}
                                  {!isEnded && hasStarted && (
                                    <Badge variant="accent">
                                      {daysRemaining}{' '}
                                      {daysRemaining === 1 ? 'day' : 'days'} left
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {new Date(p.start_date).toLocaleDateString()} —{' '}
                                  {new Date(p.end_date).toLocaleDateString()}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-semibold font-mono">
                                  {formatCurrency(p.target_amount)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Progress: {formatCurrency(p.current_progress || 0)}
                                </p>
                              </div>
                            </div>
                            {p.target_amount > 0 && (
                              <div className="w-full bg-muted rounded-full h-1.5 mt-2 overflow-hidden">
                                <div
                                  className="bg-foreground h-full rounded-full transition-all"
                                  style={{ width: `${progressPct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No contract information available.</p>
          )}
        </CardContent>
      </Card>

      {/* Territories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Territories</CardTitle>
        </CardHeader>
        <CardContent>
          {territories.length > 0 ? (
            <TerritoryList
              companyId={company.id}
              userRole="client"
              showActions={false}
              allowEdit={false}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No territories assigned.</p>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Users</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm font-medium">{u.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      {u.enabled ? (
                        <Badge variant="success">Enabled</Badge>
                      ) : (
                        <Badge variant="muted">Disabled</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground p-4">No users.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground mb-0.5">{label}</dt>
      <dd className={`font-medium ${multiline ? 'whitespace-pre-line' : ''}`}>{value}</dd>
    </div>
  );
}
