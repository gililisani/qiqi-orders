'use client';

/**
 * Order SLI preview — renders the EXACT PDF the download produces
 * (same SLIDocument, same bytes, shown in an iframe). The old HTML
 * renderer (lib/sliGenerator.ts) disagreed with the PDF on weights,
 * checkboxes, address and export date — audit 12.3. One renderer now.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import {
  generateAndDownloadSLIPDF,
  generateSLIPDFBlob,
} from '../../../../../lib/pdf/generators/sliPDFGenerator';
import type { SLIDocumentData } from '../../../../../lib/pdf/components/SLIDocument';

export default function SLIPreviewPage() {
  const params = useParams();
  const orderId = params.id as string;

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sliData, setSliData] = useState<SLIDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const response = await fetchWithAuth(`/api/orders/${orderId}/sli/data`);
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load SLI data');
        }
        const data: SLIDocumentData = await response.json();
        setSliData(data);
        const blob = await generateSLIPDFBlob(data);
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err: any) {
        setError(err.message || 'Failed to generate SLI preview.');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [orderId]);

  const handleDownloadPDF = async () => {
    if (!sliData) return;
    try {
      setGeneratingPDF(true);
      await generateAndDownloadSLIPDF(sliData);
    } catch (err: any) {
      setError('Failed to download PDF: ' + (err.message || 'unknown error'));
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Generating SLI…</p>
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
    <div className="fixed inset-0 flex flex-col">
      <div className="flex items-center justify-end gap-2 p-3 bg-gray-900">
        <button
          onClick={handleDownloadPDF}
          disabled={generatingPDF || !sliData}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {generatingPDF ? 'Downloading…' : 'Download PDF'}
        </button>
        <button
          onClick={() => window.close()}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Close
        </button>
      </div>
      {pdfUrl && (
        <iframe src={pdfUrl} title="SLI preview" className="flex-1 w-full border-0" />
      )}
    </div>
  );
}
