'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export default function StandaloneSLIPreviewPage() {
  const params = useParams();
  const sliId = params.id as string;
  const [htmlContent, setHtmlContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSLIHTML();
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

  const handleDownloadPDF = async () => {
    if (!contentRef.current) {
      alert('Content not ready for PDF generation');
      return;
    }

    try {
      setGeneratingPDF(true);

      // Hide the no-print elements temporarily
      const noPrintElements = document.querySelectorAll('.no-print');
      noPrintElements.forEach((el: any) => {
        el.style.display = 'none';
      });

      // Capture the content as canvas
      const canvas = await html2canvas(contentRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
      });

      // Restore no-print elements
      noPrintElements.forEach((el: any) => {
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

      // Get SLI number for filename - extract from HTML or use ID
      let sliNumber = sliId.substring(0, 8);
      const sliNumberMatch = htmlContent.match(/SLI Number[:\s]*(\d+)/i);
      if (sliNumberMatch) {
        sliNumber = sliNumberMatch[1];
      }
      
      // Save PDF
      pdf.save(`SLI-${sliNumber}.pdf`);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

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
      
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-gray-300 p-4 flex justify-between items-center z-50 shadow-sm">
        <h1 className="text-lg font-semibold">SLI Preview</h1>
        <div className="flex gap-2">
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
      
      <div className="no-print h-16"></div>
      
      <div ref={contentRef} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    </>
  );
}

