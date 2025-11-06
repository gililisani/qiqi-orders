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

  const handlePrint = () => {
    window.print();
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
    <div>
      {/* Print button - only visible on screen, hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50 space-x-2">
        <button
          onClick={handlePrint}
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
      <div dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}
