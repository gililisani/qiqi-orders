'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { generateAndDownloadSLIPDF } from '../../../../../lib/pdf/generators/sliPDFGenerator';
import type { SLIDocumentData } from '../../../../../lib/pdf/components/SLIDocument';

export default function StandaloneSLIPreviewPage() {
  const params = useParams();
  const sliId = params.id as string;
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [sliData, setSliData] = useState<SLIDocumentData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSLIHTML();
    fetchSLIMetadata();
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

  const fetchSLIMetadata = async () => {
    try {
      const response = await fetch(`/api/sli/${sliId}/data`);
      if (!response.ok) return;

      const data: SLIDocumentData = await response.json();
      setSliData(data);
    } catch (err) {
      console.error('Error fetching SLI metadata:', err);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      setGeneratingPDF(true);

      let data = sliData;

      if (!data) {
        const response = await fetch(`/api/sli/${sliId}/data`);
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to fetch SLI data');
        }

        data = await response.json();
        setSliData(data);
      }

      if (!data) {
        throw new Error('SLI data is unavailable');
      }

      await generateAndDownloadSLIPDF(data);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

  const heading = useMemo(() => {
    if (sliData) {
      const parts: string[] = [];
      if (sliData.sli_number) {
        parts.push(`SLI #${sliData.sli_number}`);
      }
      if (sliData.consignee_name) {
        parts.push(sliData.consignee_name);
      }
      if (parts.length) {
        return parts.join(' – ');
      }
    }
    return 'SLI Preview';
  }, [sliData]);

  const breadcrumbItems = useMemo(() => {
    return [
      { label: 'SLI Documents', href: '/admin/sli/documents' },
      { label: heading },
    ];
  }, [heading]);

  useEffect(() => {
    const setBreadcrumbs = () => {
      if ((window as any).__setBreadcrumbs) {
        try {
          (window as any).__setBreadcrumbs(breadcrumbItems);
        } catch (err) {
          console.error('Error setting breadcrumbs:', err);
        }
      }
    };

    setBreadcrumbs();
    const timeoutId = setTimeout(setBreadcrumbs, 100);

    return () => {
      clearTimeout(timeoutId);
      if ((window as any).__setBreadcrumbs) {
        try {
          (window as any).__setBreadcrumbs([]);
        } catch (err) {
          // ignore
        }
      }
    };
  }, [breadcrumbItems]);

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

      <div className="mt-8 mb-4 space-y-6">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-semibold text-gray-900">{heading}</h2>
          <div className="no-print flex flex-wrap gap-2 sm:justify-end">
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

        <div className="mx-auto w-full max-w-5xl px-6">
          <div ref={contentRef} id="sli-content" dangerouslySetInnerHTML={{ __html: htmlContent }} />
        </div>
      </div>
    </>
  );
}
