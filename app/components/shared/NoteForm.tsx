'use client';

import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { XMarkIcon, PaperClipIcon, DocumentIcon } from '@heroicons/react/24/outline';

interface NoteFormProps {
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
  editNote?: {
    id: string;
    title: string;
    content: string;
    note_type: 'meeting' | 'webinar' | 'event' | 'feedback' | 'general_note' | 'internal_note';
    meeting_date: string | null;
    visible_to_client?: boolean;
    attachments: any[];
  };
}

interface Attachment {
  file: File;
  id: string;
}

export default function NoteForm({ companyId, onClose, onSuccess, editNote }: NoteFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVisibilityWarning, setShowVisibilityWarning] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<React.FormEvent<HTMLFormElement> | null>(null);
  const [formData, setFormData] = useState({
    title: editNote?.title || '',
    content: editNote?.content || '',
    note_type: editNote?.note_type || 'meeting' as 'meeting' | 'webinar' | 'event' | 'feedback' | 'general_note' | 'internal_note',
    meeting_date: editNote?.meeting_date || '',
    visible_to_client: editNote?.visible_to_client !== undefined ? editNote.visible_to_client : true
  });
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'visible_to_client') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({
        ...prev,
        [name]: checked
      }));
    } else if (name === 'note_type') {
      // Auto-set visible_to_client based on note type
      const newNoteType = value as 'meeting' | 'webinar' | 'event' | 'feedback' | 'general_note' | 'internal_note';
      setFormData(prev => ({
        ...prev,
        [name]: newNoteType,
        visible_to_client: newNoteType === 'internal_note' ? false : prev.visible_to_client
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }));
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newAttachments = files.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9)
    }));
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const uploadFile = async (file: File): Promise<string> => {
    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
    const filePath = `note-attachments/${companyId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('company-notes')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
        throw new Error('Storage bucket not found. Please run the company notes storage setup script in Supabase SQL Editor.');
      }
      throw uploadError;
    }

    return filePath;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Show warning whenever visible_to_client is checked (as per requirement)
    if (formData.visible_to_client) {
      setPendingSubmit(e as React.FormEvent<HTMLFormElement>);
      setShowVisibilityWarning(true);
      return;
    }

    await performSubmit(e);
  };

  const performSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setShowVisibilityWarning(false);

    try {
      // First, upload all attachments before creating the note
      let uploadedAttachments: { file: File; filePath: string }[] = [];
      
      if (attachments.length > 0) {
        // Upload all files first
        for (const attachment of attachments) {
          try {
            const filePath = await uploadFile(attachment.file);
            uploadedAttachments.push({
              file: attachment.file,
              filePath: filePath
            });
          } catch (uploadError: any) {
            // If any attachment fails, clean up already uploaded files
            for (const uploaded of uploadedAttachments) {
              try {
                await supabase.storage
                  .from('company-notes')
                  .remove([uploaded.filePath]);
              } catch (cleanupError) {
                console.warn('Failed to cleanup uploaded file:', cleanupError);
              }
            }
            throw new Error(`Failed to upload ${attachment.file.name}: ${uploadError.message}`);
          }
        }
      }

      // Create or update the note only after all attachments are uploaded
      let noteId: string;
      
      if (editNote) {
        // Update existing note
        const { data, error } = await supabase
          .from('company_notes')
          .update({
            title: formData.title,
            content: formData.content,
            note_type: formData.note_type,
            meeting_date: formData.meeting_date || null,
            visible_to_client: formData.visible_to_client
          })
          .eq('id', editNote.id)
          .select('id')
          .single();

        if (error) throw error;
        noteId = data.id;
      } else {
        // Create new note
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data, error } = await supabase
          .from('company_notes')
          .insert({
            company_id: companyId,
            title: formData.title,
            content: formData.content,
            note_type: formData.note_type,
            meeting_date: formData.meeting_date || null,
            visible_to_client: formData.visible_to_client,
            created_by: user.id
          })
          .select('id')
          .single();

        if (error) throw error;
        noteId = data.id;
      }

      // Save attachment metadata to database
      if (uploadedAttachments.length > 0) {
        const attachmentPromises = uploadedAttachments.map(async (attachment) => {
          return supabase
            .from('note_attachments')
            .insert({
              note_id: noteId,
              file_name: attachment.file.name,
              file_path: attachment.filePath,
              file_size: attachment.file.size,
              file_type: attachment.file.type
            });
        });

        const results = await Promise.all(attachmentPromises);
        const errors = results.filter(result => result.error);
        
        if (errors.length > 0) {
          // If database insert fails, clean up uploaded files
          for (const uploaded of uploadedAttachments) {
            try {
              await supabase.storage
                .from('company-notes')
                .remove([uploaded.filePath]);
            } catch (cleanupError) {
              console.warn('Failed to cleanup uploaded file:', cleanupError);
            }
          }
          throw new Error('Failed to save attachment metadata to database');
        }
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setPendingSubmit(null);
    }
  };

  const handleConfirmVisibility = () => {
    if (pendingSubmit) {
      performSubmit(pendingSubmit);
    }
  };

  const handleCancelVisibility = () => {
    setShowVisibilityWarning(false);
    setPendingSubmit(null);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {editNote ? 'Edit Note' : 'Create New Note'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {/* Visibility Warning Modal */}
          {showVisibilityWarning && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
              <div className="bg-white rounded-lg max-w-md w-full p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirm Visibility</h3>
                <p className="text-gray-700 mb-6">
                  This note will be visible to the Company. Are you sure you want to proceed?
                </p>
                <div className="flex space-x-4 justify-end">
                  <button
                    type="button"
                    onClick={handleCancelVisibility}
                    className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmVisibility}
                    className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
                  >
                    Yes, Proceed
                  </button>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Note Type *
                </label>
                <select
                  name="note_type"
                  value={formData.note_type}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="meeting">🤝 Meeting</option>
                  <option value="webinar">📹 Webinar</option>
                  <option value="event">🎉 Event</option>
                  <option value="feedback">💬 Feedback</option>
                  <option value="general_note">📝 General Note</option>
                  <option value="internal_note">🔒 Internal Note</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Meeting/Event Date
                </label>
                <input
                  type="date"
                  name="meeting_date"
                  value={formData.meeting_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Title *
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                placeholder="Enter note title..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content *
              </label>
              <textarea
                name="content"
                value={formData.content}
                onChange={handleChange}
                required
                rows={8}
                placeholder="Enter note content..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="visible_to_client"
                  checked={formData.visible_to_client}
                  onChange={handleChange}
                  disabled={formData.note_type === 'internal_note'}
                  className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <span className="text-sm font-medium text-gray-700">
                  Visible to Client
                </span>
              </label>
              <p className="text-xs text-gray-500 mt-1 ml-6">
                {formData.note_type === 'internal_note' 
                  ? 'Internal Notes are always hidden from clients.' 
                  : 'If unchecked, this note will only be visible to admins and will not be shown to clients.'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Attachments
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center space-x-2 text-gray-600 hover:text-gray-800"
                >
                  <PaperClipIcon className="h-5 w-5" />
                  <span>Upload Files</span>
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  PDF, DOC, DOCX, JPG, PNG, GIF (max 10MB each)
                </p>
              </div>

              {attachments.length > 0 && (
                <div className="mt-3 space-y-2">
                  {attachments.map((attachment) => (
                    <div key={attachment.id} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <div className="flex items-center space-x-2">
                        <DocumentIcon className="h-4 w-4 text-gray-500" />
                        <span className="text-sm text-gray-700">{attachment.file.name}</span>
                        <span className="text-xs text-gray-500">
                          ({(attachment.file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeAttachment(attachment.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex space-x-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Saving...' : (editNote ? 'Update Note' : 'Create Note')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
