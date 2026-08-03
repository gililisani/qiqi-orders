'use client';

/**
 * SLIDocumentView — the ONE SLI viewer, used by:
 *   /admin/sli/[id]/preview        (standalone SLIs)
 *   /admin/orders/[id]/sli-preview (order SLIs, admin)
 *   /client/orders/[id]/sli        (order SLIs, client read-only)
 *
 * Fetches SLIDocumentData from `dataUrl`, generates the download's exact PDF
 * (same SLIDocument bytes — audit 12.3: never a second renderer) and shows it
 * inline via PdfBlobViewer, with Download as an action rather than the only
 * way to see the document.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download, Edit } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { PageHeader } from '../qq/page-header';
import { Button } from '../qq/button';
import { Alert, AlertDescription } from '../qq/alert';
import { useToast } from '../ui/ToastProvider';
import { PdfBlobViewer } from './PdfBlobViewer';
import {
  generateAndDownloadSLIPDF,
  generateSLIPDFBlob,
} from '../../../lib/pdf/generators/sliPDFGenerator';
import type { SLIDocumentData } from '../../../lib/pdf/components/SLIDocument';

interface SLIDocumentViewProps {
  /** Endpoint returning SLIDocumentData (admin or client-scoped route). */
  dataUrl: string;
  backUrl: string;
  backLabel: string;
  /** Admin-only edit link (standalone SLIs). */
  editHref?: string;
}

export function SLIDocumentView({
  dataUrl,
  backUrl,
  backLabel,
  editHref,
}: SLIDocumentViewProps) {
  const toast = useToast();

  const [sliData, setSliData] = useState<SLIDocumentData | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(dataUrl);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load SLI.');
        }
        const data: SLIDocumentData = await res.json();
        if (cancelled) return;
        setSliData(data);
        const blob = await generateSLIPDFBlob(data);
        if (cancelled) return;
        setPdfBlob(blob);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load SLI.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  const heading = useMemo(() => {
    if (sliData?.sli_number) return `SLI #${sliData.sli_number}`;
    return 'SLI document';
  }, [sliData]);

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

  const backLink = (
    <Link
      href={backUrl}
      className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4 mr-1" /> {backLabel}
    </Link>
  );

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
        {backLink}
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>{backLink}</div>

      <PageHeader
        title={heading}
        description={sliData?.consignee_name || undefined}
        actions={
          <>
            {editHref && (
              <Link href={editHref}>
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4" /> Edit
                </Button>
              </Link>
            )}
            <Button size="sm" onClick={handleDownloadPDF} loading={generatingPDF}>
              <Download className="h-4 w-4" />
              {generatingPDF ? 'Generating…' : 'Download PDF'}
            </Button>
          </>
        }
      />

      {pdfBlob && <PdfBlobViewer blob={pdfBlob} />}
    </div>
  );
}
