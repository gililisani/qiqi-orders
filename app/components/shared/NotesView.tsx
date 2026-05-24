'use client';

/**
 * NotesView — shared between admin (/admin/companies/[id]/notes) and
 * client (/client/notes). Role-specific behavior is driven by prop flags
 * (showActions / allowEdit / allowDelete / allowCreate), so the same
 * file serves both surfaces without role branching beyond the data
 * fetch (clients only see notes flagged visible_to_client).
 */

import { useEffect, useState, useCallback } from 'react';
import {
  FileText,
  Calendar,
  User,
  Plus,
  Pencil,
  Trash2,
  MessageCircle,
  Send,
  Lock,
} from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import NoteForm from './NoteForm';

import { Card, CardContent } from '../qq/card';
import { Button } from '../qq/button';
import { Badge } from '../qq/badge';
import { Alert, AlertDescription } from '../qq/alert';
import { EmptyState } from '../qq/empty-state';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

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
  categoryFilter?: string;
  timeFilter?: 'all' | '30days' | '3months' | 'ytd';
}

const NOTE_TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  webinar: 'Webinar',
  event: 'Event',
  feedback: 'Feedback',
  general_note: 'General note',
  internal_note: 'Internal note',
};

const NOTE_TYPE_VARIANT: Record<
  string,
  'default' | 'accent' | 'success' | 'warning' | 'muted' | 'destructive'
