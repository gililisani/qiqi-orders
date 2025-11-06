'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useSupabase } from '../../../../../lib/supabase-provider';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function SLIPreviewPage() {
  const params = useParams();
  const orderId = params.id as string;
  const { supabase } = useSupabase();
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

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
    if (!contentRef.current) {
      alert('Content not ready for PDF generation');
      return;
    }

    try {
      setGeneratingPDF(true);

      // Hide the print:hidden elements temporarily
      const printHiddenElements = document.querySelectorAll('[class*="print:hidden"]');
      printHiddenElements.forEach((el: any) => {
        el.style.display = 'none';
      });

      // Capture the content as canvas
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Restore print:hidden elements
      printHiddenElements.forEach((el: any) => {
        el.style.display = '';
      });

      // Create PDF - A4 portrait
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      // Calculate dimensions
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = pdfWidth / imgWidth; // Scale to fit page width
      const scaledHeight = imgHeight * ratio;

      // Split across pages if content is taller than one page
      if (scaledHeight <= pdfHeight) {
        // Content fits on one page
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, scaledHeight);
      } else {
        // Content needs multiple pages - split the canvas
        // Calculate how many pixels fit on one PDF page
        const pixelsPerPDFPage = pdfHeight / ratio;
        const pageCount = Math.ceil(imgHeight / pixelsPerPDFPage);

        for (let i = 0; i < pageCount; i++) {
          if (i > 0) {
            pdf.addPage();
          }
          
          const sourceY = i * pixelsPerPDFPage;
          const sourceHeight = Math.min(pixelsPerPDFPage, imgHeight - sourceY);
          
          // Create a temporary canvas for this page slice
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = imgWidth;
          tempCanvas.height = sourceHeight;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceHeight, 0, 0, imgWidth, sourceHeight);
            const pageImgData = tempCanvas.toDataURL('image/png');
            const pageScaledHeight = sourceHeight * ratio;
            pdf.addImage(pageImgData, 'PNG', 0, 0, pdfWidth, pageScaledHeight);
          }
        }
      }

      // Get order number for filename
      const { data: order } = await supabase
        .from('orders')
        .select('invoice_number, so_number')
        .eq('id', orderId)
        .single();
      
      const filename = order?.invoice_number || order?.so_number || orderId.substring(0, 8);
      
      // Save PDF
      pdf.save(`SLI-${filename}.pdf`);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setGeneratingPDF(false);
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
    <div>
      {/* Print button - only visible on screen, hidden when printing */}
      <div className="print:hidden fixed top-4 right-4 z-50 space-x-2">
        <button
          onClick={handleDownloadPDF}
          disabled={generatingPDF}
          className="px-6 py-3 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-lg disabled:opacity-50"
        >
          {generatingPDF ? 'Generating PDF...' : 'Download as PDF'}
        </button>
        <button
          onClick={() => window.close()}
          className="px-6 py-3 bg-gray-600 text-white rounded hover:bg-gray-700 shadow-lg"
        >
          Close
        </button>
      </div>

      {/* SLI Content */}
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </div>
  );
}

