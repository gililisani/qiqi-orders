'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { DocumentIcon, CalendarIcon, UserIcon, PlusIcon, PencilIcon, TrashIcon, ChatBubbleLeftIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import NoteForm from './NoteForm';

interface Note {
  id: string;
  title: string;
  content: string;
  note_type: 'meeting' | 'webinar' | 'event' | 'feedback' | 'general_note' | 'internal_note';
  meeting_date: string | null;
  visible_to_client: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments: Attachment[];
  created_by_admin?: { name: string } | null;
  replies?: NoteReply[];
}

interface NoteReply {
  id: string;
  note_id: string;
  content: string;
  created_by: string;
  created_at: string;
  created_by_admin?: { name: string } | null;
}

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  created_at: string;
}

interface NotesViewProps {
  companyId: string;
  userRole: 'admin' | 'client';
  showActions?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  allowCreate?: boolean;
  className?: string;
  categoryFilter?: string; // Filter by note type
  timeFilter?: 'all' | '30days' | '3months' | 'ytd'; // Time period filter
}

export default function NotesView({
  companyId,
  userRole,
  showActions = userRole === 'admin',
  allowEdit = userRole === 'admin',
  allowDelete = userRole === 'admin',
  allowCreate = userRole === 'admin',
  className = '',
  categoryFilter = 'all',
  timeFilter = 'all'
}: NotesViewProps) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]); // Store all fetched notes
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [replyingToNote, setReplyingToNote] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);

  const getEffectiveDate = (note: Note): Date => {
    // For internal notes with replies, use the latest reply date if it's more recent than note creation
    if (!note.visible_to_client && note.replies && note.replies.length > 0) {
      const latestReply = note.replies.reduce((latest, reply) => {
        return new Date(reply.created_at) > new Date(latest.created_at) ? reply : latest;
      });
      const latestReplyDate = new Date(latestReply.created_at);
      const noteCreatedDate = new Date(note.created_at);
      return latestReplyDate > noteCreatedDate ? latestReplyDate : noteCreatedDate;
    }
    // Otherwise use note creation date
    return new Date(note.created_at);
  };

  const applyFilters = () => {
    let filtered = [...allNotes];

    // Apply category filter
    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter(note => note.note_type === categoryFilter);
    }

    // Apply time filter
    if (timeFilter && timeFilter !== 'all') {
      const now = new Date();
      const effectiveDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let cutoffDate: Date;
      switch (timeFilter) {
        case '30days':
          cutoffDate = new Date(effectiveDate);
          cutoffDate.setDate(cutoffDate.getDate() - 30);
          break;
        case '3months':
          cutoffDate = new Date(effectiveDate);
          cutoffDate.setMonth(cutoffDate.getMonth() - 3);
          break;
        case 'ytd':
          cutoffDate = new Date(now.getFullYear(), 0, 1); // January 1st of current year
          break;
        default:
          cutoffDate = new Date(0); // All time
      }

      filtered = filtered.filter(note => {
        const effectiveNoteDate = getEffectiveDate(note);
        return effectiveNoteDate >= cutoffDate;
      });
    }

    setNotes(filtered);
  };

  useEffect(() => {
    if (companyId) {
      fetchNotes();
    }
  }, [companyId]);

  // Apply filters whenever categoryFilter, timeFilter, or allNotes change
  useEffect(() => {
    applyFilters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, timeFilter, allNotes]);

  const getAttachmentUrl = async (attachment: Attachment): Promise<string> => {
    try {
      const { data, error } = await supabase.storage
        .from('company-notes')
        .createSignedUrl(attachment.file_path, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    } catch (err: any) {
      console.error('Error getting attachment URL:', err);
      throw err;
    }
  };

  const fetchNotes = async () => {
    try {
      let query = supabase
        .from('company_notes')
        .select(`
          *,
          attachments:note_attachments(*)
        `)
        .eq('company_id', companyId);

      // If user is a client, only show notes visible to clients
      if (userRole === 'client') {
        query = query.eq('visible_to_client', true);
      }

      const { data: notesData, error: notesError } = await query
        .order('created_at', { ascending: false });

      if (notesError) throw notesError;

      // Fetch admin names for note creators
      if (notesData && notesData.length > 0) {
        const creatorIds = [...new Set(notesData.map((note: Note) => note.created_by))];
        
        const { data: adminsData } = await supabase
          .from('admins')
          .select('id, name')
          .in('id', creatorIds);

        // Create a map of admin IDs to names
        const adminsMap = new Map(adminsData?.map(admin => [admin.id, admin.name]) || []);

        // Attach admin names to notes
        notesData.forEach((note: Note) => {
          const adminName = adminsMap.get(note.created_by);
          note.created_by_admin = adminName ? { name: adminName } : null;
        });
      }

      // Fetch replies for Internal Notes (only for admins)
      if (userRole === 'admin' && notesData) {
        const internalNoteIds = notesData
          .filter((note: Note) => !note.visible_to_client)
          .map((note: Note) => note.id);

        if (internalNoteIds.length > 0) {
          const { data: repliesData, error: repliesError } = await supabase
            .from('note_replies')
            .select('*')
            .in('note_id', internalNoteIds)
            .order('created_at', { ascending: true });

          if (!repliesError && repliesData) {
            // Fetch admin names for reply creators
            const replyCreatorIds = [...new Set(repliesData.map((reply: NoteReply) => reply.created_by))];
            
            const { data: replyAdminsData } = await supabase
              .from('admins')
              .select('id, name')
              .in('id', replyCreatorIds);

            // Create a map of admin IDs to names for replies
            const replyAdminsMap = new Map(replyAdminsData?.map(admin => [admin.id, admin.name]) || []);

            // Attach admin names to replies and then attach replies to notes
            repliesData.forEach((reply: NoteReply) => {
              const adminName = replyAdminsMap.get(reply.created_by);
              reply.created_by_admin = adminName ? { name: adminName } : null;
            });

            // Attach replies to their respective notes
            notesData.forEach((note: Note) => {
              note.replies = repliesData.filter((reply: NoteReply) => reply.note_id === note.id);
            });
          }
        }
      }

      // Store all notes - filtering will be applied by useEffect
      setAllNotes(notesData || []);

      // Generate signed URLs for all attachments
      const urlPromises: Promise<void>[] = [];
      const urlMap: Record<string, string> = {};

      notesData?.forEach(note => {
        note.attachments?.forEach((attachment: Attachment) => {
          urlPromises.push(
            getAttachmentUrl(attachment)
              .then(url => {
                urlMap[attachment.id] = url;
              })
              .catch(err => {
                console.error(`Failed to get URL for attachment ${attachment.id}:`, err);
                urlMap[attachment.id] = '#';
              })
          );
        });
      });

      await Promise.all(urlPromises);
      setAttachmentUrls(urlMap);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      fetchNotes(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleFormSuccess = async () => {
    await fetchNotes(); // Refresh the list
    setShowCreateForm(false);
    setEditingNote(null);
  };

  const handleSubmitReply = async (noteId: string) => {
    const content = replyContent[noteId]?.trim();
    if (!content) return;

    setSubmittingReply(noteId);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase
        .from('note_replies')
        .insert({
          note_id: noteId,
          content: content,
          created_by: user.id
        });

      if (error) throw error;

      // Clear reply input and refresh notes
      setReplyContent(prev => ({ ...prev, [noteId]: '' }));
      setReplyingToNote(null);
      await fetchNotes();
    } catch (err: any) {
      console.error('Error submitting reply:', err);
      alert('Failed to submit reply: ' + err.message);
    } finally {
      setSubmittingReply(null);
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
      case 'general_note':
        return '📝';
      case 'internal_note':
        return '🔒';
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
      case 'general_note':
        return 'bg-gray-100 text-gray-800';
      case 'internal_note':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getNoteTypeLabel = (type: string) => {
    switch (type) {
      case 'meeting':
        return 'Meeting';
      case 'webinar':
        return 'Webinar';
      case 'event':
        return 'Event';
      case 'feedback':
        return 'Feedback';
      case 'general_note':
        return 'General Note';
      case 'internal_note':
        return 'Internal Note';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
    }
  };

  if (loading) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
        <p className="text-gray-600">Loading notes...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-red-600 mb-4">
          <DocumentIcon className="h-12 w-12 mx-auto mb-2" />
          <h3 className="text-lg font-medium">Error Loading Notes</h3>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header with Actions */}
      {showActions && allowCreate && (
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Company Notes</h2>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition flex items-center space-x-2"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Add Note</span>
          </button>
        </div>
      )}

      {/* Notes List */}
      {notes.length === 0 ? (
        <div className="text-center py-12">
          <DocumentIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Notes Yet</h3>
          <p className="text-gray-600 mb-6">
            {userRole === 'admin' 
              ? 'Start documenting meetings, webinars, events, and feedback for this company.'
              : 'No notes have been shared with your company yet.'
            }
          </p>
          {allowCreate && (
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-black text-white px-6 py-3 rounded hover:opacity-90 transition"
            >
              Create First Note
            </button>
          )}
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
                    <div className="flex items-center space-x-4 text-sm text-gray-500 flex-wrap gap-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getNoteTypeColor(note.note_type)}`}>
                        {getNoteTypeLabel(note.note_type)}
                      </span>
                      {!note.visible_to_client && userRole === 'admin' && (
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Internal
                        </span>
                      )}
                      {note.meeting_date && (
                        <div className="flex items-center space-x-1">
                          <CalendarIcon className="h-4 w-4" />
                          <span>{new Date(note.meeting_date).toLocaleDateString()}</span>
                        </div>
                      )}
                      <div className="flex items-center space-x-1">
                        <UserIcon className="h-4 w-4" />
                        <span>
                          {note.created_by_admin?.name ? `Created by ${note.created_by_admin.name}` : 'Created'} {formatDate(note.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                {showActions && (allowEdit || allowDelete) && (
                  <div className="flex space-x-2">
                    {allowEdit && (
                      <button 
                        onClick={() => setEditingNote(note)}
                        className="text-gray-600 hover:text-gray-800 text-sm flex items-center space-x-1"
                      >
                        <PencilIcon className="h-4 w-4" />
                        <span>Edit</span>
                      </button>
                    )}
                    {allowDelete && (
                      <button 
                        onClick={() => handleDeleteNote(note.id)}
                        className="text-red-600 hover:text-red-800 text-sm flex items-center space-x-1"
                      >
                        <TrashIcon className="h-4 w-4" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                )}
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
                        href={attachmentUrls[attachment.id] || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center space-x-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm text-gray-700 transition"
                        onClick={async (e) => {
                          if (!attachmentUrls[attachment.id]) {
                            e.preventDefault();
                            try {
                              const url = await getAttachmentUrl(attachment);
                              setAttachmentUrls(prev => ({ ...prev, [attachment.id]: url }));
                              window.open(url, '_blank');
                            } catch (err) {
                              console.error('Failed to get attachment URL:', err);
                            }
                          }
                        }}
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

              {/* Replies Section - Only for Internal Notes (visible_to_client = false) and Admin users */}
              {!note.visible_to_client && userRole === 'admin' && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-900">
                      Replies ({note.replies?.length || 0})
                    </h4>
                    {!replyingToNote && (
                      <button
                        onClick={() => setReplyingToNote(note.id)}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center space-x-1"
                      >
                        <ChatBubbleLeftIcon className="h-4 w-4" />
                        <span>Add Reply</span>
                      </button>
                    )}
                  </div>

                  {/* Existing Replies */}
                  {note.replies && note.replies.length > 0 && (
                    <div className="space-y-4 mb-4">
                      {note.replies.map((reply) => (
                        <div key={reply.id} className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center space-x-2 mb-2">
                            <UserIcon className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-medium text-gray-900">
                              {reply.created_by_admin?.name || 'Admin'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {formatDate(reply.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.content}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reply Form */}
                  {replyingToNote === note.id && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <textarea
                        value={replyContent[note.id] || ''}
                        onChange={(e) => setReplyContent(prev => ({ ...prev, [note.id]: e.target.value }))}
                        placeholder="Write a reply..."
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black resize-y mb-3"
                      />
                      <div className="flex items-center space-x-2 justify-end">
                        <button
                          onClick={() => {
                            setReplyingToNote(null);
                            setReplyContent(prev => ({ ...prev, [note.id]: '' }));
                          }}
                          className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSubmitReply(note.id)}
                          disabled={!replyContent[note.id]?.trim() || submittingReply === note.id}
                          className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50 flex items-center space-x-2 text-sm"
                        >
                          <PaperAirplaneIcon className="h-4 w-4" />
                          <span>{submittingReply === note.id ? 'Sending...' : 'Send Reply'}</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

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
  );
}
