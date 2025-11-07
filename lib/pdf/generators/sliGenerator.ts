import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface SLIData {
  sli_number?: number;
  invoice_number?: string;
  consignee_name?: string;
  consignee_address_line1?: string;
  consignee_address_line2?: string;
  consignee_country?: string;
  forwarding_agent_line1?: string;
  forwarding_agent_line2?: string;
  forwarding_agent_line3?: string;
  forwarding_agent_line4?: string;
  in_bond_code?: string;
  instructions_to_forwarder?: string;
  sli_date?: string;
  selected_products?: Array<{
    product_id: string;
    quantity: number;
    hs_code?: string;
    item_name?: string;
  }>;
}

/**
 * Generate SLI PDF from rendered HTML
 * Uses the existing HTML template and converts it to PDF
 */
export async function generateSLIPDF(
  htmlElement: HTMLElement,
  filename: string
): Promise<void> {
  try {
    // Capture the HTML element as canvas
    const canvas = await html2canvas(htmlElement, {
      scale: 2, // Higher quality
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
    });

    // Create PDF - A4 portrait
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const pdfWidth = 210; // A4 width in mm
    const pdfHeight = 297; // A4 height in mm
    
    // Convert canvas to image
    const imgData = canvas.toDataURL('image/png');
    
    // Calculate dimensions
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // Scale to fit A4 width
    const ratio = pdfWidth / (imgWidth * 0.264583 / 96); // Convert pixels to mm
    const scaledWidth = pdfWidth;
    const scaledHeight = (imgHeight * 0.264583 / 96) * ratio;

    // Check if content fits on one page
    if (scaledHeight <= pdfHeight) {
      // Single page
      pdf.addImage(imgData, 'PNG', 0, 0, scaledWidth, scaledHeight, undefined, 'FAST');
    } else {
      // Multiple pages - split the canvas
      const pagesNeeded = Math.ceil(scaledHeight / pdfHeight);
      const pixelsPerPage = imgHeight / pagesNeeded;

      for (let page = 0; page < pagesNeeded; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        const sourceY = page * pixelsPerPage;
        const sourceHeight = Math.min(pixelsPerPage, imgHeight - sourceY);

        // Create temporary canvas for this page slice
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidth;
        tempCanvas.height = sourceHeight;
        const ctx = tempCanvas.getContext('2d');
        
        if (ctx) {
          ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceHeight, 0, 0, imgWidth, sourceHeight);
          const pageImgData = tempCanvas.toDataURL('image/png');
          const pageScaledHeight = (sourceHeight * 0.264583 / 96) * ratio;
          pdf.addImage(pageImgData, 'PNG', 0, 0, scaledWidth, pageScaledHeight, undefined, 'FAST');
        }
      }
    }

    // Save the PDF
    pdf.save(filename);
  } catch (error) {
    console.error('Error generating SLI PDF:', error);
    throw error;
  }
}

/**
 * Download blob as file
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
