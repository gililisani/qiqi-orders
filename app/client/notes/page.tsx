'use client';

import { useEffect, useState } from 'react';

import { supabase } from '../../../lib/supabaseClient';
import NotesView from '../../components/shared/NotesView';
import { PageHeader } from '../../components/qq/page-header';
import { Alert, AlertDescription } from '../../components/qq/alert';

interface Company {
  id: string;
  company_name: string;
}

export default function ClientNotesPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');

        const { data, error } = await supabase
          .from('clients')
          .select(`
            company_id,
            company:companies(id, company_name)
          `)
          .eq('id', user.id)
          .single();
        if (error) throw error;
        const companyData = Array.isArray(data?.company)
          ? data?.company?.[0]
          : data?.company;
        setCompany(companyData || null);
      } catch (err: any) {
        setError(err.message || 'Failed to load company.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading notes…</p>
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

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Notes"
        description={`Updates from the Qiqi team for ${company.company_name}.`}
      />
      <NotesView
        companyId={company.id}
        userRole="client"
        showActions={false}
        allowEdit={false}
        allowDelete={false}
        allowCreate={false}
      />
    </div>
  );
}
