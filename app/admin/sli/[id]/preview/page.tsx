'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Edit } from 'lucide-react';

import { PageHeader } from '../../../../components/qq/page-header';
import { Button } from '../../../../components/qq/button';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { useToast } from '../../../../components/ui/ToastProvider';
import { generateAndDownloadSLIPDF } from '../../../../../lib/pdf/generators/sliPDFGenerator';
import type { SLIDocumentData } from '../../../../../lib/pdf/components/SLIDocument';

export default function StandaloneSLIPreviewPage() {
  const params = useParams();
  const sliId = params.id as string;
  const toast = useToast();

  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [sliData, setSliData] = useState<SLIDocumentData | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sliId) return;
    (async () => {
      try {
        const [htmlRes, dataRes] = await Promise.all([
          fetch(`/api/sli/${sliId}/html`),
          fetch(`/api/sli/${sliId}/data`),
        ]);
        if (!htmlRes.ok) {
          const data = await htmlRes.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to fetch SLI.');
        }
        setHtmlContent(await htmlRes.text());
        if (dataRes.ok) {
          setSliData(await dataRes.json());
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load SLI.');
      } finally {
        setLoading(false);
      }
    })();
  }, [sliId]);

  const heading = useMemo(() => {
    if (sliData?.sli_number) return `SLI #${sliData.sli_number}`;
    if (sliId) return `SLI ${sliId.slice(0, 8)}`;
    return 'SLI preview';
  }, [sliData, sliId]);

  const handleDownloadPDF = async () => {
    try {
      setGeneratingPDF(true);
      let data = sliData;
      if (!data) {
        const res = await fetch(`/api/sli/${sliId}/data`);
        if (!res.ok) {
          const error = await res.json();
          throw new Error(error.error || 'Failed to fetch SLI data.');
        }
        data = await res.json();
        setSliData(data);
      }
      if (!data) throw new Error('SLI data is unavailable.');
      await generateAndDownloadSLIPDF(data);
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

      <div className="px-6 py-8 space-y-6">
        <div className="no-print">
          <Link
            href="/admin/sli/documents"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back to SLI documents
          </Link>
        </div>

        <div className="no-print">
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
        </div>

        <div
          ref={contentRef}
          id="sli-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </>
  );
}
