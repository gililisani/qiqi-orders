'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { supabase } from '../../../../../lib/supabaseClient';
import NotesView from '../../../../components/shared/NotesView';
import { PageHeader } from '../../../../components/qq/page-header';
import { Card } from '../../../../components/qq/card';
import { Label } from '../../../../components/qq/label';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/qq/select';

interface Company {
  id: string;
  company_name: string;
}

export default function CompanyNotesPage() {
  const params = useParams();
  const companyId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | '30days' | '3months' | 'ytd'>('all');

  useEffect(() => {
    if (!companyId) {
      setError('Company ID is missing');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('id, company_name')
          .eq('id', companyId)
          .single();
        if (error) throw error;
        setCompany(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load company.');
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link
          href="/admin/companies"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to companies
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/admin/companies/${companyId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to company
        </Link>
      </div>

      <PageHeader
        title="Notes"
        description={company ? `For ${company.company_name}.` : undefined}
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <div>
            <Label className="text-sm font-medium">Category</Label>
            <div className="mt-1.5">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="webinar">Webinar</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="feedback">Feedback</SelectItem>
                  <SelectItem value="general_note">General note</SelectItem>
                  <SelectItem value="internal_note">Internal note</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-sm font-medium">Time period</Label>
            <div className="mt-1.5">
              <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All time</SelectItem>
                  <SelectItem value="30days">Last 30 days</SelectItem>
                  <SelectItem value="3months">Last 3 months</SelectItem>
                  <SelectItem value="ytd">Year to date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Card>

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
