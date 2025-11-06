'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function StandaloneSLIPreviewPage() {
  const params = useParams();
  const sliId = params.id as string;
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    fetchSLIHTML();
  }, [sliId]);

  const fetchSLIHTML = async () => {
    try {
      const response = await fetch(`/api/sli/${sliId}/html`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch SLI');
      }
      
      const html = await response.text();
      setHtmlContent(html);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setGeneratingPDF(true);
      
      // Call server-side PDF generation API
      const response = await fetch(`/api/sli/${sliId}/pdf`);
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate PDF');
      }
      
      // Get the PDF blob
      const blob = await response.blob();
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `SLI-${sliId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading SLI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          .no-print {
            display: none !important;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }
      `}</style>
      
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-300 p-4 flex justify-between items-center z-50 shadow-sm">
        <h1 className="text-lg font-semibold">SLI Preview</h1>
        <div className="flex gap-2">
          <a
            href={`/admin/sli/${sliId}/edit`}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
          >
            Edit
          </a>
          <a
            href="/admin/sli/documents"
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition"
          >
            Back to Documents
          </a>
          <button
            onClick={handleDownloadPDF}
            disabled={generatingPDF}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
          >
            {generatingPDF ? 'Generating PDF...' : 'Download as PDF'}
          </button>
        </div>
      </div>
      
      <div className="no-print h-16"></div>
      
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </>
  );
}

