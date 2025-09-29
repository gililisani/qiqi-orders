'use client';

import { useState, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../ui/Card';

interface OrderDocumentUploadProps {
  orderId: string;
  onUploadComplete: () => void;
}

interface UploadingFile {
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
}

export default function OrderDocumentUpload({ orderId, onUploadComplete }: OrderDocumentUploadProps) {
  const [showUpload, setShowUpload] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const documentTypes = [
    { value: 'invoice', label: 'Invoice (NetSuite)' },
    { value: 'sales_order', label: 'Sales Order (NetSuite)' },
    { value: 'other', label: 'Other Document' }
  ];

  const handleFileSelect = (files: FileList | null) => {
    console.log('File select triggered, files:', files);
    
    if (!files || files.length === 0) {
      console.log('No files selected');
      return;
    }

    console.log('Processing files:', Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type })));

    try {
      const newUploadingFiles: UploadingFile[] = Array.from(files).map(file => ({
        file,
        progress: 0,
        status: 'uploading' as const
      }));

      console.log('Created uploading files:', newUploadingFiles);
      
      setUploadingFiles(prev => {
        const updated = [...prev, ...newUploadingFiles];
        console.log('Updated uploading files state:', updated);
        return updated;
      });
      
      setShowUpload(true);
      console.log('Show upload set to true');
    } catch (error) {
      console.error('Error in handleFileSelect:', error);
    }
  };

  const uploadFile = async (uploadingFile: UploadingFile, documentType: string, description: string) => {
    try {
      const file = uploadingFile.file;
      
      // Validate file type (only PDFs for now)
      if (file.type !== 'application/pdf') {
        throw new Error('Only PDF files are allowed');
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('File size must be less than 10MB');
      }

      // Get current user info first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Generate unique filename
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const filePath = `order-documents/${orderId}/${fileName}`;

      console.log('Attempting to upload file:', fileName, 'to path:', filePath);

      let uploadData;
      let uploadError;

      try {
        // Try to upload file to Supabase Storage
        const uploadResult = await supabase.storage
          .from('order-documents')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });
        
        uploadData = uploadResult.data;
        uploadError = uploadResult.error;
      } catch (storageError) {
        console.error('Storage error:', storageError);
        throw new Error('Storage system not available. Please contact admin to set up document storage.');
      }

      if (uploadError) {
        console.error('Upload error:', uploadError);
        if (uploadError.message.includes('bucket') || uploadError.message.includes('not found')) {
          throw new Error('Storage bucket not found. Please run the storage setup script in Supabase SQL Editor.');
        }
        throw uploadError;
      }

      console.log('File uploaded successfully:', uploadData);

      // Get user profile for name
      const { data: profile } = await supabase
        .from('admins')
        .select('name')
        .eq('id', user.id)
        .single();

      const userName = profile?.name || 'Admin';

      // Save document metadata to database
      const { error: dbError } = await supabase
        .from('order_documents')
        .insert({
          order_id: orderId,
          document_type: documentType,
          filename: file.name,
          file_path: filePath,
          file_size: file.size,
          mime_type: file.type,
          uploaded_by_id: user.id,
          uploaded_by_name: userName,
          uploaded_by_role: 'admin',
          description: description || null,
          is_public: true
        });

      if (dbError) throw dbError;

      // Add to order history
      await supabase
        .from('order_history')
        .insert({
          order_id: orderId,
          action_type: 'document_uploaded',
          document_type: documentType,
          document_filename: file.name,
          notes: `Document uploaded: ${file.name}`,
          changed_by_id: user.id,
          changed_by_name: userName,
          changed_by_role: 'admin',
          metadata: {
            file_size: file.size,
            mime_type: file.type,
            description: description
          }
        });

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  };

  const handleUpload = async (documentType: string, description: string) => {
    const results = await Promise.all(
      uploadingFiles.map(async (uploadingFile) => {
        const result = await uploadFile(uploadingFile, documentType, description);
        
        // Update the file status
        setUploadingFiles(prev => 
          prev.map(f => 
            f === uploadingFile 
              ? { ...f, status: result.success ? 'success' : 'error', error: result.error }
              : f
          )
        );

        return result;
      })
    );

    // Check if all uploads were successful
    const allSuccessful = results.every(r => r.success);
    
    if (allSuccessful) {
      // Close upload modal and refresh documents
      setTimeout(() => {
        setShowUpload(false);
        setUploadingFiles([]);
        onUploadComplete();
      }, 1500);
    }
  };

  const removeFile = (index: number) => {
    setUploadingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Debug logging
  console.log('OrderDocumentUpload render - showUpload:', showUpload, 'uploadingFiles:', uploadingFiles.length);

  return (
    <>
      {/* Upload Button */}
      <button
        onClick={() => {
          console.log('Upload button clicked');
          fileInputRef.current?.click();
        }}
        className="px-4 py-2 bg-blue-600 text-white rounded transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 font-sans text-sm"
      >
        Upload Documents
      </button>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />

      {/* Upload Modal */}
      {showUpload && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" 
          style={{ 
            zIndex: 9999,
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {console.log('Modal is rendering!')}
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-lg border-4 border-red-500">
            <div className="px-6 py-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900 font-sans">
                  Upload Documents
                </h2>
                <button
                  onClick={() => {
                    setShowUpload(false);
                    setUploadingFiles([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drag & Drop Area */}
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center mb-6 transition-colors ${
                  dragOver 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                  <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-gray-600 mb-2">Drag and drop PDF files here, or</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  browse files
                </button>
                <p className="text-sm text-gray-500 mt-2">Only PDF files, max 10MB each</p>
              </div>

              {/* File List */}
              {uploadingFiles.length > 0 && (
                <div className="space-y-4 mb-6">
                  <h3 className="font-medium text-gray-900 font-sans">Files to Upload:</h3>
                  {uploadingFiles.map((uploadingFile, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="flex-shrink-0">
                          {uploadingFile.status === 'uploading' && (
                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          )}
                          {uploadingFile.status === 'success' && (
                            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {uploadingFile.status === 'error' && (
                            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{uploadingFile.file.name}</p>
                          <p className="text-xs text-gray-500">
                            {(uploadingFile.file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                          {uploadingFile.error && (
                            <p className="text-xs text-red-500">{uploadingFile.error}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFile(index)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        disabled={uploadingFile.status === 'uploading'}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload Form */}
              {uploadingFiles.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">
                      Document Type
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-sans text-sm"
                    >
                      {documentTypes.map(type => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">
                      Description (Optional)
                    </label>
                    <textarea
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 font-sans text-sm"
                      placeholder="Add a description for these documents..."
                    />
                  </div>

                  <div className="flex justify-end space-x-3">
                    <button
                      onClick={() => {
                        setShowUpload(false);
                        setUploadingFiles([]);
                      }}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded transition hover:bg-gray-200 focus:ring-2 focus:ring-gray-300 font-sans text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        const documentType = (document.querySelector('select') as HTMLSelectElement)?.value || 'other';
                        const description = (document.querySelector('textarea') as HTMLTextAreaElement)?.value || '';
                        handleUpload(documentType, description);
                      }}
                      disabled={uploadingFiles.some(f => f.status === 'uploading')}
                      className="px-4 py-2 bg-blue-600 text-white rounded transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-sans text-sm"
                    >
                      Upload Files
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