> = {
  meeting: 'accent',
  webinar: 'accent',
  event: 'success',
  feedback: 'warning',
  general_note: 'muted',
  internal_note: 'destructive',
};

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
  timeFilter = 'all',
}: NotesViewProps) {
  const toast = useToast();
  const confirm = useConfirm();

  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const [replyingToNote, setReplyingToNote] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<string | null>(null);
  const [readNotes, setReadNotes] = useState<Set<string>>(new Set());

  // ------------- Filters -------------
  const getEffectiveDate = (note: Note): Date => {
    if (!note.visible_to_client && note.replies && note.replies.length > 0) {
      const latestReply = note.replies.reduce((latest, reply) =>
        new Date(reply.created_at) > new Date(latest.created_at) ? reply : latest
      );
      const latestReplyDate = new Date(latestReply.created_at);
      const noteCreatedDate = new Date(note.created_at);
      return latestReplyDate > noteCreatedDate ? latestReplyDate : noteCreatedDate;
    }
    return new Date(note.created_at);
  };

  const applyFilters = useCallback(() => {
    let filtered = [...allNotes];
    if (categoryFilter && categoryFilter !== 'all') {
      filtered = filtered.filter((n) => n.note_type === categoryFilter);
    }
    if (timeFilter && timeFilter !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      let cutoff: Date;
      switch (timeFilter) {
        case '30days':
          cutoff = new Date(today);
          cutoff.setDate(cutoff.getDate() - 30);
          break;
        case '3months':
          cutoff = new Date(today);
          cutoff.setMonth(cutoff.getMonth() - 3);
          break;
        case 'ytd':
          cutoff = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          cutoff = new Date(0);
      }
      filtered = filtered.filter((n) => getEffectiveDate(n) >= cutoff);
    }
    setNotes(filtered);
  }, [allNotes, categoryFilter, timeFilter]);

  useEffect(() => {
    if (companyId) fetchNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  // ------------- Data -------------
  const getAttachmentUrl = async (attachment: Attachment): Promise<string> => {
    const { data, error } = await supabase.storage
      .from('company-notes')
      .createSignedUrl(attachment.file_path, 3600);
    if (error) throw error;
    return data.signedUrl;
  };

  const fetchNotes = async () => {
    try {
      let query = supabase
        .from('company_notes')
        .select(`*, attachments:note_attachments(*)`)
        .eq('company_id', companyId);
      if (userRole === 'client') {
        query = query.eq('visible_to_client', true);
      }
      const { data: notesData, error: notesError } = await query.order('created_at', {
        ascending: false,
      });
      if (notesError) throw notesError;

      if (notesData && notesData.length > 0) {
        const creatorIds = [...new Set(notesData.map((n: Note) => n.created_by))];
        const { data: adminsData } = await supabase
          .from('admins')
          .select('id, name')
          .in('id', creatorIds);
        const adminsMap = new Map(
          (adminsData || []).map((a: { id: string; name: string }) => [a.id, a.name])
        );
        notesData.forEach((n: Note) => {
          const name = adminsMap.get(n.created_by);
          n.created_by_admin = name ? { name } : null;
        });
      }

      if (userRole === 'admin' && notesData) {
        const internalNoteIds = notesData
          .filter((n: Note) => !n.visible_to_client)
          .map((n: Note) => n.id);
        if (internalNoteIds.length > 0) {
          const { data: repliesData, error: repliesError } = await supabase
            .from('note_replies')
            .select('*')
            .in('note_id', internalNoteIds)
            .order('created_at', { ascending: true });
          if (!repliesError && repliesData) {
            const replyCreatorIds = [
              ...new Set(repliesData.map((r: NoteReply) => r.created_by)),
            ];
            const { data: replyAdminsData } = await supabase
              .from('admins')
              .select('id, name')
              .in('id', replyCreatorIds);
            const replyAdminsMap = new Map(
              (replyAdminsData || []).map((a: { id: string; name: string }) => [a.id, a.name])
            );
            repliesData.forEach((r: NoteReply) => {
              const name = replyAdminsMap.get(r.created_by);
              r.created_by_admin = name ? { name } : null;
            });
            notesData.forEach((n: Note) => {
              n.replies = repliesData.filter((r: NoteReply) => r.note_id === n.id);
            });
          }
        }
      }

      setAllNotes(notesData || []);

      if (userRole === 'client') {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: viewsData } = await supabase
            .from('client_note_views')
            .select('note_id')
            .eq('client_id', user.id)
            .in('note_id', (notesData || []).map((n) => n.id));
          setReadNotes(new Set((viewsData || []).map((v) => v.note_id)));
        }
      }

      // Pre-sign attachments
      const urlMap: Record<string, string> = {};
      await Promise.all(
        (notesData || []).flatMap((n) =>
          (n.attachments || []).map(async (a: Attachment) => {
            try {
              urlMap[a.id] = await getAttachmentUrl(a);
            } catch {
              urlMap[a.id] = '#';
            }
          })
        )
      );
      setAttachmentUrls(urlMap);
    } catch (err: any) {
      setError(err.message || 'Failed to load notes.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (note: Note) => {
    const ok = await confirm({
      title: 'Delete note?',
      description: `Permanently delete "${note.title}". This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('company_notes').delete().eq('id', note.id);
      if (error) throw error;
      toast.success('Note deleted.');
      fetchNotes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete note.');
    }
  };

  const handleFormSuccess = async () => {
    await fetchNotes();
    setShowCreateForm(false);
    setEditingNote(null);
  };

  const handleSubmitReply = async (noteId: string) => {
    const content = replyContent[noteId]?.trim();
    if (!content) return;
    setSubmittingReply(noteId);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');
      const { error } = await supabase
        .from('note_replies')
        .insert({ note_id: noteId, content, created_by: user.id });
      if (error) throw error;
      setReplyContent((prev) => ({ ...prev, [noteId]: '' }));
      setReplyingToNote(null);
      await fetchNotes();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit reply.');
    } finally {
      setSubmittingReply(null);
    }
  };

  const handleMarkAsRead = async (noteId: string, isRead: boolean) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');
      if (isRead) {
        const { error } = await supabase
          .from('client_note_views')
          .upsert(
            { client_id: user.id, note_id: noteId, viewed_at: new Date().toISOString() },
            { onConflict: 'client_id,note_id' }
          );
        if (error) throw error;
        setReadNotes((prev) => new Set([...prev, noteId]));
      } else {
        const { error } = await supabase
          .from('client_note_views')
          .delete()
          .eq('client_id', user.id)
          .eq('note_id', noteId);
        if (error) throw error;
        setReadNotes((prev) => {
          const next = new Set(prev);
          next.delete(noteId);
          return next;
        });
      }
      window.dispatchEvent(new Event('notesViewed'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to update note status.');
    }
  };

  // ------------- Render -------------
  if (loading) {
    return (
      <p className={`text-sm text-muted-foreground ${className}`}>Loading notes…</p>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className={className}>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={className}>
      {showActions && allowCreate && (
        <div className="flex items-center justify-end mb-4">
          <Button size="sm" onClick={() => setShowCreateForm(true)}>
            <Plus className="h-4 w-4" /> Add note
          </Button>
        </div>
      )}

      {notes.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="No notes yet"
            description={
              userRole === 'admin'
                ? 'Document meetings, webinars, events, and feedback for this company.'
                : 'No notes have been shared with your company yet.'
            }
            action={
              allowCreate ? (
                <Button size="sm" onClick={() => setShowCreateForm(true)}>
                  <Plus className="h-4 w-4" /> Create first note
                </Button>
              ) : undefined
            }
            className="border-0 shadow-none"
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <Card key={note.id}>
              <CardContent className="p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {note.title}
                    </h3>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                      <Badge variant={NOTE_TYPE_VARIANT[note.note_type] || 'muted'}>
                        {NOTE_TYPE_LABELS[note.note_type] || note.note_type}
                      </Badge>
                      {!note.visible_to_client && userRole === 'admin' && (
                        <Badge variant="destructive" className="gap-1">
                          <Lock className="h-3 w-3" /> Internal
                        </Badge>
                      )}
                      {note.meeting_date && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(note.meeting_date).toLocaleDateString()}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1">
                        <User className="h-3.5 w-3.5" />
                        {note.created_by_admin?.name
                          ? `By ${note.created_by_admin.name}`
                          : userRole === 'client'
                            ? 'By Qiqi'
                            : 'Created'}
                        {' · '}
                        {formatDate(note.created_at)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {showActions && (allowEdit || allowDelete) && (
                      <div className="flex items-center gap-1">
                        {allowEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingNote(note)}
                          >
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                        )}
                        {allowDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteNote(note)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        )}
                      </div>
                    )}

                    {userRole === 'client' && (
                      <label className="flex items-center gap-2 cursor-pointer select-none text-xs">
                        <input
                          type="checkbox"
                          checked={readNotes.has(note.id)}
                          onChange={(e) => handleMarkAsRead(note.id, e.target.checked)}
                          className="h-4 w-4 accent-foreground"
                        />
                        <span>Mark as read</span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Body */}
                <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>

                {/* Attachments */}
                {note.attachments && note.attachments.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      Attachments
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {note.attachments.map((a) => (
                        <a
                          key={a.id}
                          href={attachmentUrls[a.id] || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/80 rounded-md text-xs text-foreground transition-colors"
                          onClick={async (e) => {
                            if (!attachmentUrls[a.id]) {
                              e.preventDefault();
                              try {
                                const url = await getAttachmentUrl(a);
                                setAttachmentUrls((prev) => ({ ...prev, [a.id]: url }));
                                window.open(url, '_blank');
                              } catch (err) {
                                console.error(err);
                              }
                            }
                          }}
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span className="font-medium">{a.file_name}</span>
                          <span className="text-muted-foreground">
                            ({(a.file_size / 1024).toFixed(1)} KB)
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Replies — admins only, internal notes only */}
                {!note.visible_to_client && userRole === 'admin' && (
                  <div className="mt-5 pt-4 border-t border-border">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Replies ({note.replies?.length || 0})
                      </p>
                      {replyingToNote !== note.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReplyingToNote(note.id)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" /> Reply
                        </Button>
                      )}
                    </div>

                    {note.replies && note.replies.length > 0 && (
                      <div className="space-y-3 mb-3">
                        {note.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="bg-muted/40 border border-border rounded-md p-3"
                          >
                            <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                              <User className="h-3.5 w-3.5" />
                              <span className="font-medium text-foreground">
                                {reply.created_by_admin?.name || 'Admin'}
                              </span>
                              <span>·</span>
                              <span>{formatDate(reply.created_at)}</span>
                            </div>
                            <p className="text-sm text-foreground whitespace-pre-wrap">
                              {reply.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {replyingToNote === note.id && (
                      <div className="bg-muted/40 border border-border rounded-md p-3 space-y-2">
                        <textarea
                          value={replyContent[note.id] || ''}
                          onChange={(e) =>
                            setReplyContent((prev) => ({ ...prev, [note.id]: e.target.value }))
                          }
                          placeholder="Write a reply…"
                          rows={3}
                          className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 resize-y"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setReplyingToNote(null);
                              setReplyContent((prev) => ({ ...prev, [note.id]: '' }));
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleSubmitReply(note.id)}
                            disabled={
                              !replyContent[note.id]?.trim() || submittingReply === note.id
                            }
                            loading={submittingReply === note.id}
                          >
                            <Send className="h-3.5 w-3.5" /> Send
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
