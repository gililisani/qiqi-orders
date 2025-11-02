'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';


import InnerPageShell from '../../../../components/ui/InnerPageShell';
import Link from 'next/link';
import NotesView from '../../../../components/shared/NotesView';

interface Company {
  id: string;
  company_name: string;
}

export default function CompanyNotesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (companyId) {
      fetchCompany();
    }
  }, [companyId]);

  const fetchCompany = async () => {
    try {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <
        <div className="p-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
            <p className="text-gray-600">Loading company...</p>
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <Link
              href="/admin/companies"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Companies
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6">
        <InnerPageShell
          title={`Notes for ${company?.company_name}`}
          breadcrumbs={[
            { label: 'Companies', href: '/admin/companies' },
            { label: company?.company_name || 'Company', href: `/admin/companies/${companyId}` },
            { label: 'Notes' }
          ]}
          actions={
            <Link
              href={`/admin/companies/${companyId}`}
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back to Company
            </Link>
          }
        >
          {/* Use Shared Notes Component with Admin Permissions */}
          <NotesView
            companyId={companyId}
            userRole="admin"
            showActions={true}
            allowEdit={true}
            allowDelete={true}
            allowCreate={true}
          />
        </InnerPageShell>
      </div>
    </>
  );
}