'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AdminLayoutWrapper from '../../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../../config/admin-routes';

function SLIPreviewContent() {
  const searchParams = useSearchParams();
  const tempId = searchParams.get('temp');
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliData, setSliData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tempId) {
      setError('No SLI data found');
      setLoading(false);
      return;
    }

    // Retrieve data from localStorage
    const dataKey = `sli_${tempId}`;
    const storedData = localStorage.getItem(dataKey);
    
    if (!storedData) {
      setError('SLI data expired or not found');
      setLoading(false);
      return;
    }

    try {
      const parsedData = JSON.parse(storedData);
      setSliData(parsedData);
      generateHTML(parsedData);
    } catch (err) {
      console.error('Error parsing SLI data:', err);
      setError('Invalid SLI data');
      setLoading(false);
    }
  }, [tempId]);

  const generateHTML = async (data: any) => {
    try {
      setLoading(true);
      
      // Generate HTML directly from template
      const response = await fetch('/api/sli/generate-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate SLI HTML');
      }

      const { html } = await response.json();
      setHtmlContent(html);
    } catch (err: any) {
      console.error('Error generating HTML:', err);
      setError(err.message || 'Failed to generate SLI');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = () => {
    window.print();
  };

  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    // Re-generate HTML with updated data
    if (tempId) {
      const dataKey = `sli_${tempId}`;
      localStorage.setItem(dataKey, JSON.stringify(sliData));
      generateHTML(sliData);
      setIsEditing(false);
    }
  };

  const handleCancelEdit = () => {
    // Reload from localStorage
    if (tempId) {
      const dataKey = `sli_${tempId}`;
      const storedData = localStorage.getItem(dataKey);
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        setSliData(parsedData);
      }
    }
    setIsEditing(false);
  };

  if (loading) {
    return (
      <AdminLayoutWrapper routes={adminRoutes}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg">Generating SLI...</div>
        </div>
      </AdminLayoutWrapper>
    );
  }

  if (error) {
    return (
      <AdminLayoutWrapper routes={adminRoutes}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-red-600 text-lg">{error}</div>
        </div>
      </AdminLayoutWrapper>
    );
  }

  if (isEditing && sliData) {
    return (
      <AdminLayoutWrapper routes={adminRoutes}>
        <div className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-md p-6">
            <h1 className="text-2xl font-bold mb-6">Edit SLI</h1>
            
            {/* Simple edit form - just key fields */}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2">Consignee Name</label>
                <input
                  type="text"
                  value={sliData.consignee_name || ''}
                  onChange={(e) => setSliData({...sliData, consignee_name: e.target.value})}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Invoice Number</label>
                <input
                  type="text"
                  value={sliData.invoice_number || ''}
                  onChange={(e) => setSliData({...sliData, invoice_number: e.target.value})}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Instructions to Forwarder</label>
                <textarea
                  value={sliData.instructions_to_forwarder || ''}
                  onChange={(e) => setSliData({...sliData, instructions_to_forwarder: e.target.value})}
                  className="w-full px-3 py-2 border rounded"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleSaveEdit}
                className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Save & Regenerate
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-6 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </AdminLayoutWrapper>
    );
  }

  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <div className="p-6">
        <div className="mb-4 flex gap-4 print:hidden">
          <button
            onClick={handleDownloadPDF}
            className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800"
          >
            Download as PDF
          </button>
          <button
            onClick={handleEdit}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Edit SLI
          </button>
        </div>
        
        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>

      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden;
          }
          ${contentRef.current ? `
          #${contentRef.current.id},
          #${contentRef.current.id} * {
            visibility: visible;
          }
          #${contentRef.current.id} {
            position: absolute;
            left: 0;
            top: 0;
          }
          ` : ''}
        }
      `}</style>
    </AdminLayoutWrapper>
  );
}

export default function StandaloneSLIPreviewPage() {
  return (
    <Suspense fallback={
      <AdminLayoutWrapper routes={adminRoutes}>
        <div className="flex items-center justify-center h-screen">
          <div className="text-lg">Loading SLI...</div>
        </div>
      </AdminLayoutWrapper>
    }>
      <SLIPreviewContent />
    </Suspense>
  );
}

