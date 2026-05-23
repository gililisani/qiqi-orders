'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Edit, ArrowRight } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Badge } from '../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { Label } from '../../../components/qq/label';
import { useToast } from '../../../components/ui/ToastProvider';

interface Client {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  company_id: string;
  created_at: string;
  company?: {
    company_name: string;
    netsuite_number: string;
    support_fund?: { percent: number } | null;
    subsidiary?: { name: string } | null;
    class?: { name: string } | null;
    location?: { location_name: string } | null;
  };
}

export default function UserViewPage() {
  const params = useParams();
  const userId = params?.id as string;
  const toast = useToast();

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select(`
            *,
            company:companies(
              company_name,
              netsuite_number,
              support_fund:support_fund_levels(percent),
              subsidiary:subsidiaries(name),
              class:classes(name),
              location:Locations(location_name)
            )
          `)
          .eq('id', userId)
          .single();
        if (error) throw error;
        setClient(data as any);
      } catch (err: any) {
        setError(err.message || 'Failed to load user.');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const handleToggleEnabled = async () => {
    if (!client) return;
    try {
      const { error } = await supabase
        .from('clients')
        .update({ enabled: !client.enabled })
        .eq('id', userId);
      if (error) throw error;
      setClient((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev));
      toast.success(`User ${client.enabled ? 'disabled' : 'enabled'}.`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user.');
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading user…</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="px-6 py-8 max-w-5xl mx-auto">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error || 'User not found.'}</AlertDescription>
        </Alert>
        <Link href="/admin/users">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" /> Back to users
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to users
        </Link>
      </div>

      <PageHeader
        title={client.name || client.email}
        description={client.email}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleEnabled}
            >
              {client.enabled ? 'Disable user' : 'Enable user'}
            </Button>
            <Link href={`/admin/users/${client.id}/edit`}>
              <Button size="sm">
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">User details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ViewField label="Full name" value={client.name || '—'} />
            <ViewField label="Email" value={client.email} mono />
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
                Status
              </Label>
              <div className="mt-1">
                {client.enabled ? (
                  <Badge variant="success">Enabled</Badge>
                ) : (
                  <Badge variant="muted">Disabled</Badge>
                )}
              </div>
            </div>
            <ViewField label="User ID" value={client.id} mono />
            <ViewField
              label="Created"
              value={new Date(client.created_at).toLocaleDateString()}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Company</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {client.company ? (
              <>
                <ViewField label="Company name" value={client.company.company_name || '—'} />
                <ViewField
                  label="NetSuite number"
                  value={client.company.netsuite_number || '—'}
                  mono
                />
                <ViewField
                  label="Support fund"
                  value={`${client.company.support_fund?.percent ?? 0}%`}
                />
                <ViewField label="Subsidiary" value={client.company.subsidiary?.name || '—'} />
                <ViewField label="Class" value={client.company.class?.name || '—'} />
                <ViewField
                  label="Location"
                  value={client.company.location?.location_name || '—'}
                />
                <div className="pt-1">
                  <Link
                    href={`/admin/companies/${client.company_id}`}
                    className="inline-flex items-center text-sm text-brand-periwinkle hover:underline"
                  >
                    View full company <ArrowRight className="h-3 w-3 ml-1" />
                  </Link>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">No company assigned.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ViewField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
        {label}
      </Label>
      <p className={`mt-1 text-sm ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}
