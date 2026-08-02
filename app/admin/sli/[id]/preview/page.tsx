'use client';

/**
 * Standalone SLI preview — renders the EXACT PDF the download produces
 * (same SLIDocument, same bytes, shown in an iframe). The old HTML
 * renderer disagreed with the PDF on weights, checkboxes, address and
 * export date — audit 12.3. One renderer now.
 */

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Edit } from 'lucide-react';

import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../../components/qq/page-header';
import { Button } from '../../../../components/qq/button';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { useToast } from '../../../../components/ui/ToastProvider';
import {
  generateAndDownloadSLIPDF,
  generateSLIPDFBlob,
} from '../../../../../lib/pdf/generators/sliPDFGenerator';
import type { SLIDocumentData } from '../../../../../lib/pdf/components/SLIDocument';

export default function StandaloneSLIPreviewPage() {
  const params = useParams();
  const sliId = params.id as string;
  const toast = useToast();

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sliData, setSliData] = useState<SLIDocumentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    if (!sliId) return;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/sli/${sliId}/data`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch SLI.');
        }
        const data: SLIDocumentData = await res.json();
        setSliData(data);
        const blob = await generateSLIPDFBlob(data);
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      } catch (err: any) {
        setError(err.message || 'Failed to load SLI.');
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sliId]);

  const heading = useMemo(() => {
    if (sliData?.sli_number) return `SLI #${sliData.sli_number}`;
    if (sliId) return `SLI ${sliId.slice(0, 8)}`;
    return 'SLI preview';
  }, [sliData, sliId]);

  const handleDownloadPDF = async () => {
    if (!sliData) return;
    try {
      setGeneratingPDF(true);
      await generateAndDownloadSLIPDF(sliData);
    } catch (err: any) {
      toast.error('Failed to generate PDF: ' + (err.message || 'unknown error'));
    } finally {
      setGeneratingPDF(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading SLI…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link
          href="/admin/sli/documents"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to SLI documents
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/sli/documents"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to SLI documents
        </Link>
      </div>

      <PageHeader
        title={heading}
        description={sliData?.consignee_name || undefined}
        actions={
          <>
            <Link href={`/admin/sli/${sliId}/edit`}>
              <Button variant="outline" size="sm">
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </Link>
            <Button size="sm" onClick={handleDownloadPDF} loading={generatingPDF}>
              <Download className="h-4 w-4" />
              {generatingPDF ? 'Generating…' : 'Download PDF'}
            </Button>
          </>
        }
      />

      {pdfUrl && (
        <iframe
          src={pdfUrl}
          title="SLI preview"
          className="w-full h-[80vh] border border-border rounded-md bg-muted"
        />
      )}
    </div>
  );
}
