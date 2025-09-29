'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../ui/Card';

interface OrderDocument {
  id: string;
  document_type: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name: string;
  description?: string;
  created_at: string;
}

interface OrderDocumentsViewProps {
  orderId: string;
  role: 'admin' | 'client';
  onUploadComplete?: () => void;
}

export default function OrderDocumentsView({ orderId, role, onUploadComplete }: OrderDocumentsViewProps) {
  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewingDocument, setViewingDocument] = useState<OrderDocument | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);

  const documentTypeLabels: Record<string, string> = {
    invoice: 'Invoice (NetSuite)',
    sales_order: 'Sales Order (NetSuite)',
    other: 'Other Document'
  };

  const documentTypeColors: Record<string, string> = {
    invoice: 'bg-green-100 text-green-800',
    sales_order: 'bg-blue-100 text-blue-800',
    other: 'bg-gray-100 text-gray-800'
  };

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('order_documents')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (err: any) {
      console.error('Error fetching documents:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getDocumentUrl = async (document: OrderDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('order-documents')
        .createSignedUrl(document.file_path, 3600); // 1 hour expiry

      if (error) throw error;
      return data.signedUrl;
    } catch (err: any) {
      console.error('Error getting document URL:', err);
      throw err;
    }
  };

  const handleViewDocument = async (document: OrderDocument) => {
    try {
      const url = await getDocumentUrl(document);
      setDocumentUrl(url);
      setViewingDocument(document);
    } catch (err: any) {
      setError(`Failed to load document: ${err.message}`);
    }
  };

  const handleDownloadDocument = async (doc: OrderDocument) => {
    try {
      const url = await getDocumentUrl(doc);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setError(`Failed to download document: ${err.message}`);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    fetchDocuments();
  }, [orderId]);

  useEffect(() => {
    if (onUploadComplete) {
      onUploadComplete();
    }
  }, [onUploadComplete]);

  if (loading) {
    return (
      <Card>
        <div className="px-6 py-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600 font-sans">Loading documents...</span>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <div className="px-6 py-6">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-semibold text-gray-900 font-sans">
              Order Documents
            </h3>
            {role === 'admin' && (
              <div className="text-sm text-gray-500 font-sans">
                {documents.length} document{documents.length !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-800 text-sm font-sans">{error}</p>
            </div>
          )}

          {documents.length === 0 ? (
            <div className="text-center py-8">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5l7-7 3 3-7 7-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 22v-4a2 2 0 012-2h2m-4 6h6m-6 4h6m2 5l7-7 3 3-7 7-3-3z" />
              </svg>
              <p className="text-gray-500 font-sans">No documents uploaded yet</p>
              {role === 'client' && (
                <p className="text-sm text-gray-400 mt-1 font-sans">
                  Documents will appear here once uploaded by admin
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex-shrink-0">
                      <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <p className="text-sm font-medium text-gray-900 truncate font-sans">
                          {doc.filename}
                        </p>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${documentTypeColors[doc.document_type]}`}>
                          {documentTypeLabels[doc.document_type]}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{formatFileSize(doc.file_size)}</span>
                        <span>•</span>
                        <span>Uploaded by {doc.uploaded_by_name}</span>
                        <span>•</span>
                        <span>{formatDate(doc.created_at)}</span>
                      </div>
                      {doc.description && (
                        <p className="text-xs text-gray-600 mt-1 font-sans">{doc.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleViewDocument(doc)}
                      className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors font-sans"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDownloadDocument(doc)}
                      className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors font-sans"
                    >
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Document Viewer Modal */}
      {viewingDocument && documentUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 font-sans">
                {viewingDocument.filename}
              </h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleDownloadDocument(viewingDocument)}
                  className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-sans"
                >
                  Download
                </button>
                <button
                  onClick={() => {
                    setViewingDocument(null);
                    setDocumentUrl(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="h-[calc(90vh-80px)]">
              <iframe
                src={documentUrl}
                className="w-full h-full border-0"
                title={viewingDocument.filename}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
