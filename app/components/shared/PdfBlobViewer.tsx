'use client';

/**
 * PdfBlobViewer — renders a PDF blob inline as canvases via pdfjs-dist.
 *
 * Browsers are unreliable about showing blob-URL PDFs in an <iframe> (some
 * show only a "download" placeholder), so we rasterize the pages ourselves —
 * same pdfjs worker setup the DAM bulk-upload preview uses.
 */

import { useEffect, useRef, useState } from 'react';
import { cn } from '../../../lib/utils';

interface PdfBlobViewerProps {
  blob: Blob;
  className?: string;
}

export function PdfBlobViewer({ blob, className }: PdfBlobViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setRendering(true);
        setError(null);

        const pdfjsLib = await import('pdfjs-dist');
        const pdfjsVersion = pdfjsLib.version || '5.4.394';
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

        const data = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data, useSystemFonts: true }).promise;
        if (cancelled) return;

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const containerWidth = container.clientWidth || 800;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;

          const unscaled = page.getViewport({ scale: 1 });
          // Render at container width × devicePixelRatio so text stays crisp.
          const scale = (containerWidth / unscaled.width) * dpr;
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas not supported.');

          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'block w-full h-auto bg-white shadow-sm rounded-sm';

          await page.render({ canvas, canvasContext: context, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to render PDF.');
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (error) {
    return (
      <p className={cn('text-sm text-destructive', className)}>
        Failed to display the PDF: {error}
      </p>
    );
  }

  return (
    <div className={cn('rounded-md border border-border bg-muted p-4', className)}>
      {rendering && (
        <p className="text-sm text-muted-foreground py-8 text-center">Rendering PDF…</p>
      )}
      <div ref={containerRef} className="mx-auto max-w-4xl space-y-4" />
    </div>
  );
}
