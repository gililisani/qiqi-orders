'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../../components/ui/Card';
import NotesView from '../../components/shared/NotesView';

interface Company {
  id: string;
  company_name: string;
}

export default function ClientNotesPage() {
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCompany();
  }, []);

  const fetchCompany = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get user's company info
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name
          )
        `)
        .eq('id', user.id)
        .single();

      if (clientError) throw clientError;
      
      // Handle both array and object cases
      const companyData = Array.isArray(clientData?.company) 
        ? clientData?.company?.[0] 
        : clientData?.company;
      setCompany(companyData || null);

      // Don't auto-mark notes as viewed - clients must manually check "Mark as Read"
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };



  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
        <p className="text-gray-600">Loading notes...</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
        <p className="text-gray-600 mb-4">{error || 'Company information not found.'}</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">Notes</h2>
      
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
