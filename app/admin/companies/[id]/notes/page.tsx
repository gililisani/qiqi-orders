'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import AdminLayout from '../../../../components/AdminLayout';
import InnerPageShell from '../../../../components/ui/InnerPageShell';
import Link from 'next/link';
import { PlusIcon, DocumentIcon, CalendarIcon, UserIcon } from '@heroicons/react/24/outline';
import NoteForm from './NoteForm';

interface Note {
  id: string;
  title: string;
  content: string;
  note_type: 'meeting' | 'webinar' | 'event' | 'feedback';
  meeting_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
}

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

interface Company {
  id: string;
  company_name: string;
}

export default function CompanyNotesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);

  useEffect(() => {
    if (companyId) {
      fetchData();
    }
  }, [companyId]);

  const fetchData = async () => {
    try {
      // Fetch company info
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', companyId)
        .single();

      if (companyError) throw companyError;
      setCompany(companyData);

      // Fetch notes with attachments
      const { data: notesData, error: notesError } = await supabase
        .from('company_notes')
        .select(`
          *,
          attachments:note_attachments(*)
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;
      setNotes(notesData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getNoteTypeIcon = (type: string) => {
    switch (type) {
      case 'meeting':
        return '🤝';
      case 'webinar':
        return '📹';
      case 'event':
        return '🎉';
      case 'feedback':
        return '💬';
      default:
        return '📝';
    }
  };

  const getNoteTypeColor = (type: string) => {
    switch (type) {
      case 'meeting':
        return 'bg-blue-100 text-blue-800';
      case 'webinar':
        return 'bg-purple-100 text-purple-800';
      case 'event':
        return 'bg-green-100 text-green-800';
      case 'feedback':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) return;

    try {
      const { error } = await supabase
        .from('company_notes')
        .delete()
        .eq('id', noteId);

      if (error) throw error;
      fetchData(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFormSuccess = () => {
    fetchData(); // Refresh the list
    setShowCreateForm(false);
    setEditingNote(null);
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
            <p className="text-gray-600">Loading notes...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
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
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <InnerPageShell
          title={`Notes for ${company?.company_name}`}
          breadcrumbs={[
            { label: 'Companies', href: '/admin/companies' },
            { label: company?.company_name || 'Company', href: `/admin/companies/${companyId}` },
            { label: 'Notes' }
          ]}
          actions={
            <div className="flex space-x-3">
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition flex items-center space-x-2"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Add Note</span>
              </button>
              <Link
                href={`/admin/companies/${companyId}`}
                className="text-gray-600 hover:text-gray-800"
              >
                ← Back to Company
              </Link>
            </div>
          }
        >
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <DocumentIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Notes Yet</h3>
              <p className="text-gray-600 mb-6">
                Start documenting meetings, webinars, events, and feedback for this company.
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="bg-black text-white px-6 py-3 rounded hover:opacity-90 transition"
              >
                Create First Note
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {notes.map((note) => (
                <div key={note.id} className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getNoteTypeIcon(note.note_type)}</span>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{note.title}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getNoteTypeColor(note.note_type)}`}>
                            {note.note_type.charAt(0).toUpperCase() + note.note_type.slice(1)}
                          </span>
                          {note.meeting_date && (
                            <div className="flex items-center space-x-1">
                              <CalendarIcon className="h-4 w-4" />
                              <span>{new Date(note.meeting_date).toLocaleDateString()}</span>
                            </div>
                          )}
                          <div className="flex items-center space-x-1">
                            <UserIcon className="h-4 w-4" />
                            <span>Created {formatDate(note.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => setEditingNote(note)}
                        className="text-gray-600 hover:text-gray-800 text-sm"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  
                  <div className="prose max-w-none">
                    <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
                  </div>

                  {note.attachments && note.attachments.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">Attachments</h4>
                      <div className="flex flex-wrap gap-2">
                        {note.attachments.map((attachment) => (
                          <a
                            key={attachment.id}
                            href={attachment.file_path}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm text-gray-700 transition"
                          >
                            <DocumentIcon className="h-4 w-4" />
                            <span>{attachment.file_name}</span>
                            <span className="text-gray-500">
                              ({(attachment.file_size / 1024).toFixed(1)} KB)
                            </span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </InnerPageShell>

        {/* Note Form Modal */}
        {(showCreateForm || editingNote) && (
          <NoteForm
            companyId={companyId}
            onClose={() => {
              setShowCreateForm(false);
              setEditingNote(null);
            }}
            onSuccess={handleFormSuccess}
            editNote={editingNote || undefined}
          />
        )}
      </div>
    </AdminLayout>
  );
}
