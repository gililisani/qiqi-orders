'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSupabase } from '../../../../../lib/supabase-provider';

export default function SLIPreviewPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { supabase } = useSupabase();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSLIHTML();
  }, [orderId]);

  const fetchSLIHTML = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/orders/${orderId}/sli/html`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate SLI');
      }

      const { html } = await response.json();
      setHtmlContent(html);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Not authenticated');
        return;
      }

      // Call server-side PDF generation API
      const response = await fetch(`/api/orders/${orderId}/sli/pdf`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      
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
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `SLI-${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Generating SLI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.close()}
            className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style jsx global>{`
        @media print {
          /* Hide all admin layout elements */
          nav,
          header,
          aside,
          [role="navigation"],
          [class*="sidenav"],
          [class*="sidebar"],
          [class*="breadcrumb"],
          [class*="navbar"],
          [class*="header"],
          [class*="admin-layout"],
          [class*="layout-wrapper"],
          [class*="sticky"],
          [class*="top-0"],
          /* Hide the print button */
          .print\\:hidden,
          button {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Reset body margins for printing */
          @page {
            margin: 0;
          }
          
          body {
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Hide everything except SLI content */
          body * {
            visibility: hidden;
          }
          
          /* Make SLI content visible and properly positioned */
          #sli-content,
          #sli-content * {
            visibility: visible !important;
          }
          
          #sli-content {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>
      
      <div>
        {/* Print button - only visible on screen, hidden when printing */}
        <div className="print:hidden fixed top-4 right-4 z-50 space-x-2">
          <button
            onClick={handleDownloadPDF}
            className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-lg"
          >
            Download as PDF
          </button>
          <button
            onClick={() => window.close()}
            className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 shadow-lg"
          >
            Close
          </button>
        </div>

        {/* SLI Content */}
        <div id="sli-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </>
  );
}
