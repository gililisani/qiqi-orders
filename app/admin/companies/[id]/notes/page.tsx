'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
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
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | '30days' | '3months' | 'ytd'>('all');

  useEffect(() => {
    if (companyId) {
      fetchCompany();
    } else {
      setError('Company ID is missing');
      setLoading(false);
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
      <div className="p-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
            <p className="text-gray-600">Loading company...</p>
          </div>
        </div>
    );
  }

  if (error) {
    return (
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
    );
  }

  // Set breadcrumb
  useEffect(() => {
    if (!company) return;
    
    // Wait for breadcrumb function to be available
    const setBreadcrumbs = () => {
      if ((window as any).__setBreadcrumbs) {
        try {
          (window as any).__setBreadcrumbs([
            { label: company.company_name },
            { label: 'Notes' }
          ]);
        } catch (error) {
          console.error('Error setting breadcrumbs:', error);
        }
      }
    };
    
    // Try immediately, then retry after a short delay if needed
    setBreadcrumbs();
    const timeoutId = setTimeout(setBreadcrumbs, 100);
    
    return () => {
      clearTimeout(timeoutId);
      if ((window as any).__setBreadcrumbs) {
        try {
          (window as any).__setBreadcrumbs([]);
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    };
  }, [company]);

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Notes for {company?.company_name}</h2>
        <Link
          href={`/admin/companies/${companyId}`}
          className="text-gray-600 hover:text-gray-800"
        >
          ← Back to Company
        </Link>
      </div>

      {/* Filters */}
          <div className="mb-6 flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="all">All Categories</option>
                <option value="meeting">🤝 Meeting</option>
                <option value="webinar">📹 Webinar</option>
                <option value="event">🎉 Event</option>
                <option value="feedback">💬 Feedback</option>
                <option value="general_note">📝 General Note</option>
                <option value="internal_note">🔒 Internal Note</option>
              </select>
            </div>

            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Period
              </label>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as 'all' | '30days' | '3months' | 'ytd')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="all">All Time</option>
                <option value="30days">Last 30 Days</option>
                <option value="3months">Last 3 Months</option>
                <option value="ytd">Year to Date</option>
              </select>
            </div>
          </div>

          {/* Use Shared Notes Component with Admin Permissions and Filters */}
          {companyId && (
            <NotesView
              companyId={companyId}
              userRole="admin"
              showActions={true}
              allowEdit={true}
              allowDelete={true}
              allowCreate={true}
              categoryFilter={categoryFilter}
              timeFilter={timeFilter}
            />
          )}
    </div>
  );
}