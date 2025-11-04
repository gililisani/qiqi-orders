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

      // Mark all notes as viewed for this client
      if (companyData?.id) {
        await markAllNotesAsViewed(user.id, companyData.id);
        // Dispatch custom event to notify navbar
        window.dispatchEvent(new Event('notesViewed'));
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAllNotesAsViewed = async (clientId: string, companyId: string) => {
    try {
      // Get all visible notes for this company
      const { data: notes, error: notesError } = await supabase
        .from('company_notes')
        .select('id')
        .eq('company_id', companyId)
        .eq('visible_to_client', true);

      if (notesError) throw notesError;
      if (!notes || notes.length === 0) return;

      // Get existing views
      const { data: existingViews } = await supabase
        .from('client_note_views')
        .select('note_id')
        .eq('client_id', clientId)
        .in('note_id', notes.map(n => n.id));

      const existingNoteIds = new Set(existingViews?.map(v => v.note_id) || []);

      // Insert views for notes that haven't been viewed yet
      const newViews = notes
        .filter(note => !existingNoteIds.has(note.id))
        .map(note => ({
          client_id: clientId,
          note_id: note.id,
          viewed_at: new Date().toISOString()
        }));

      if (newViews.length > 0) {
        const { error: insertError } = await supabase
          .from('client_note_views')
          .insert(newViews);

        if (insertError) {
          console.error('Error marking notes as viewed:', insertError);
        }
      }
    } catch (err) {
      console.error('Error in markAllNotesAsViewed:', err);
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
