'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Download, Edit } from 'lucide-react';

import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Input } from '../../../components/qq/input';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { FormField } from '../../../components/qq/form-field';

function SLIPreviewContent() {
  const searchParams = useSearchParams();
  const tempId = searchParams.get('temp');

  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sliData, setSliData] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!tempId) {
      setError('No SLI data found.');
      setLoading(false);
      return;
    }
    const dataKey = `sli_${tempId}`;
    const stored = localStorage.getItem(dataKey);
    if (!stored) {
      setError('SLI data expired or not found.');
      setLoading(false);
      return;
    }
    try {
      const parsed = JSON.parse(stored);
      setSliData(parsed);
      generateHTML(parsed);
    } catch {
      setError('Invalid SLI data.');
      setLoading(false);
    }
  }, [tempId]);

  const generateHTML = async (data: any) => {
    try {
      setLoading(true);
      const res = await fetch('/api/sli/generate-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to generate SLI HTML.');
      }
      const { html } = await res.json();
      setHtmlContent(html);
    } catch (err: any) {
      setError(err.message || 'Failed to generate SLI.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = () => {
    if (!tempId) return;
    localStorage.setItem(`sli_${tempId}`, JSON.stringify(sliData));
    generateHTML(sliData);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (!tempId) return;
    const stored = localStorage.getItem(`sli_${tempId}`);
    if (stored) setSliData(JSON.parse(stored));
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Generating SLI…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isEditing && sliData) {
    return (
      <div className="px-6 py-8 space-y-6">
        <PageHeader title="Edit SLI" description="Update key fields and regenerate the document." />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Key fields</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField label="Consignee name">
              <Input
                value={sliData.consignee_name || ''}
                onChange={(e) => setSliData({ ...sliData, consignee_name: e.target.value })}
              />
            </FormField>
            <FormField label="Invoice number">
              <Input
                value={sliData.invoice_number || ''}
                onChange={(e) => setSliData({ ...sliData, invoice_number: e.target.value })}
              />
            </FormField>
            <FormField label="Instructions to forwarder">
              <textarea
                value={sliData.instructions_to_forwarder || ''}
                onChange={(e) =>
                  setSliData({ ...sliData, instructions_to_forwarder: e.target.value })
                }
                rows={3}
                className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              />
            </FormField>
          </CardContent>
        </Card>
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={handleCancelEdit}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit}>Save & regenerate</Button>
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

      <div className="px-6 py-8 space-y-6">
        <div className="no-print">
          <PageHeader
            title="SLI preview"
            description="Preview before saving — use the buttons to print or edit."
            actions={
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4" /> Edit
                </Button>
                <Button size="sm" onClick={() => window.print()}>
                  <Download className="h-4 w-4" /> Print / PDF
                </Button>
              </>
            }
          />
        </div>

        <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
      </div>
    </>
  );
}

export default function StandaloneSLIPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="px-6 py-8">
          <p className="text-sm text-muted-foreground">Loading SLI…</p>
        </div>
      }
    >
      <SLIPreviewContent />
    </Suspense>
  );
}
